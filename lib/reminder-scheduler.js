const moment = require('moment-timezone');
const database = require('./database');
const lineBot = require('./line-bot');

class ReminderScheduler {
  constructor() {
    this.timezone = process.env.TIMEZONE || 'Asia/Taipei';
  }

  // Schedule reminders for a new task
  async scheduleRemindersForTask(task) {
    const reminders = [];

    // Daily morning reminder (5:30 AM) - only for today's tasks
    const today = moment().tz(this.timezone).startOf('day');
    const taskDate = moment(task.scheduled_time).tz(this.timezone).startOf('day');
    
    if (taskDate.isSame(today)) {
      const dailyReminderTime = moment().tz(this.timezone).hour(5).minute(30).second(0);
      if (dailyReminderTime.isAfter(moment().tz(this.timezone))) {
        reminders.push({
          task_id: task.id,
          reminder_type: 'daily',
          scheduled_time: dailyReminderTime.toISOString()
        });
      }
    }

    // One hour before reminder
    const oneHourBefore = moment(task.scheduled_time).subtract(1, 'hour');
    if (oneHourBefore.isAfter(moment().tz(this.timezone))) {
      reminders.push({
        task_id: task.id,
        reminder_type: 'hourly',
        scheduled_time: oneHourBefore.toISOString()
      });
    }

    // Special task reminders
    if (task.is_special) {
      // One day before reminder
      const oneDayBefore = moment(task.scheduled_time).subtract(1, 'day');
      if (oneDayBefore.isAfter(moment().tz(this.timezone))) {
        reminders.push({
          task_id: task.id,
          reminder_type: 'special_day_before',
          scheduled_time: oneDayBefore.toISOString()
        });
      }

      // Day of reminder at 5:30 AM
      const dayOfReminder = moment(task.scheduled_time).tz(this.timezone).hour(5).minute(30).second(0);
      if (dayOfReminder.isAfter(moment().tz(this.timezone))) {
        reminders.push({
          task_id: task.id,
          reminder_type: 'special_day_of',
          scheduled_time: dayOfReminder.toISOString()
        });
      }
    }

    // Create reminders in database
    for (const reminder of reminders) {
      await database.createReminder(reminder);
    }

    return reminders;
  }

  // Process pending reminders
  async processPendingReminders() {
    const now = moment().tz(this.timezone).toISOString();
    console.log('🔍 Processing pending reminders at:', now);
    
    const pendingReminders = await database.getPendingReminders(now);
    
    if (pendingReminders.length === 0) {
      console.log('✅ No pending reminders to process');
      return 0;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const reminder of pendingReminders) {
      try {
        const task = reminder.tasks;
        const userId = task.user_id;

        console.log('🔍 Processing reminder:', {
          reminderId: reminder.id,
          reminderType: reminder.reminder_type,
          taskId: task.id,
          taskTitle: task.title,
          userId: userId
        });

        // Send reminder message
        await lineBot.sendReminderMessage(userId, task, reminder.reminder_type);

        // Mark reminder as sent
        await database.markReminderSent(reminder.id);

        console.log('📨 Successfully sent reminder:', {
          reminderType: reminder.reminder_type,
          taskId: task.id,
          taskTitle: task.title,
          userId: userId
        });
        
        successCount++;
      } catch (error) {
        console.error('❌ Failed to send reminder:', {
          reminderId: reminder.id,
          reminderType: reminder.reminder_type,
          taskId: reminder.tasks?.id,
          taskTitle: reminder.tasks?.title,
          userId: reminder.tasks?.user_id,
          error: error.message
        });
        errorCount++;
      }
    }

    console.log('✅ Reminder processing completed:', {
      total: pendingReminders.length,
      successful: successCount,
      failed: errorCount
    });

    return successCount;
  }

  // Generate recurring task instances
  async generateRecurringInstances() {
    console.log('🔍 Generating recurring task instances...');
    
    const recurringTasks = await database.getTasks(null, { isRecurring: true });
    console.log('✅ Fetched recurring tasks:', { count: recurringTasks.length });
    
    const now = moment().tz(this.timezone);
    const threeMonthsFromNow = moment().tz(this.timezone).add(3, 'months');

    let totalInstances = 0;
    let errorCount = 0;

    for (const task of recurringTasks) {
      try {
        console.log('🔍 Processing recurring task:', {
          taskId: task.id,
          title: task.title,
          recurrencePattern: task.recurrence_pattern
        });
        
        const recurrencePattern = JSON.parse(task.recurrence_pattern);
        const instances = this.generateInstancesForPattern(
          task,
          recurrencePattern,
          now,
          threeMonthsFromNow
        );

        console.log('✅ Generated instances for task:', {
          taskId: task.id,
          title: task.title,
          instanceCount: instances.length
        });

        // Schedule reminders for new instances
        for (const instance of instances) {
          await this.scheduleRemindersForTask(instance);
          totalInstances++;
        }
      } catch (error) {
        console.error('❌ Error generating instances for task:', {
          taskId: task.id,
          title: task.title,
          error: error.message
        });
        errorCount++;
      }
    }

    console.log('✅ Recurring task instance generation completed:', {
      totalTasks: recurringTasks.length,
      totalInstances: totalInstances,
      errors: errorCount
    });
  }

  // Generate instances for a recurrence pattern
  generateInstancesForPattern(task, pattern, startDate, endDate) {
    const instances = [];
    const baseTime = moment(task.scheduled_time);

    switch (pattern.type) {
      case 'weekly':
        instances.push(...this.generateWeeklyInstances(task, pattern, baseTime, startDate, endDate));
        break;
      case 'biweekly':
        instances.push(...this.generateBiweeklyInstances(task, pattern, baseTime, startDate, endDate));
        break;
      case 'monthly':
        instances.push(...this.generateMonthlyInstances(task, pattern, baseTime, startDate, endDate));
        break;
    }

    return instances;
  }

  // Generate weekly instances
  generateWeeklyInstances(task, pattern, baseTime, startDate, endDate) {
    const instances = [];
    const dayOfWeek = this.getDayOfWeekNumber(pattern.dayOfWeek);
    
    let current = baseTime.clone().day(dayOfWeek);
    if (current.isBefore(startDate)) {
      current.add(1, 'week');
    }

    while (current.isBefore(endDate)) {
      if (current.isAfter(startDate)) {
        instances.push({
          ...task,
          id: `${task.id}_${current.format('YYYY-MM-DD')}`,
          scheduled_time: current.toISOString()
        });
      }
      current.add(1, 'week');
    }

    return instances;
  }

  // Generate biweekly instances
  generateBiweeklyInstances(task, pattern, baseTime, startDate, endDate) {
    const instances = [];
    const dayOfWeek = this.getDayOfWeekNumber(pattern.dayOfWeek);
    
    let current = baseTime.clone().day(dayOfWeek);
    if (current.isBefore(startDate)) {
      current.add(2, 'weeks');
    }

    while (current.isBefore(endDate)) {
      if (current.isAfter(startDate)) {
        instances.push({
          ...task,
          id: `${task.id}_${current.format('YYYY-MM-DD')}`,
          scheduled_time: current.toISOString()
        });
      }
      current.add(2, 'weeks');
    }

    return instances;
  }

  // Generate monthly instances
  generateMonthlyInstances(task, pattern, baseTime, startDate, endDate) {
    const instances = [];
    
    if (pattern.dayOfMonth) {
      // Specific day of month (e.g., 15th)
      let current = baseTime.clone().date(pattern.dayOfMonth);
      if (current.isBefore(startDate)) {
        current.add(1, 'month');
      }

      while (current.isBefore(endDate)) {
        if (current.isAfter(startDate)) {
          instances.push({
            ...task,
            id: `${task.id}_${current.format('YYYY-MM-DD')}`,
            scheduled_time: current.toISOString()
          });
        }
        current.add(1, 'month');
      }
    } else if (pattern.weekdayOfMonth) {
      // Specific weekday of month (e.g., first Sunday)
      let current = baseTime.clone();
      if (current.isBefore(startDate)) {
        current.add(1, 'month');
      }

      while (current.isBefore(endDate)) {
        const instance = this.getWeekdayOfMonth(
          current.year(),
          current.month(),
          pattern.weekdayOfMonth.week,
          pattern.weekdayOfMonth.day
        );
        
        if (instance && instance.isAfter(startDate)) {
          instances.push({
            ...task,
            id: `${task.id}_${instance.format('YYYY-MM-DD')}`,
            scheduled_time: instance.toISOString()
          });
        }
        
        current.add(1, 'month');
      }
    }

    return instances;
  }

  // Get day of week number (0 = Sunday, 1 = Monday, etc.)
  getDayOfWeekNumber(dayName) {
    const days = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6
    };
    return days[dayName.toLowerCase()] || 0;
  }

  // Get specific weekday of month (e.g., first Sunday)
  getWeekdayOfMonth(year, month, week, dayName) {
    const dayOfWeek = this.getDayOfWeekNumber(dayName);
    const firstDay = moment([year, month, 1]);
    const firstWeekday = firstDay.clone().day(dayOfWeek);
    
    if (firstWeekday.month() !== month) {
      firstWeekday.add(1, 'week');
    }

    let targetDate;
    switch (week.toLowerCase()) {
      case 'first':
        targetDate = firstWeekday;
        break;
      case 'second':
        targetDate = firstWeekday.clone().add(1, 'week');
        break;
      case 'third':
        targetDate = firstWeekday.clone().add(2, 'weeks');
        break;
      case 'fourth':
        targetDate = firstWeekday.clone().add(3, 'weeks');
        break;
      case 'last':
        const lastDay = moment([year, month + 1, 0]);
        const lastWeekday = lastDay.clone().day(dayOfWeek);
        if (lastWeekday.month() !== month) {
          lastWeekday.subtract(1, 'week');
        }
        targetDate = lastWeekday;
        break;
      default:
        return null;
    }

    return targetDate.month() === month ? targetDate : null;
  }

  // Clean up old tasks and reminders
  async cleanup() {
    await database.cleanupOldTasks();
  }
}

module.exports = new ReminderScheduler();
