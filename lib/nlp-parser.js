const moment = require('moment-timezone');

class NaturalLanguageParser {
  constructor() {
    this.timezone = process.env.TIMEZONE || 'Asia/Taipei';
  }

  // Parse add command
  parseAddCommand(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }
    
    const text = message.toLowerCase().trim();
    
    // Validate message length
    if (text.length > 1000) {
      throw new Error('Message too long. Please keep commands under 1000 characters.');
    }
    
    // Extract task title (between quotes)
    const titleMatch = text.match(/add\s+"([^"]+)"/);
    if (!titleMatch) {
      throw new Error('Please provide a task title in quotes, e.g., add "Gym session"');
    }
    
    const title = titleMatch[1];
    
    // Validate title
    if (!title || title.trim().length === 0) {
      throw new Error('Task title cannot be empty');
    }
    
    if (title.length > 200) {
      throw new Error('Task title must be 200 characters or less');
    }
    
    const remainingText = text.replace(/add\s+"[^"]+"\s*/, '').trim();
    
    // Parse time and recurrence
    const { scheduledTime, recurrencePattern, isSpecial } = this.parseTimeAndRecurrence(remainingText);
    
    return {
      title: title.trim(),
      scheduledTime,
      recurrencePattern,
      isSpecial,
      isRecurring: !!recurrencePattern
    };
  }

  // Parse update command
  parseUpdateCommand(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }
    
    const text = message.toLowerCase().trim();
    
    // Validate message length
    if (text.length > 1000) {
      throw new Error('Message too long. Please keep commands under 1000 characters.');
    }
    
    // Extract task identifier (title or ID)
    const titleMatch = text.match(/update\s+"([^"]+)"/);
    const idMatch = text.match(/update\s+([a-f0-9-]+)/);
    
    let identifier;
    if (titleMatch) {
      const title = titleMatch[1];
      if (!title || title.trim().length === 0) {
        throw new Error('Task title cannot be empty');
      }
      if (title.length > 200) {
        throw new Error('Task title must be 200 characters or less');
      }
      identifier = { type: 'title', value: title.trim() };
    } else if (idMatch) {
      const id = idMatch[1];
      if (!this.isValidUUID(id)) {
        throw new Error('Invalid task ID format');
      }
      identifier = { type: 'id', value: id };
    } else {
      throw new Error('Please provide a task title in quotes or task ID, e.g., update "Gym session" or update 123e4567-e89b-12d3-a456-426614174000');
    }
    
    const remainingText = text.replace(/update\s+(?:"[^"]+"|[a-f0-9-]+)\s*/, '').trim();
    
    // Parse what to update
    const updates = {};
    
    if (remainingText.includes('to ')) {
      const timeText = remainingText.replace('to ', '').trim();
      const { scheduledTime, recurrencePattern, isSpecial } = this.parseTimeAndRecurrence(timeText);
      
      if (scheduledTime) updates.scheduled_time = scheduledTime;
      if (recurrencePattern) updates.recurrence_pattern = recurrencePattern;
      if (isSpecial !== undefined) updates.is_special = isSpecial;
    }
    
    return {
      identifier,
      updates
    };
  }

  // Parse delete command
  parseDeleteCommand(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }
    
    const text = message.toLowerCase().trim();
    
    // Validate message length
    if (text.length > 1000) {
      throw new Error('Message too long. Please keep commands under 1000 characters.');
    }
    
    const titleMatch = text.match(/delete\s+"([^"]+)"/);
    const idMatch = text.match(/delete\s+([a-f0-9-]+)/);
    
    if (titleMatch) {
      const title = titleMatch[1];
      if (!title || title.trim().length === 0) {
        throw new Error('Task title cannot be empty');
      }
      if (title.length > 200) {
        throw new Error('Task title must be 200 characters or less');
      }
      return { type: 'title', value: title.trim() };
    } else if (idMatch) {
      const id = idMatch[1];
      if (!this.isValidUUID(id)) {
        throw new Error('Invalid task ID format');
      }
      return { type: 'id', value: id };
    } else {
      throw new Error('Please provide a task title in quotes or task ID, e.g., delete "Gym session" or delete 123e4567-e89b-12d3-a456-426614174000');
    }
  }

  // Parse time and recurrence from text
  parseTimeAndRecurrence(text) {
    let scheduledTime = null;
    let recurrencePattern = null;
    let isSpecial = false;

    // Check for special flag
    if (text.includes('special')) {
      isSpecial = true;
      text = text.replace(/\bspecial\b/g, '').trim();
    }

    // Parse time
    scheduledTime = this.parseTime(text);
    
    // Parse recurrence
    recurrencePattern = this.parseRecurrence(text);

    return { scheduledTime, recurrencePattern, isSpecial };
  }

  // Parse time from text
  parseTime(text) {
    const now = moment().tz(this.timezone);
    
    // Handle relative times
    if (text.includes('tomorrow')) {
      const tomorrow = now.clone().add(1, 'day');
      const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (timeMatch) {
        const [, hour, minute = '00', period] = timeMatch;
        const time = this.parseTimeString(`${hour}:${minute} ${period || 'am'}`);
        return tomorrow.clone().hour(time.hour).minute(time.minute).second(0).toISOString();
      }
      return tomorrow.clone().hour(9).minute(0).second(0).toISOString(); // Default to 9 AM
    }

    if (text.includes('today')) {
      const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (timeMatch) {
        const [, hour, minute = '00', period] = timeMatch;
        const time = this.parseTimeString(`${hour}:${minute} ${period || 'am'}`);
        return now.clone().hour(time.hour).minute(time.minute).second(0).toISOString();
      }
    }

    // Handle specific dates
    const dateMatch = text.match(/(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?/);
    if (dateMatch) {
      const [, monthName, day] = dateMatch;
      const month = this.getMonthNumber(monthName);
      if (month !== -1) {
        const year = now.year();
        const date = moment.tz([year, month, day], this.timezone);
        if (date.isBefore(now)) {
          date.add(1, 'year');
        }
        
        const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        if (timeMatch) {
          const [, hour, minute = '00', period] = timeMatch;
          const time = this.parseTimeString(`${hour}:${minute} ${period || 'am'}`);
          return date.clone().hour(time.hour).minute(time.minute).second(0).toISOString();
        }
        return date.clone().hour(9).minute(0).second(0).toISOString();
      }
    }

    // Handle time only (assume today or next occurrence)
    const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      const [, hour, minute = '00', period] = timeMatch;
      const time = this.parseTimeString(`${hour}:${minute} ${period || 'am'}`);
      const today = now.clone().hour(time.hour).minute(time.minute).second(0);
      
      if (today.isBefore(now)) {
        return today.add(1, 'day').toISOString();
      }
      return today.toISOString();
    }

    return null;
  }

  // Parse time string (e.g., "7:30 am", "2:00 pm")
  parseTimeString(timeStr) {
    const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (!match) return { hour: 9, minute: 0 };

    let [, hour, minute = '00', period] = match;
    hour = parseInt(hour);
    minute = parseInt(minute);

    if (period && period.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12;
    } else if (period && period.toLowerCase() === 'am' && hour === 12) {
      hour = 0;
    }

    return { hour, minute };
  }

  // Parse recurrence pattern
  parseRecurrence(text) {
    // Weekly patterns
    if (text.includes('every monday')) {
      return JSON.stringify({ type: 'weekly', dayOfWeek: 'monday' });
    }
    if (text.includes('every tuesday')) {
      return JSON.stringify({ type: 'weekly', dayOfWeek: 'tuesday' });
    }
    if (text.includes('every wednesday')) {
      return JSON.stringify({ type: 'weekly', dayOfWeek: 'wednesday' });
    }
    if (text.includes('every thursday')) {
      return JSON.stringify({ type: 'weekly', dayOfWeek: 'thursday' });
    }
    if (text.includes('every friday')) {
      return JSON.stringify({ type: 'weekly', dayOfWeek: 'friday' });
    }
    if (text.includes('every saturday')) {
      return JSON.stringify({ type: 'weekly', dayOfWeek: 'saturday' });
    }
    if (text.includes('every sunday')) {
      return JSON.stringify({ type: 'weekly', dayOfWeek: 'sunday' });
    }

    // Biweekly patterns
    if (text.includes('every 2 weeks') || text.includes('biweekly')) {
      const dayMatch = text.match(/every\s+2\s+weeks?\s+on\s+(\w+)/i);
      if (dayMatch) {
        return JSON.stringify({ type: 'biweekly', dayOfWeek: dayMatch[1].toLowerCase() });
      }
      return JSON.stringify({ type: 'biweekly', dayOfWeek: 'monday' }); // Default
    }

    // Monthly patterns
    if (text.includes('first sunday of every month')) {
      return JSON.stringify({ 
        type: 'monthly', 
        weekdayOfMonth: { week: 'first', day: 'sunday' } 
      });
    }
    if (text.includes('first monday of every month')) {
      return JSON.stringify({ 
        type: 'monthly', 
        weekdayOfMonth: { week: 'first', day: 'monday' } 
      });
    }
    if (text.includes('last friday of every month')) {
      return JSON.stringify({ 
        type: 'monthly', 
        weekdayOfMonth: { week: 'last', day: 'friday' } 
      });
    }

    // Generic monthly
    if (text.includes('every month') || text.includes('monthly')) {
      const dayMatch = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+of\s+every\s+month/i);
      if (dayMatch) {
        return JSON.stringify({ type: 'monthly', dayOfMonth: parseInt(dayMatch[1]) });
      }
      return JSON.stringify({ type: 'monthly', dayOfMonth: 1 }); // Default to 1st
    }

    return null;
  }

  // Get month number from name
  getMonthNumber(monthName) {
    const months = {
      'january': 0, 'jan': 0,
      'february': 1, 'feb': 1,
      'march': 2, 'mar': 2,
      'april': 3, 'apr': 3,
      'may': 4,
      'june': 5, 'jun': 5,
      'july': 6, 'jul': 6,
      'august': 7, 'aug': 7,
      'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9,
      'november': 10, 'nov': 10,
      'december': 11, 'dec': 11
    };
    return months[monthName.toLowerCase()] || -1;
  }

  // Validate UUID format
  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Validate parsed data
  validateTaskData(taskData) {
    if (!taskData.title || taskData.title.trim().length === 0) {
      throw new Error('Task title cannot be empty');
    }

    if (!taskData.scheduledTime) {
      throw new Error('Please specify a time for the task');
    }

    // Check if scheduled time is in the past (for non-recurring tasks)
    if (!taskData.isRecurring && moment(taskData.scheduledTime).isBefore(moment())) {
      throw new Error('Cannot schedule tasks in the past');
    }

    return true;
  }
}

module.exports = new NaturalLanguageParser();
