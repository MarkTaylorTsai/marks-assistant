// Authentication utilities for Mark's Assistant

class AuthService {
  constructor() {
    this.cronApiKey = process.env.CRON_API_KEY;
  }

  // Validate cron API key (supports cron-job.org and other external cron services)
  validateCronApiKey(req) {
    // Support multiple ways to pass API key for different cron services
    const providedKey = req.headers['x-api-key'] || 
                       req.headers['authorization']?.replace('Bearer ', '') ||
                       req.query.api_key || 
                       req.query.key;
    
    if (!this.cronApiKey) {
      console.error('❌ CRON_API_KEY environment variable not set');
      return false;
    }
    
    if (!providedKey) {
      console.error('❌ Missing API key in cron request');
      return false;
    }
    
    if (providedKey !== this.cronApiKey) {
      console.error('❌ Invalid API key in cron request');
      return false;
    }
    
    console.log('✅ Cron API key validated successfully');
    return true;
  }

  // Middleware for cron endpoint authentication
  authenticateCron(req, res, next) {
    if (!this.validateCronApiKey(req)) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
        timestamp: new Date().toISOString()
      });
    }
    
    if (next) next();
  }

  // Validate user ID format
  isValidUserId(userId) {
    // LINE user IDs are typically 32-33 character strings starting with 'U'
    return userId && 
           typeof userId === 'string' && 
           userId.length >= 30 && 
           userId.length <= 35 &&
           userId.startsWith('U');
  }

  // Sanitize user input
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim()
      .substring(0, 1000); // Limit length
  }

  // Validate task title
  validateTaskTitle(title) {
    if (!title || typeof title !== 'string') {
      throw new Error('Task title must be a non-empty string');
    }
    
    const sanitized = this.sanitizeInput(title);
    if (sanitized.length === 0) {
      throw new Error('Task title cannot be empty after sanitization');
    }
    
    if (sanitized.length > 200) {
      throw new Error('Task title must be 200 characters or less');
    }
    
    return sanitized;
  }

  // Validate time string
  validateTimeString(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
      throw new Error('Time must be a valid string');
    }
    
    // Basic time format validation
    const timeRegex = /^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i;
    if (!timeRegex.test(timeStr.trim())) {
      throw new Error('Invalid time format. Use format like "7:00 am" or "14:30"');
    }
    
    return this.sanitizeInput(timeStr);
  }
}

module.exports = new AuthService();
