const database = require('../../lib/database');
const lineBot = require('../../lib/line-bot');
const reminderScheduler = require('../../lib/reminder-scheduler');
const auth = require('../../lib/auth');
const security = require('../../lib/security');

module.exports = async (req, res) => {
  // Set security headers
  security.setSecurityHeaders(res);
  
  // Only allow GET requests (for cron jobs)
  if (req.method !== 'GET') {
    console.log('❌ Invalid request method for heartbeat:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate the request
  if (!auth.validateCronApiKey(req)) {
    console.error('❌ Unauthorized access to heartbeat endpoint');
    security.logSecurityEvent('unauthorized_cron_access', {
      endpoint: 'heartbeat',
      clientIP: security.getClientIP(req)
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      timestamp: new Date().toISOString()
    });
  }

  const startTime = new Date();
  console.log('💓 Heartbeat started:', {
    timestamp: startTime.toISOString(),
    method: req.method,
    headers: req.headers
  });

  try {
    // Get user ID from environment
    const userId = process.env.USER_LINE_ID;
    if (!userId) {
      console.error('❌ USER_LINE_ID environment variable not set');
      throw new Error('USER_LINE_ID environment variable not set');
    }

    const results = {
      timestamp: startTime.toISOString(),
      processed: 0,
      details: {
        scheduledMessages: 0,
        reminders: 0,
        dailyTasks: 0,
        specialTasks: 0,
        cleanup: 0
      }
    };

    // 1. Process scheduled messages
    console.log('📨 Processing scheduled messages...');
    const scheduledMessages = await database.getPendingScheduledMessages();
    
    for (const message of scheduledMessages) {
      try {
        console.log('📤 Sending scheduled message:', {
          id: message.id,
          content: message.content?.substring(0, 50) + '...',
          scheduledAt: message.scheduled_at
        });
        
        // Mock send function - replace with your actual sending logic
        await mockSendMessage(userId, message.content, message.message_type);
        
        // Mark as sent
        await database.updateMessageStatus(message.id, 'sent');
        results.details.scheduledMessages++;
        results.processed++;
        
        console.log('✅ Scheduled message sent successfully:', message.id);
      } catch (error) {
        console.error('❌ Failed to send scheduled message:', message.id, error);
        await database.updateMessageStatus(message.id, 'failed', error.message);
      }
    }

    // 2. Process pending reminders
    console.log('⏰ Processing pending reminders...');
    const remindersProcessed = await reminderScheduler.processPendingReminders();
    results.details.reminders = remindersProcessed;
    results.processed += remindersProcessed;

    // 3. Check for daily tasks (only if it's morning time)
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 5 && hour <= 7) { // Between 5 AM and 7 AM
      console.log('🌅 Processing daily tasks...');
      const todaysTasks = await database.getTodaysTasks(userId);
      
      if (todaysTasks.length > 0) {
        await lineBot.sendTaskListMessage(userId, todaysTasks, "🌅 Good morning! Here's your schedule for today:");
        results.details.dailyTasks = todaysTasks.length;
        results.processed++;
      }
    }

    // 4. Check for special tasks
    console.log('⭐ Checking special tasks...');
    const specialTasks = await database.getSpecialTasksForReminder(userId);
    
    for (const task of specialTasks) {
      try {
        await lineBot.sendReminderMessage(userId, task, 'special_day_before');
        results.details.specialTasks++;
        results.processed++;
      } catch (error) {
        console.error('❌ Failed to send special reminder:', task.id, error);
      }
    }

    // 5. Generate recurring task instances (once per day)
    const lastRun = await getLastHeartbeatRun();
    const shouldGenerateRecurring = shouldRunDailyTask(lastRun, now);
    
    if (shouldGenerateRecurring) {
      console.log('🔄 Generating recurring task instances...');
      await reminderScheduler.generateRecurringInstances();
      await setLastHeartbeatRun(now);
    }

    // 6. Cleanup (once per week)
    const shouldCleanup = shouldRunWeeklyTask(lastRun, now);
    if (shouldCleanup) {
      console.log('🧹 Running cleanup...');
      await reminderScheduler.cleanup();
      results.details.cleanup = 1;
      results.processed++;
    }

    const endTime = new Date();
    const duration = endTime - startTime;
    
    console.log('✅ Heartbeat completed successfully:', {
      duration: `${duration}ms`,
      processed: results.processed,
      details: results.details,
      timestamp: endTime.toISOString()
    });
    
    res.status(200).json({ 
      success: true,
      ...results,
      duration: `${duration}ms`
    });
  } catch (error) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    console.error('❌ Heartbeat failed:', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: endTime.toISOString()
    });
    
    res.status(500).json({ 
      error: error.message,
      timestamp: endTime.toISOString(),
      duration: `${duration}ms`
    });
  }
};

// Mock send message function - replace with your actual implementation
async function mockSendMessage(userId, content, messageType = 'text') {
  console.log('📤 Mock sending message:', {
    userId,
    content: content?.substring(0, 100) + '...',
    messageType
  });
  
  // Simulate sending delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // In a real implementation, you would:
  // - Send LINE message using lineBot.sendTextMessage()
  // - Send email using your email service
  // - Send push notification
  // - etc.
  
  console.log('✅ Mock message sent successfully');
  return true;
}

// Helper functions for daily/weekly task scheduling
async function getLastHeartbeatRun() {
  // In a real implementation, you might store this in a database
  // For now, we'll use a simple approach
  return null;
}

async function setLastHeartbeatRun(timestamp) {
  // In a real implementation, you would store this in a database
  console.log('📝 Setting last heartbeat run:', timestamp.toISOString());
}

function shouldRunDailyTask(lastRun, now) {
  if (!lastRun) return true;
  
  const lastRunDate = new Date(lastRun);
  const today = new Date(now);
  
  // Check if it's a different day
  return lastRunDate.toDateString() !== today.toDateString();
}

function shouldRunWeeklyTask(lastRun, now) {
  if (!lastRun) return true;
  
  const lastRunDate = new Date(lastRun);
  const daysDiff = Math.floor((now - lastRunDate) / (1000 * 60 * 60 * 24));
  
  // Run weekly cleanup if it's been 7+ days
  return daysDiff >= 7;
}
