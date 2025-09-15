const { createClient } = require('@supabase/supabase-js');
const moment = require('moment-timezone');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

class DatabaseService {
  constructor() {
    this.supabase = supabase;
    this.timezone = process.env.TIMEZONE || 'Asia/Taipei';
  }

  // Validate LINE user ID format
  isValidUserId(userId) {
    // LINE user IDs are typically 32-33 character strings
    return userId && typeof userId === 'string' && userId.length >= 30 && userId.length <= 35;
  }

  // Set user context for RLS
  async setUserContext(userId) {
    this.currentUserId = userId;
    
    // Set the user context in Supabase for RLS
    try {
      await this.supabase.rpc('set_user_context', { user_id: userId });
      console.log('✅ User context set for RLS:', userId);
    } catch (error) {
      console.warn('⚠️ Could not set user context for RLS:', error.message);
      // Continue without RLS - application layer filtering will handle it
    }
  }

  // Task CRUD operations
  async createTask(taskData) {
    console.log('🔍 Creating task:', { title: taskData.title, scheduled_time: taskData.scheduled_time });
    
    const { data, error } = await this.supabase
      .from('tasks')
      .insert([taskData])
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating task:', error);
      throw error;
    }
    
    console.log('✅ Successfully created task:', { id: data.id, title: data.title });
    return data;
  }

  async getTasks(userId, filters = {}) {
    await this.setUserContext(userId);
    
    console.log('🔍 Fetching tasks for user:', { userId, filters });
    
    let query = this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('scheduled_time', { ascending: true });

    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      query = query.gte('scheduled_time', start).lte('scheduled_time', end);
    }

    if (filters.isSpecial !== undefined) {
      query = query.eq('is_special', filters.isSpecial);
    }

    if (filters.isRecurring !== undefined) {
      query = query.eq('is_recurring', filters.isRecurring);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ Error getting tasks:', error);
      throw error;
    }
    
    console.log('✅ Fetched tasks:', { count: data.length, userId });
    return data;
  }

  async getTaskById(taskId, userId) {
    await this.setUserContext(userId);
    
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    return data;
  }

  async updateTask(taskId, updates, userId) {
    await this.setUserContext(userId);
    
    // Validate update data
    this.validateUpdateData(updates);
    
    const { data, error } = await this.supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Validate update data
  validateUpdateData(updates) {
    const allowedFields = [
      'title', 'description', 'notes', 'scheduled_time', 
      'is_special', 'is_recurring', 'recurrence_pattern'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) {
        throw new Error(`Field '${key}' is not allowed for updates`);
      }

      switch (key) {
        case 'title':
          if (typeof value !== 'string' || value.trim().length === 0) {
            throw new Error('Title must be a non-empty string');
          }
          if (value.length > 200) {
            throw new Error('Title must be 200 characters or less');
          }
          break;

        case 'description':
        case 'notes':
          if (value !== null && value !== undefined && typeof value !== 'string') {
            throw new Error(`${key} must be a string`);
          }
          if (value && value.length > 1000) {
            throw new Error(`${key} must be 1000 characters or less`);
          }
          break;

        case 'scheduled_time':
          if (typeof value !== 'string') {
            throw new Error('scheduled_time must be a string');
          }
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new Error('scheduled_time must be a valid ISO date string');
          }
          break;

        case 'is_special':
        case 'is_recurring':
          if (typeof value !== 'boolean') {
            throw new Error(`${key} must be a boolean`);
          }
          break;

        case 'recurrence_pattern':
          if (value !== null && value !== undefined) {
            if (typeof value !== 'string') {
              throw new Error('recurrence_pattern must be a string');
            }
            try {
              JSON.parse(value);
            } catch (e) {
              throw new Error('recurrence_pattern must be valid JSON');
            }
          }
          break;
      }
    }
  }

  async deleteTask(taskId, userId) {
    await this.setUserContext(userId);
    
    const { data, error } = await this.supabase
      .from('tasks')
      .update({ is_active: false })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Get recurring task instances
  async getRecurringTaskInstances(userId, startDate, endDate) {
    await this.setUserContext(userId);
    
    const { data, error } = await this.supabase
      .from('recurring_task_instances')
      .select('*')
      .eq('user_id', userId)
      .gte('instance_time', startDate)
      .lte('instance_time', endDate)
      .order('instance_time', { ascending: true });

    if (error) throw error;
    return data;
  }

  // Reminder management
  async createReminder(reminderData) {
    const { data, error } = await this.supabase
      .from('reminders')
      .insert([reminderData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPendingReminders(beforeTime) {
    console.log('🔍 Fetching pending reminders before:', beforeTime);
    
    const { data, error } = await this.supabase
      .from('reminders')
      .select(`
        *,
        tasks!inner(*)
      `)
      .lte('scheduled_time', beforeTime)
      .is('sent_at', null)
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('❌ Error getting pending reminders:', error);
      throw error;
    }
    
    // Count different types of reminders
    const reminderCounts = data.reduce((acc, reminder) => {
      acc[reminder.reminder_type] = (acc[reminder.reminder_type] || 0) + 1;
      return acc;
    }, {});
    
    console.log('✅ Fetched pending reminders:', { 
      count: data.length, 
      types: reminderCounts,
      beforeTime 
    });
    
    return data;
  }

  async markReminderSent(reminderId) {
    console.log('🔍 Marking reminder as sent:', reminderId);
    
    const { data, error } = await this.supabase
      .from('reminders')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', reminderId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error marking reminder sent:', error);
      throw error;
    }
    
    console.log('✅ Successfully marked reminder as sent:', { id: reminderId });
    return data;
  }

  // Get tasks for daily morning reminder
  async getTodaysTasks(userId) {
    const startOfDay = moment().tz(this.timezone).startOf('day');
    const endOfDay = moment().tz(this.timezone).endOf('day');

    return await this.getTasks(userId, {
      dateRange: {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString()
      }
    });
  }

  // Get tasks for weekly view
  async getWeeklyTasks(userId) {
    const startOfWeek = moment().tz(this.timezone).startOf('week');
    const endOfWeek = moment().tz(this.timezone).endOf('week');

    return await this.getTasks(userId, {
      dateRange: {
        start: startOfWeek.toISOString(),
        end: endOfWeek.toISOString()
      }
    });
  }

  // Get tasks for monthly view
  async getMonthlyTasks(userId) {
    const startOfMonth = moment().tz(this.timezone).startOf('month');
    const endOfMonth = moment().tz(this.timezone).endOf('month');

    return await this.getTasks(userId, {
      dateRange: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString()
      }
    });
  }

  // Get special tasks that need day-before reminders
  async getSpecialTasksForReminder(userId) {
    await this.setUserContext(userId);
    
    const now = moment().tz(this.timezone);
    const tomorrow = moment().tz(this.timezone).add(1, 'day').startOf('day');
    const dayAfterTomorrow = moment().tz(this.timezone).add(2, 'day');
    
    console.log('🔍 Fetching special tasks for reminder:', { 
      userId, 
      tomorrow: tomorrow.toISOString(),
      dayAfterTomorrow: dayAfterTomorrow.toISOString()
    });
    
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_special', true)
      .gte('scheduled_time', tomorrow.toISOString())
      .lt('scheduled_time', dayAfterTomorrow.toISOString())
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('❌ Error getting special tasks for reminder:', error);
      throw error;
    }
    
    console.log('✅ Fetched special tasks for reminder:', { count: data.length, userId });
    return data;
  }

  // Get pending scheduled messages
  async getPendingScheduledMessages() {
    const now = moment().tz(this.timezone).toISOString();
    
    console.log('🔍 Fetching pending scheduled messages:', { now });
    
    const { data, error } = await this.supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('❌ Error getting pending scheduled messages:', error);
      throw error;
    }
    
    console.log('✅ Fetched pending scheduled messages:', { count: data.length });
    return data;
  }

  // Update message status
  async updateMessageStatus(messageId, status, errorMessage = null) {
    const updateData = { 
      status,
      updated_at: new Date().toISOString()
    };
    
    if (errorMessage) {
      updateData.error_message = errorMessage;
    }
    
    console.log('🔍 Updating message status:', { messageId, status });
    
    const { data, error } = await this.supabase
      .from('scheduled_messages')
      .update(updateData)
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating message status:', error);
      throw error;
    }
    
    console.log('✅ Updated message status:', { messageId, status });
    return data;
  }

  // Cleanup old tasks
  async cleanupOldTasks() {
    const { data, error } = await this.supabase
      .rpc('cleanup_old_tasks');

    if (error) throw error;
    return data;
  }
}

module.exports = new DatabaseService();
