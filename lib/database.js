const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

class DatabaseService {
  constructor() {
    this.supabase = supabase;
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
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return await this.getTasks(userId, {
      dateRange: {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString()
      }
    });
  }

  // Get tasks for weekly view
  async getWeeklyTasks(userId) {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return await this.getTasks(userId, {
      dateRange: {
        start: startOfWeek.toISOString(),
        end: endOfWeek.toISOString()
      }
    });
  }

  // Get tasks for monthly view
  async getMonthlyTasks(userId) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    return await this.getTasks(userId, {
      dateRange: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString()
      }
    });
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
