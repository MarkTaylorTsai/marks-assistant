const moment = require('moment-timezone');

class NaturalLanguageParser {
  constructor() {
    this.timezone = process.env.TIMEZONE || 'Asia/Taipei';
    
    // Define weekdays for parsing
    this.weekdays = {
      'monday': 1, 'mon': 1,
      'tuesday': 2, 'tue': 2, 'tues': 2,
      'wednesday': 3, 'wed': 3,
      'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
      'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6,
      'sunday': 0, 'sun': 0
    };
    
    // Define ordinals for parsing
    this.ordinals = {
      'first': 1, '1st': 1,
      'second': 2, '2nd': 2,
      'third': 3, '3rd': 3,
      'fourth': 4, '4th': 4
    };
  }

  // Parse add command with new format: add {task title} {date} {time} [recurrence] [special]
  parseAddCommand(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }
    
    const text = message.trim();
    
    // Validate message length
    if (text.length > 1000) {
      throw new Error('Message too long. Please keep commands under 1000 characters.');
    }
    
    // Check if command starts with 'add'
    if (!text.toLowerCase().startsWith('add ')) {
      throw new Error('Command must start with "add"');
    }
    
    // Remove 'add' prefix and split into tokens
    const tokens = text.substring(4).trim().split(/\s+/);
    
    if (tokens.length < 3) {
      throw new Error('Command format: add {task title} {date} {time} [recurrence] [special]');
    }
    
    // Parse the command
    const result = this.parseCommandTokens(tokens);
    
    // Validate the result
    this.validateTaskData(result);
    
    return result;
  }
  
  // Parse command tokens according to the grammar
  parseCommandTokens(tokens) {
    let index = 0;
    
    // Parse task title (everything until we find a valid date)
    const titleTokens = [];
    let dateIndex = -1;
    
    // Find the first valid date token
    for (let i = 0; i < tokens.length; i++) {
      if (this.isDateToken(tokens[i]) || this.isDatePhrase(tokens, i)) {
        dateIndex = i;
        break;
      }
      titleTokens.push(tokens[i]);
    }
    
    if (dateIndex === -1) {
      throw new Error('No valid date found in command');
    }
    
    const title = titleTokens.join(' ').trim();
    if (!title) {
      throw new Error('Task title cannot be empty');
    }
    
    if (title.length > 200) {
      throw new Error('Task title must be 200 characters or less');
    }
    
    index = dateIndex;
    
    // Parse date
    const { date, nextIndex } = this.parseDate(tokens, index);
    index = nextIndex;
    
    // Parse time
    const { time, nextIndex: timeIndex } = this.parseTime(tokens, index);
    index = timeIndex;
    
    // Parse recurrence (optional)
    let recurrencePattern = null;
    if (index < tokens.length) {
      const { recurrence, nextIndex: recurIndex } = this.parseRecurrence(tokens, index);
      recurrencePattern = recurrence;
      index = recurIndex;
    }
    
    // Check for special flag (optional)
    let isSpecial = false;
    if (index < tokens.length && tokens[index].toLowerCase() === 'special') {
      isSpecial = true;
    }
    
    // Combine date and time
    const scheduledTime = this.combineDateTime(date, time);
    
    return {
      title,
      scheduledTime,
      recurrencePattern,
      isSpecial,
      isRecurring: !!recurrencePattern
    };
  }
  
  // Check if a token looks like a date
  isDateToken(token) {
    // YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      return true;
    }
    
    // Natural date words
    const dateWords = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'next'];
    return dateWords.includes(token.toLowerCase());
  }
  
  // Check if tokens form a date phrase
  isDatePhrase(tokens, startIndex) {
    if (startIndex >= tokens.length) return false;
    
    const token = tokens[startIndex].toLowerCase();
    
    // "next monday", "next tuesday", etc.
    if (token === 'next' && startIndex + 1 < tokens.length) {
      const nextToken = tokens[startIndex + 1].toLowerCase();
      return this.weekdays.hasOwnProperty(nextToken);
    }
    
    return false;
  }
  
  // Parse date from tokens
  parseDate(tokens, startIndex) {
    if (startIndex >= tokens.length) {
      throw new Error('Expected date but found end of command');
    }
    
    const token = tokens[startIndex].toLowerCase();
    const now = moment().tz(this.timezone);
    
    // YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(tokens[startIndex])) {
      const dateStr = tokens[startIndex];
      const date = moment.tz(dateStr, 'YYYY-MM-DD', this.timezone);
      
      if (!date.isValid()) {
        throw new Error(`Invalid date format: ${dateStr}`);
      }
      
      return { date, nextIndex: startIndex + 1 };
    }
    
    // "today"
    if (token === 'today') {
      return { date: now.clone(), nextIndex: startIndex + 1 };
    }
    
    // "tomorrow"
    if (token === 'tomorrow') {
      return { date: now.clone().add(1, 'day'), nextIndex: startIndex + 1 };
    }
    
    // Weekday (next occurrence)
    if (this.weekdays.hasOwnProperty(token)) {
      const targetDay = this.weekdays[token];
      const currentDay = now.day();
      
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) {
        daysToAdd += 7; // Next week
      }
      
      return { date: now.clone().add(daysToAdd, 'days'), nextIndex: startIndex + 1 };
    }
    
    // "next monday", "next tuesday", etc.
    if (token === 'next' && startIndex + 1 < tokens.length) {
      const nextToken = tokens[startIndex + 1].toLowerCase();
      if (this.weekdays.hasOwnProperty(nextToken)) {
        const targetDay = this.weekdays[nextToken];
        const currentDay = now.day();
        
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week
        }
        daysToAdd += 7; // "next" means the week after
        
        return { date: now.clone().add(daysToAdd, 'days'), nextIndex: startIndex + 2 };
      }
    }
    
    throw new Error(`Invalid date: ${token}`);
  }
  
  // Parse time from tokens
  parseTime(tokens, startIndex) {
    if (startIndex >= tokens.length) {
      throw new Error('Expected time but found end of command');
    }
    
    const token = tokens[startIndex];
    
    // HH:mm format (24-hour)
    if (/^\d{1,2}:\d{2}$/.test(token)) {
      const [hour, minute] = token.split(':').map(Number);
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error(`Invalid time: ${token}`);
      }
      return { time: { hour, minute }, nextIndex: startIndex + 1 };
    }
    
    // 3pm, 2:30am format
    const timeMatch = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (timeMatch) {
      let [, hour, minute = '00', period] = timeMatch;
      hour = parseInt(hour);
      minute = parseInt(minute);
      
      if (period.toLowerCase() === 'pm' && hour !== 12) {
        hour += 12;
      } else if (period.toLowerCase() === 'am' && hour === 12) {
        hour = 0;
      }
      
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error(`Invalid time: ${token}`);
      }
      
      return { time: { hour, minute }, nextIndex: startIndex + 1 };
    }
    
    throw new Error(`Invalid time format: ${token}`);
  }
  
  // Parse recurrence from tokens
  parseRecurrence(tokens, startIndex) {
    if (startIndex >= tokens.length) {
      return { recurrence: null, nextIndex: startIndex };
    }
    
    const token = tokens[startIndex].toLowerCase();
    
    // "weekly"
    if (token === 'weekly') {
      return { 
        recurrence: JSON.stringify({ type: 'weekly' }), 
        nextIndex: startIndex + 1 
      };
    }
    
    // "biweekly"
    if (token === 'biweekly') {
      let dayOfWeek = 'monday'; // default
      
      // Check for optional day specification
      if (startIndex + 1 < tokens.length) {
        const nextToken = tokens[startIndex + 1].toLowerCase();
        if (this.weekdays.hasOwnProperty(nextToken)) {
          dayOfWeek = nextToken;
          return { 
            recurrence: JSON.stringify({ type: 'biweekly', dayOfWeek }), 
            nextIndex: startIndex + 2 
          };
        }
      }
      
      return { 
        recurrence: JSON.stringify({ type: 'biweekly', dayOfWeek }), 
        nextIndex: startIndex + 1 
      };
    }
    
    // Check for "monthly first Saturday" pattern first (before generic "monthly")
    if (token === 'monthly' && startIndex + 2 < tokens.length) {
      const nextToken = tokens[startIndex + 1].toLowerCase();
      const thirdToken = tokens[startIndex + 2].toLowerCase();
      
      if (this.ordinals.hasOwnProperty(nextToken) && this.weekdays.hasOwnProperty(thirdToken)) {
        const ordinal = this.ordinals[nextToken];
        const weekday = thirdToken;
        
        return { 
          recurrence: JSON.stringify({ 
            type: 'monthly', 
            weekdayOfMonth: { week: this.getOrdinalName(ordinal), day: weekday } 
          }), 
          nextIndex: startIndex + 3 
        };
      }
    }
    
    // "monthly" (generic)
    if (token === 'monthly') {
      return { 
        recurrence: JSON.stringify({ type: 'monthly' }), 
        nextIndex: startIndex + 1 
      };
    }
    
    // "first Sunday of every month", "second Monday of every month", etc.
    if (this.ordinals.hasOwnProperty(token) && startIndex + 3 < tokens.length) {
      const ordinal = this.ordinals[token];
      const weekday = tokens[startIndex + 1].toLowerCase();
      const ofToken = tokens[startIndex + 2].toLowerCase();
      const everyToken = tokens[startIndex + 3].toLowerCase();
      const monthToken = tokens[startIndex + 4] ? tokens[startIndex + 4].toLowerCase() : '';
      
      if (this.weekdays.hasOwnProperty(weekday) && 
          ofToken === 'of' && 
          everyToken === 'every' && 
          monthToken === 'month') {
        
        return { 
          recurrence: JSON.stringify({ 
            type: 'monthly', 
            weekdayOfMonth: { week: this.getOrdinalName(ordinal), day: weekday } 
          }), 
          nextIndex: startIndex + 5 
        };
      }
    }
    
    // Handle "monthly first Saturday" format (without "of every month")
    if (startIndex + 2 < tokens.length) {
      const nextToken = tokens[startIndex + 1].toLowerCase();
      const thirdToken = tokens[startIndex + 2].toLowerCase();
      
      if (nextToken === 'monthly' && this.ordinals.hasOwnProperty(thirdToken) && startIndex + 3 < tokens.length) {
        const ordinal = this.ordinals[thirdToken];
        const weekday = tokens[startIndex + 3].toLowerCase();
        
        if (this.weekdays.hasOwnProperty(weekday)) {
          return { 
            recurrence: JSON.stringify({ 
              type: 'monthly', 
              weekdayOfMonth: { week: this.getOrdinalName(ordinal), day: weekday } 
            }), 
            nextIndex: startIndex + 4 
          };
        }
      }
    }
    
    
    // Handle "first Saturday monthly" format (alternative order)
    if (this.ordinals.hasOwnProperty(token) && startIndex + 2 < tokens.length) {
      const weekday = tokens[startIndex + 1].toLowerCase();
      const monthlyToken = tokens[startIndex + 2].toLowerCase();
      
      if (this.weekdays.hasOwnProperty(weekday) && monthlyToken === 'monthly') {
        const ordinal = this.ordinals[token];
        return { 
          recurrence: JSON.stringify({ 
            type: 'monthly', 
            weekdayOfMonth: { week: this.getOrdinalName(ordinal), day: weekday } 
          }), 
          nextIndex: startIndex + 3 
        };
      }
    }
    
    // No valid recurrence found
    return { recurrence: null, nextIndex: startIndex };
  }
  
  // Get ordinal name from number
  getOrdinalName(num) {
    const names = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
    return names[num] || 'first';
  }
  
  // Combine date and time into ISO string with timezone offset
  combineDateTime(date, time) {
    return date.clone()
      .hour(time.hour)
      .minute(time.minute)
      .second(0)
      .millisecond(0)
      .format('YYYY-MM-DDTHH:mm:ss.SSSZ');
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
    const idMatch = text.match(/update\s+(\d+)/);
    
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
      const id = parseInt(idMatch[1]);
      if (isNaN(id) || id < 1) {
        throw new Error('Task ID must be a positive number');
      }
      identifier = { type: 'displayId', value: id };
    } else {
      throw new Error('Please provide a task title in quotes or task ID, e.g., update "Gym session" or update 1');
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
    const idMatch = text.match(/delete\s+(\d+)/);
    
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
      const id = parseInt(idMatch[1]);
      if (isNaN(id) || id < 1) {
        throw new Error('Task ID must be a positive number');
      }
      return { type: 'displayId', value: id };
    } else {
      throw new Error('Please provide a task title in quotes or task ID, e.g., delete "Gym session" or delete 1');
    }
  }

  // Parse time and recurrence from text (legacy method for update commands)
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
    scheduledTime = this.parseTimeLegacy(text);
    
    // Parse recurrence
    recurrencePattern = this.parseRecurrenceLegacy(text);

    return { scheduledTime, recurrencePattern, isSpecial };
  }

  // Parse time from text (legacy method for update commands)
  parseTimeLegacy(text) {
    const now = moment().tz(this.timezone);
    
    // Handle relative times
    if (text.includes('tomorrow')) {
      const tomorrow = now.clone().add(1, 'day');
      const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (timeMatch) {
        const [, hour, minute = '00', period] = timeMatch;
        const time = this.parseTimeString(`${hour}:${minute} ${period || 'am'}`);
        return tomorrow.clone().hour(time.hour).minute(time.minute).second(0).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      }
      return tomorrow.clone().hour(9).minute(0).second(0).format('YYYY-MM-DDTHH:mm:ss.SSSZ'); // Default to 9 AM
    }

    if (text.includes('today')) {
      const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (timeMatch) {
        const [, hour, minute = '00', period] = timeMatch;
        const time = this.parseTimeString(`${hour}:${minute} ${period || 'am'}`);
        return now.clone().hour(time.hour).minute(time.minute).second(0).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
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
          return date.clone().hour(time.hour).minute(time.minute).second(0).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
        }
        return date.clone().hour(9).minute(0).second(0).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      }
    }

    // Handle time only (assume today or next occurrence)
    const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      const [, hour, minute = '00', period] = timeMatch;
      const time = this.parseTimeString(`${hour}:${minute} ${period || 'am'}`);
      const today = now.clone().hour(time.hour).minute(time.minute).second(0);
      
      if (today.isBefore(now)) {
        return today.add(1, 'day').format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      }
      return today.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
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

  // Parse recurrence pattern (legacy method for update commands)
  parseRecurrenceLegacy(text) {
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

    // Validate the scheduled time is a valid ISO string
    const scheduledMoment = moment(taskData.scheduledTime);
    if (!scheduledMoment.isValid()) {
      throw new Error('Invalid scheduled time format');
    }

    // Check if scheduled time is in the past (for non-recurring tasks)
    // Use the same timezone for comparison
    const now = moment().tz(this.timezone);
    if (!taskData.isRecurring && scheduledMoment.tz(this.timezone).isBefore(now)) {
      throw new Error('Cannot schedule tasks in the past');
    }

    return true;
  }
}

module.exports = new NaturalLanguageParser();
