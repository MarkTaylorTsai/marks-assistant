const database = require('../../lib/database');
const security = require('../../lib/security');
const reminderScheduler = require('../../lib/reminder-scheduler');

module.exports = async (req, res) => {
  console.log('🔍 Task update endpoint accessed:', {
    method: req.method,
    url: req.url,
    taskId: req.query.id,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });

  // Set security headers
  security.setSecurityHeaders(res);
  
  // Apply rate limiting
  const rateLimitResult = security.rateLimit(req, res);
  if (rateLimitResult === false) {
    return; // Response already sent by rate limiting
  }

  // Only allow PUT and PATCH requests
  if (!['PUT', 'PATCH'].includes(req.method)) {
    console.log('❌ Invalid request method for task update:', req.method);
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['PUT', 'PATCH']
    });
  }

  try {
    // Validate request size
    security.validateRequestSize(req, 1024 * 1024); // 1MB limit
    
    const taskId = req.query.id;
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    // Validate task ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    // Get user ID from headers (you may need to implement authentication)
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'User ID is required in x-user-id header' });
    }

    // Validate user ID format
    if (!database.isValidUserId(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Parse and validate update data
    const updateData = req.body;
    if (!updateData || typeof updateData !== 'object') {
      return res.status(400).json({ error: 'Update data is required' });
    }

    // Validate and sanitize update fields
    const validatedUpdates = {};
    const allowedFields = [
      'title', 'description', 'notes', 'scheduled_time', 
      'is_special', 'is_recurring', 'recurrence_pattern'
    ];

    for (const [key, value] of Object.entries(updateData)) {
      if (!allowedFields.includes(key)) {
        return res.status(400).json({ 
          error: `Field '${key}' is not allowed for updates`,
          allowedFields 
        });
      }

      // Validate field values
      switch (key) {
        case 'title':
          if (typeof value !== 'string' || value.trim().length === 0) {
            return res.status(400).json({ error: 'Title must be a non-empty string' });
          }
          if (value.length > 200) {
            return res.status(400).json({ error: 'Title must be 200 characters or less' });
          }
          validatedUpdates[key] = security.sanitizeInput(value.trim());
          break;

        case 'description':
        case 'notes':
          if (value !== null && value !== undefined) {
            if (typeof value !== 'string') {
              return res.status(400).json({ error: `${key} must be a string` });
            }
            if (value.length > 1000) {
              return res.status(400).json({ error: `${key} must be 1000 characters or less` });
            }
            validatedUpdates[key] = value.trim() || null;
          } else {
            validatedUpdates[key] = null;
          }
          break;

        case 'scheduled_time':
          if (typeof value !== 'string') {
            return res.status(400).json({ error: 'scheduled_time must be a string' });
          }
          // Validate ISO date format
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            return res.status(400).json({ error: 'scheduled_time must be a valid ISO date string' });
          }
          validatedUpdates[key] = date.toISOString();
          break;

        case 'is_special':
        case 'is_recurring':
          if (typeof value !== 'boolean') {
            return res.status(400).json({ error: `${key} must be a boolean` });
          }
          validatedUpdates[key] = value;
          break;

        case 'recurrence_pattern':
          if (value !== null && value !== undefined) {
            if (typeof value !== 'string') {
              return res.status(400).json({ error: 'recurrence_pattern must be a string' });
            }
            // Validate JSON format
            try {
              JSON.parse(value);
              validatedUpdates[key] = value;
            } catch (e) {
              return res.status(400).json({ error: 'recurrence_pattern must be valid JSON' });
            }
          } else {
            validatedUpdates[key] = null;
          }
          break;
      }
    }

    if (Object.keys(validatedUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    console.log('🔍 Validated update data:', { taskId, userId, updates: validatedUpdates });

    // Check if task exists and belongs to user
    const existingTask = await database.getTaskById(taskId, userId);
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    // Store original scheduled time for reminder rescheduling
    const originalScheduledTime = existingTask.scheduled_time;
    const timeChanged = validatedUpdates.scheduled_time && 
                       validatedUpdates.scheduled_time !== originalScheduledTime;

    // Update the task
    const updatedTask = await database.updateTask(taskId, validatedUpdates, userId);

    // Reschedule reminders if time changed
    if (timeChanged) {
      try {
        console.log('🔄 Rescheduling reminders for task:', taskId);
        await reminderScheduler.rescheduleRemindersForTask(updatedTask);
        console.log('✅ Successfully rescheduled reminders for task:', taskId);
      } catch (schedulerError) {
        console.error('⚠️ Failed to reschedule reminders for task:', taskId, schedulerError);
        // Don't fail the entire operation if reminder rescheduling fails
      }
    }

    console.log('✅ Task updated successfully:', { 
      taskId, 
      userId, 
      updatedFields: Object.keys(validatedUpdates),
      timestamp: new Date().toISOString()
    });

    // Return updated task
    res.status(200).json({
      success: true,
      task: updatedTask,
      updatedFields: Object.keys(validatedUpdates),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Task update failed:', {
      error: error.message,
      stack: error.stack,
      taskId: req.query.id,
      timestamp: new Date().toISOString()
    });

    // Handle specific database errors
    if (error.code === 'PGRST116') {
      return res.status(404).json({ 
        error: 'Task not found or access denied',
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};
