const line = require('@line/bot-sdk');
const database = require('./database');
const nlpParser = require('./nlp-parser');
const reminderScheduler = require('./reminder-scheduler');
const moment = require('moment-timezone');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

class LineBotService {
  constructor() {
    this.client = client;
    this.database = database;
    this.timezone = process.env.TIMEZONE || 'Asia/Taipei';
  }

  // Validate LINE user ID format
  isValidUserId(userId) {
    // LINE user IDs are typically 32-33 character strings
    return userId && typeof userId === 'string' && userId.length >= 30 && userId.length <= 35;
  }

  // Retry mechanism for LINE API calls
  async retryApiCall(apiCall, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        const isRateLimit = error.response?.status === 429;
        const isServerError = error.response?.status >= 500;
        
        if ((isRateLimit || isServerError) && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`⚠️ API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
  }

  // Send text message (push message for scheduled reminders)
  async sendTextMessage(userId, text) {
    if (!this.isValidUserId(userId)) {
      console.warn('⚠️ Skipping user', userId, '- not a valid LINE user ID format');
      return;
    }
    
    console.log('🔍 Attempting to send text message to user:', { userId, textLength: text.length });
    
    try {
      await this.retryApiCall(async () => {
        return await this.client.pushMessage(userId, {
          type: 'text',
          text: text
        });
      });
      
      console.log('📨 Successfully sent text message to user:', userId);
    } catch (error) {
      console.error('❌ Failed to send text message to user:', userId, error);
      console.error('LINE API error details:', error.response?.data);
      console.error('LINE API status:', error.response?.status);
      console.error('LINE API headers:', error.response?.headers);
      throw error;
    }
  }

  // Send reply message (for user-initiated interactions)
  async sendReplyMessage(replyToken, text) {
    console.log('🔍 Attempting to send reply message:', { textLength: text.length });
    
    try {
      await this.retryApiCall(async () => {
        return await this.client.replyMessage(replyToken, {
          type: 'text',
          text: text
        });
      });
      
      console.log('📨 Successfully sent reply message');
    } catch (error) {
      console.error('❌ Failed to send reply message:', error);
      console.error('LINE API error details:', error.response?.data);
      console.error('LINE API status:', error.response?.status);
      console.error('LINE API headers:', error.response?.headers);
      throw error;
    }
  }

  // Send flex message for task list
  async sendTaskListMessage(userId, tasks, title = 'Your Tasks') {
    console.log('🔍 Attempting to send task list message to user:', { userId, taskCount: tasks.length, title });
    
    if (tasks.length === 0) {
      console.log('📨 Sending empty task list message to user:', userId);
      await this.sendTextMessage(userId, `${title}\n\nNo tasks found.`);
      return;
    }

    // Add display IDs to tasks (1, 2, 3, etc.)
    const tasksWithDisplayIds = tasks.map((task, index) => ({
      ...task,
      displayId: index + 1
    }));

    const contents = tasksWithDisplayIds.map(task => ({
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: task.title,
            weight: 'bold',
            size: 'md',
            color: task.is_special ? '#FF6B6B' : '#333333'
          },
          {
            type: 'text',
            text: `ID: ${task.displayId}`,
            size: 'xs',
            color: '#999999',
            margin: 'xs'
          },
          {
            type: 'text',
            text: this.formatDateTime(task.scheduled_time),
            size: 'sm',
            color: '#666666',
            margin: 'sm'
          },
          ...(task.description ? [{
            type: 'text',
            text: task.description,
            size: 'sm',
            color: '#888888',
            margin: 'sm',
            wrap: true
          }] : []),
          ...(task.notes ? [{
            type: 'text',
            text: `Note: ${task.notes}`,
            size: 'xs',
            color: '#999999',
            margin: 'sm',
            wrap: true
          }] : []),
          ...(task.is_recurring ? [{
            type: 'text',
            text: `🔄 ${this.formatRecurrence(task.recurrence_pattern)}`,
            size: 'xs',
            color: '#4CAF50',
            margin: 'sm'
          }] : []),
          ...(task.is_special ? [{
            type: 'text',
            text: '⭐ Special Task',
            size: 'xs',
            color: '#FF6B6B',
            margin: 'sm'
          }] : [])
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'Update',
              data: `update_task:${task.id}`
            },
            style: 'secondary',
            size: 'sm'
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'Delete',
              data: `delete_task:${task.id}`
            },
            style: 'secondary',
            size: 'sm',
            color: '#FF6B6B'
          }
        ]
      }
    }));

    const flexMessage = {
      type: 'flex',
      altText: title,
      contents: {
        type: 'carousel',
        contents: contents.slice(0, 10) // Limit to 10 tasks for better UX
      }
    };

    // Add a note if there are more tasks than displayed
    const hasMoreTasks = tasks.length > 10;

    try {
      await this.retryApiCall(async () => {
        return await this.client.pushMessage(userId, flexMessage);
      });
      console.log('📨 Successfully sent flex message to user:', userId);
      
      // Send additional message if there are more tasks
      if (hasMoreTasks) {
        const remainingCount = tasks.length - 10;
        await this.sendTextMessage(userId, `📋 Showing first 10 tasks. You have ${remainingCount} more tasks. Use "list" command to see all tasks in text format.`);
      }
    } catch (error) {
      console.error('❌ Failed to send flex message to user:', userId, error);
      console.error('LINE API error details:', error.response?.data);
      console.error('LINE API status:', error.response?.status);
      console.error('LINE API headers:', error.response?.headers);
      
      // Fallback to text message
      console.log('🔄 Falling back to text message for user:', userId);
      const textMessage = this.formatTaskList(tasks, title);
      await this.sendTextMessage(userId, textMessage);
    }
  }

  // Send reminder message
  async sendReminderMessage(userId, task, reminderType) {
    console.log('🔍 Attempting to send reminder message:', {
      reminderType,
      userId,
      taskId: task.id,
      taskTitle: task.title
    });
    
    console.log('🔍 Task details:', {
      id: task.id,
      title: task.title,
      scheduled_time: task.scheduled_time,
      is_special: task.is_special,
      is_recurring: task.is_recurring
    });
    
    let message = '';
    
    switch (reminderType) {
      case 'daily':
        message = `🌅 Good morning! Here's your schedule for today:\n\n`;
        break;
      case 'hourly':
        message = `⏰ Reminder: ${task.title} is coming up in 1 hour!\n\n`;
        break;
      case 'special_day_before':
        message = `⭐ Special Reminder: ${task.title} is tomorrow!\n\n`;
        break;
      case 'special_day_of':
        message = `⭐ Special Task Today: ${task.title}\n\n`;
        break;
    }

    message += `📅 ${this.formatDateTime(task.scheduled_time)}`;
    
    if (task.description) {
      message += `\n📝 ${task.description}`;
    }
    
    if (task.notes) {
      message += `\n💭 Note: ${task.notes}`;
    }

    if (task.is_recurring) {
      message += `\n🔄 Recurring: ${this.formatRecurrence(task.recurrence_pattern)}`;
    }

    console.log('🔍 Message content:', { messageLength: message.length, preview: message.substring(0, 100) + '...' });

    await this.sendTextMessage(userId, message);
    
    console.log('📨 Successfully sent reminder message:', {
      reminderType,
      userId,
      taskId: task.id,
      taskTitle: task.title
    });
  }

  // Format datetime for display
  formatDateTime(dateTimeString) {
    const date = moment(dateTimeString).tz(this.timezone);
    const now = moment().tz(this.timezone);
    const today = now.clone().startOf('day');
    const taskDate = date.clone().startOf('day');
    
    const timeString = date.format('h:mm A');

    // Calculate tomorrow safely to avoid daylight saving issues
    const tomorrow = today.clone().add(1, 'day');

    if (taskDate.isSame(today)) {
      return `Today at ${timeString}`;
    } else if (taskDate.isSame(tomorrow)) {
      return `Tomorrow at ${timeString}`;
    } else {
      return date.format('ddd, MMM D, h:mm A');
    }
  }

  // Format recurrence pattern
  formatRecurrence(recurrencePattern) {
    if (!recurrencePattern) return '';
    
    const pattern = JSON.parse(recurrencePattern);
    
    switch (pattern.type) {
      case 'weekly':
        return `Every ${pattern.dayOfWeek}`;
      case 'biweekly':
        return `Every 2 weeks on ${pattern.dayOfWeek}`;
      case 'monthly':
        if (pattern.dayOfMonth) {
          return `Monthly on the ${pattern.dayOfMonth}${this.getOrdinalSuffix(pattern.dayOfMonth)}`;
        } else if (pattern.weekdayOfMonth) {
          return `Monthly on the ${pattern.weekdayOfMonth.week} ${pattern.weekdayOfMonth.day}`;
        }
        return 'Monthly';
      default:
        return 'Recurring';
    }
  }

  getOrdinalSuffix(day) {
    if (day >= 11 && day <= 13) {
      return 'th';
    }
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  // Centralized task list formatting
  formatTaskList(tasks, title) {
    if (tasks.length === 0) {
      return `${title}\n\nNo tasks found.`;
    }
    
    const taskList = tasks.map((task, index) => 
      `• ${task.title} - ${this.formatDateTime(task.scheduled_time)}${task.is_special ? ' ⭐' : ''}${task.is_recurring ? ' 🔄' : ''}\n  ID: ${index + 1}`
    ).join('\n');
    
    return `${title}\n\n${taskList}`;
  }

  // Format compact task IDs list
  formatTaskIdsList(tasks) {
    if (tasks.length === 0) {
      return "🆔 Task IDs\n\nNo tasks found.";
    }
    
    const taskIdsList = tasks.map((task, index) => 
      `${index + 1} - ${task.title}`
    ).join('\n');
    
    return `🆔 Task IDs (${tasks.length} tasks)\n\n${taskIdsList}\n\n💡 Use these IDs with update/delete commands for precise task management.`;
  }

  // Common command handler that accepts a send function
  async handleTaskListCommand(userId, replyToken, getTasksFn, title, useReply = false) {
    try {
      const tasks = await getTasksFn(userId);
      const message = this.formatTaskList(tasks, title);
      
      if (useReply) {
        await this.sendReplyMessage(replyToken, message);
      } else {
        await this.sendTextMessage(userId, message);
      }
    } catch (error) {
      const errorMessage = `❌ Error retrieving tasks: ${error.message}`;
      if (useReply) {
        await this.sendReplyMessage(replyToken, errorMessage);
      } else {
        await this.sendTextMessage(userId, errorMessage);
      }
    }
  }

  // Handle webhook events
  async handleWebhook(events) {
    console.log('🔍 Handling webhook events:', { count: events.length });
    
    for (const event of events) {
      try {
        console.log('🔍 Processing event:', {
          type: event.type,
          source: event.source?.type,
          userId: event.source?.userId,
          messageType: event.message?.type
        });

        if (event.type === 'message' && event.message.type === 'text') {
          await this.handleTextMessage(event);
        } else if (event.type === 'postback') {
          await this.handlePostback(event);
        } else {
          console.log('⚠️ Unhandled event type:', event.type);
        }

        console.log('✅ Successfully processed event:', {
          type: event.type,
          userId: event.source?.userId
        });
      } catch (error) {
        console.error('❌ Error handling event:', {
          type: event.type,
          userId: event.source?.userId,
          error: error.message
        });
      }
    }
  }

  // Handle text messages
  async handleTextMessage(event) {
    const userId = event.source.userId;
    const replyToken = event.replyToken;
    const message = event.message.text.toLowerCase().trim();

    console.log('🔍 Handling text message:', {
      userId: userId,
      message: event.message.text,
      messageLength: event.message.text.length
    });

    try {
      if (message === 'help' || message === 'commands' || message === 'hey assistant') {
        console.log('🔍 Processing help command for user:', userId);
        await this.sendHelpReply(replyToken);
      } else if (message === 'today') {
        console.log('🔍 Processing today command for user:', userId);
        await this.handleTodayCommandReply(userId, replyToken);
      } else if (message === 'week') {
        console.log('🔍 Processing week command for user:', userId);
        await this.handleWeekCommandReply(userId, replyToken);
      } else if (message === 'month') {
        console.log('🔍 Processing month command for user:', userId);
        await this.handleMonthCommandReply(userId, replyToken);
      } else if (message === 'list') {
        console.log('🔍 Processing list command for user:', userId);
        await this.handleListCommandReply(userId, replyToken);
      } else if (message === 'ids') {
        console.log('🔍 Processing ids command for user:', userId);
        await this.handleIdsCommandReply(userId, replyToken);
      } else if (message.startsWith('add ')) {
        console.log('🔍 Processing add command for user:', userId);
        await this.handleAddCommandReply(userId, replyToken, event.message.text);
      } else if (message.startsWith('delete ')) {
        console.log('🔍 Processing delete command for user:', userId);
        await this.handleDeleteCommandReply(userId, replyToken, event.message.text);
      } else if (message.startsWith('update ')) {
        console.log('🔍 Processing update command for user:', userId);
        await this.handleUpdateCommandReply(userId, replyToken, event.message.text);
      } else {
        console.log('⚠️ Unknown command from user:', { userId, message: event.message.text });
        await this.sendReplyMessage(replyToken, "I didn't understand that command. Type 'help' to see available commands.");
      }
    } catch (error) {
      console.error('❌ Error handling text message:', {
        userId: userId,
        message: event.message.text,
        error: error.message
      });
      await this.sendReplyMessage(replyToken, "Sorry, something went wrong. Please try again.");
    }
  }

  // Handle postback events
  async handlePostback(event) {
    const userId = event.source.userId;
    const data = event.postback.data;

    try {
      if (data.startsWith('delete_task:')) {
        const taskId = data.split(':')[1];
        await this.handleDeleteTaskById(userId, taskId);
      } else if (data.startsWith('update_task:')) {
        const taskId = data.split(':')[1];
        await this.sendTextMessage(userId, `To update task, please use: update "${taskId}" with your changes`);
      }
    } catch (error) {
      console.error('Error handling postback:', error);
      await this.sendTextMessage(userId, "Sorry, something went wrong. Please try again.");
    }
  }

  // Send help message (for push messages)
  async sendHelpMessage(userId) {
    const helpText = `🤖 Mark's Assistant - Available Commands:

📅 View Tasks:
• today - Show today's tasks
• week - Show this week's tasks  
• month - Show this month's tasks
• list - Show all upcoming tasks
• ids - Show all task IDs for easy reference

➕ Add Tasks (New Format):
• add Dentist appointment 2025-09-20 15:00
• add Buy groceries tomorrow 18:00
• add Gym session 2025-09-13 07:00 weekly
• add Team meeting 2025-09-15 09:00 biweekly Monday
• add Salary review 2025-09-30 10:00 monthly
• add Church service 2025-09-07 10:00 first Sunday of every month
• add Anniversary dinner 2025-02-17 19:00 special
• add Baby vaccination 2025-10-05 09:00 monthly first Saturday special

✏️ Update Tasks:
• update "Task Name" to 3:00 pm
• update "Task Name" to tomorrow at 10:00 am
• update 1 to 3:00 pm

🗑️ Delete Tasks:
• delete "Task Name"
• delete 1

❓ Get Help:
• help, commands, or hey assistant - Show this help message

💡 Command Format:
• add {task title} {date} {time} [recurrence] [special]
• Date: YYYY-MM-DD, today, tomorrow, next Monday
• Time: HH:mm (24h) or 3pm style
• Recurrence: weekly, biweekly, monthly, first Sunday of every month
• Special: keyword "special" for important tasks

🆔 Task IDs:
• Each task has a simple number ID (1, 2, 3, etc.)
• Use task IDs for precise updates/deletes
• Task IDs are shown in all task lists
• Example: 1, 2, 3

Type any command to get started!`;

    await this.sendTextMessage(userId, helpText);
  }

  // Send help reply (for user interactions)
  async sendHelpReply(replyToken) {
    const helpText = `🤖 Mark's Assistant - Available Commands:

📅 View Tasks:
• today - Show today's tasks
• week - Show this week's tasks  
• month - Show this month's tasks
• list - Show all upcoming tasks
• ids - Show all task IDs for easy reference

➕ Add Tasks (New Format):
• add Dentist appointment 2025-09-20 15:00
• add Buy groceries tomorrow 18:00
• add Gym session 2025-09-13 07:00 weekly
• add Team meeting 2025-09-15 09:00 biweekly Monday
• add Salary review 2025-09-30 10:00 monthly
• add Church service 2025-09-07 10:00 first Sunday of every month
• add Anniversary dinner 2025-02-17 19:00 special
• add Baby vaccination 2025-10-05 09:00 monthly first Saturday special

✏️ Update Tasks:
• update "Task Name" to 3:00 pm
• update "Task Name" to tomorrow at 10:00 am
• update 1 to 3:00 pm

🗑️ Delete Tasks:
• delete "Task Name"
• delete 1

❓ Get Help:
• help, commands, or hey assistant - Show this help message

💡 Command Format:
• add {task title} {date} {time} [recurrence] [special]
• Date: YYYY-MM-DD, today, tomorrow, next Monday
• Time: HH:mm (24h) or 3pm style
• Recurrence: weekly, biweekly, monthly, first Sunday of every month
• Special: keyword "special" for important tasks

🆔 Task IDs:
• Each task has a simple number ID (1, 2, 3, etc.)
• Use task IDs for precise updates/deletes
• Task IDs are shown in all task lists
• Example: 1, 2, 3

Type any command to get started!`;

    await this.sendReplyMessage(replyToken, helpText);
  }

  // Command handlers (for push messages - scheduled reminders)
  async handleTodayCommand(userId) {
    const tasks = await this.database.getTodaysTasks(userId);
    await this.sendTaskListMessage(userId, tasks, "📅 Today's Tasks");
  }

  async handleWeekCommand(userId) {
    const tasks = await this.database.getWeeklyTasks(userId);
    await this.sendTaskListMessage(userId, tasks, "📅 This Week's Tasks");
  }

  async handleMonthCommand(userId) {
    const tasks = await this.database.getMonthlyTasks(userId);
    await this.sendTaskListMessage(userId, tasks, "📅 This Month's Tasks");
  }

  async handleListCommand(userId) {
    const tasks = await this.database.getTasks(userId);
    await this.sendTaskListMessage(userId, tasks, "📋 All Upcoming Tasks");
  }

  async handleAddCommand(userId, message) {
    try {
      const taskData = nlpParser.parseAddCommand(message);
      nlpParser.validateTaskData(taskData);
      
      const task = await this.database.createTask({
        user_id: userId,
        title: taskData.title,
        scheduled_time: taskData.scheduledTime,
        is_special: taskData.isSpecial,
        is_recurring: taskData.isRecurring,
        recurrence_pattern: taskData.recurrencePattern,
        is_active: true
      });

      // Schedule reminders for the task
      await reminderScheduler.scheduleRemindersForTask(task);

      await this.sendTextMessage(userId, `✅ Task "${task.title}" added successfully!\n📅 ${this.formatDateTime(task.scheduled_time)}${task.is_special ? ' ⭐' : ''}${task.is_recurring ? ' 🔄' : ''}`);
    } catch (error) {
      await this.sendTextMessage(userId, `❌ Error: ${error.message}`);
    }
  }

  async handleDeleteCommand(userId, message) {
    try {
      const identifier = nlpParser.parseDeleteCommand(message);
      
      if (identifier.type === 'displayId') {
        // Get tasks and find the one with the matching display ID
        const tasks = await this.database.getTasks(userId);
        const taskIndex = identifier.value - 1; // Convert to 0-based index
        
        if (taskIndex >= 0 && taskIndex < tasks.length) {
          const task = tasks[taskIndex];
          await this.database.deleteTask(task.id, userId);
          await this.sendTextMessage(userId, `✅ Task "${task.title}" deleted successfully!`);
        } else {
          await this.sendTextMessage(userId, `❌ Task ID ${identifier.value} not found. Use "list" to see available task IDs.`);
        }
      } else {
        // Find task by title
        const tasks = await this.database.getTasks(userId);
        const matchingTasks = tasks.filter(task => 
          task.title.toLowerCase().includes(identifier.value.toLowerCase())
        );
        
        if (matchingTasks.length === 0) {
          await this.sendTextMessage(userId, `❌ No task found with title "${identifier.value}"`);
        } else if (matchingTasks.length === 1) {
          await this.database.deleteTask(matchingTasks[0].id, userId);
          await this.sendTextMessage(userId, `✅ Task "${matchingTasks[0].title}" deleted successfully!`);
        } else {
          // Multiple matches - show options
          const taskList = matchingTasks.map((task, index) => 
            `${index + 1}. ${task.title} - ${this.formatDateTime(task.scheduled_time)}`
          ).join('\n');
          
          await this.sendTextMessage(userId, `Multiple tasks found with "${identifier.value}":\n\n${taskList}\n\nPlease be more specific or use the task ID.`);
        }
      }
    } catch (error) {
      await this.sendTextMessage(userId, `❌ Error: ${error.message}`);
    }
  }

  async handleUpdateCommand(userId, message) {
    try {
      const updateData = nlpParser.parseUpdateCommand(message);
      
      let task;
      if (updateData.identifier.type === 'displayId') {
        // Get tasks and find the one with the matching display ID
        const tasks = await this.database.getTasks(userId);
        const taskIndex = updateData.identifier.value - 1; // Convert to 0-based index
        
        if (taskIndex >= 0 && taskIndex < tasks.length) {
          task = tasks[taskIndex];
        } else {
          await this.sendTextMessage(userId, `❌ Task ID ${updateData.identifier.value} not found. Use "list" to see available task IDs.`);
          return;
        }
      } else {
        // Find task by title
        const tasks = await this.database.getTasks(userId);
        const matchingTasks = tasks.filter(t => 
          t.title.toLowerCase().includes(updateData.identifier.value.toLowerCase())
        );
        
        if (matchingTasks.length === 0) {
          await this.sendTextMessage(userId, `❌ No task found with title "${updateData.identifier.value}"`);
          return;
        } else if (matchingTasks.length > 1) {
          const taskList = matchingTasks.map((t, index) => 
            `${index + 1}. ${t.title} - ${this.formatDateTime(t.scheduled_time)}`
          ).join('\n');
          
          await this.sendTextMessage(userId, `Multiple tasks found with "${updateData.identifier.value}":\n\n${taskList}\n\nPlease be more specific or use the task ID.`);
          return;
        }
        
        task = matchingTasks[0];
      }
      
      if (!task) {
        await this.sendTextMessage(userId, "❌ Task not found");
        return;
      }
      
      const updatedTask = await this.database.updateTask(task.id, updateData.updates, userId);
      await this.sendTextMessage(userId, `✅ Task "${updatedTask.title}" updated successfully!\n📅 ${this.formatDateTime(updatedTask.scheduled_time)}${updatedTask.is_special ? ' ⭐' : ''}${updatedTask.is_recurring ? ' 🔄' : ''}`);
    } catch (error) {
      await this.sendTextMessage(userId, `❌ Error: ${error.message}`);
    }
  }

  async handleDeleteTaskById(userId, taskId) {
    await this.database.deleteTask(taskId, userId);
    await this.sendTextMessage(userId, "✅ Task deleted successfully!");
  }

  // Reply-based command handlers (for user interactions)
  async handleTodayCommandReply(userId, replyToken) {
    await this.handleTaskListCommand(userId, replyToken, this.database.getTodaysTasks.bind(this.database), "📅 Today's Tasks", true);
  }

  async handleWeekCommandReply(userId, replyToken) {
    await this.handleTaskListCommand(userId, replyToken, this.database.getWeeklyTasks.bind(this.database), "📅 This Week's Tasks", true);
  }

  async handleMonthCommandReply(userId, replyToken) {
    await this.handleTaskListCommand(userId, replyToken, this.database.getMonthlyTasks.bind(this.database), "📅 This Month's Tasks", true);
  }

  async handleListCommandReply(userId, replyToken) {
    await this.handleTaskListCommand(userId, replyToken, this.database.getTasks.bind(this.database), "📋 All Upcoming Tasks", true);
  }

  async handleIdsCommandReply(userId, replyToken) {
    try {
      const tasks = await this.database.getTasks(userId);
      const message = this.formatTaskIdsList(tasks);
      await this.sendReplyMessage(replyToken, message);
    } catch (error) {
      const errorMessage = `❌ Error retrieving task IDs: ${error.message}`;
      await this.sendReplyMessage(replyToken, errorMessage);
    }
  }

  async handleAddCommandReply(userId, replyToken, message) {
    try {
      const taskData = nlpParser.parseAddCommand(message);
      nlpParser.validateTaskData(taskData);
      
      const task = await this.database.createTask({
        user_id: userId,
        title: taskData.title,
        scheduled_time: taskData.scheduledTime,
        is_special: taskData.isSpecial,
        is_recurring: taskData.isRecurring,
        recurrence_pattern: taskData.recurrencePattern,
        is_active: true
      });

      // Schedule reminders for the task with error handling
      try {
        await reminderScheduler.scheduleRemindersForTask(task);
        console.log('✅ Successfully scheduled reminders for task:', task.id);
      } catch (schedulerError) {
        console.error('⚠️ Failed to schedule reminders for task:', task.id, schedulerError);
        // Don't fail the entire operation if reminder scheduling fails
        // The task is still created, just without automatic reminders
      }

      await this.sendReplyMessage(replyToken, `✅ Task "${task.title}" added successfully!\n📅 ${this.formatDateTime(task.scheduled_time)}${task.is_special ? ' ⭐' : ''}${task.is_recurring ? ' 🔄' : ''}`);
    } catch (error) {
      console.error('❌ Error in handleAddCommandReply:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      await this.sendReplyMessage(replyToken, `❌ Error adding task: ${errorMessage}`);
    }
  }

  async handleDeleteCommandReply(userId, replyToken, message) {
    try {
      const identifier = nlpParser.parseDeleteCommand(message);
      
      if (identifier.type === 'displayId') {
        // Get tasks and find the one with the matching display ID
        const tasks = await this.database.getTasks(userId);
        const taskIndex = identifier.value - 1; // Convert to 0-based index
        
        if (taskIndex >= 0 && taskIndex < tasks.length) {
          const task = tasks[taskIndex];
          await this.database.deleteTask(task.id, userId);
          await this.sendReplyMessage(replyToken, `✅ Task "${task.title}" deleted successfully!`);
        } else {
          await this.sendReplyMessage(replyToken, `❌ Task ID ${identifier.value} not found. Use "list" to see available task IDs.`);
        }
      } else {
        // Find task by title - try exact match first, then partial match
        const tasks = await this.database.getTasks(userId);
        const exactMatches = tasks.filter(task => 
          task.title.toLowerCase() === identifier.value.toLowerCase()
        );
        
        let matchingTasks = exactMatches;
        if (matchingTasks.length === 0) {
          // Fall back to partial match if no exact match found
          matchingTasks = tasks.filter(task => 
            task.title.toLowerCase().includes(identifier.value.toLowerCase())
          );
        }
        
        if (matchingTasks.length === 0) {
          await this.sendReplyMessage(replyToken, `❌ No task found with title "${identifier.value}"`);
        } else if (matchingTasks.length === 1) {
          await this.database.deleteTask(matchingTasks[0].id, userId);
          await this.sendReplyMessage(replyToken, `✅ Task "${matchingTasks[0].title}" deleted successfully!`);
        } else {
          // Multiple matches - show options
          const taskList = matchingTasks.map((task, index) => 
            `${index + 1}. ${task.title} - ${this.formatDateTime(task.scheduled_time)}`
          ).join('\n');
          
          await this.sendReplyMessage(replyToken, `Multiple tasks found with "${identifier.value}":\n\n${taskList}\n\nPlease be more specific or use the task ID.`);
        }
      }
    } catch (error) {
      await this.sendReplyMessage(replyToken, `❌ Error: ${error.message}`);
    }
  }

  async handleUpdateCommandReply(userId, replyToken, message) {
    try {
      const updateData = nlpParser.parseUpdateCommand(message);
      
      let task;
      if (updateData.identifier.type === 'displayId') {
        // Get tasks and find the one with the matching display ID
        const tasks = await this.database.getTasks(userId);
        const taskIndex = updateData.identifier.value - 1; // Convert to 0-based index
        
        if (taskIndex >= 0 && taskIndex < tasks.length) {
          task = tasks[taskIndex];
        } else {
          await this.sendReplyMessage(replyToken, `❌ Task ID ${updateData.identifier.value} not found. Use "list" to see available task IDs.`);
          return;
        }
      } else {
        // Find task by title - try exact match first, then partial match
        const tasks = await this.database.getTasks(userId);
        const exactMatches = tasks.filter(t => 
          t.title.toLowerCase() === updateData.identifier.value.toLowerCase()
        );
        
        let matchingTasks = exactMatches;
        if (matchingTasks.length === 0) {
          // Fall back to partial match if no exact match found
          matchingTasks = tasks.filter(t => 
            t.title.toLowerCase().includes(updateData.identifier.value.toLowerCase())
          );
        }
        
        if (matchingTasks.length === 0) {
          await this.sendReplyMessage(replyToken, `❌ No task found with title "${updateData.identifier.value}"`);
          return;
        } else if (matchingTasks.length > 1) {
          const taskList = matchingTasks.map((t, index) => 
            `${index + 1}. ${t.title} - ${this.formatDateTime(t.scheduled_time)}`
          ).join('\n');
          
          await this.sendReplyMessage(replyToken, `Multiple tasks found with "${updateData.identifier.value}":\n\n${taskList}\n\nPlease be more specific or use the task ID.`);
          return;
        }
        
        task = matchingTasks[0];
      }
      
      if (!task) {
        await this.sendReplyMessage(replyToken, "❌ Task not found");
        return;
      }
      
      const updatedTask = await this.database.updateTask(task.id, updateData.updates, userId);
      await this.sendReplyMessage(replyToken, `✅ Task "${updatedTask.title}" updated successfully!\n📅 ${this.formatDateTime(updatedTask.scheduled_time)}${updatedTask.is_special ? ' ⭐' : ''}${updatedTask.is_recurring ? ' 🔄' : ''}`);
    } catch (error) {
      await this.sendReplyMessage(replyToken, `❌ Error: ${error.message}`);
    }
  }
}

module.exports = new LineBotService();
