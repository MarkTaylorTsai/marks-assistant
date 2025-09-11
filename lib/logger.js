// Comprehensive logging utility for Mark's Assistant
class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const prefix = this.getEmoji(level);
    
    if (Object.keys(data).length > 0) {
      return `${prefix} [${timestamp}] ${message}: ${JSON.stringify(data, null, 2)}`;
    }
    return `${prefix} [${timestamp}] ${message}`;
  }

  getEmoji(level) {
    const emojis = {
      error: '❌',
      warn: '⚠️',
      info: '✅',
      debug: '🔍'
    };
    return emojis[level] || '📝';
  }

  error(message, data = {}) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  warn(message, data = {}) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  info(message, data = {}) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  debug(message, data = {}) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  // Specific logging methods for different operations
  webhookReceived(eventCount, requestDetails = {}) {
    this.info('Webhook received', {
      eventCount,
      ...requestDetails
    });
  }

  webhookProcessed(eventCount, success = true) {
    if (success) {
      this.info('Webhook processed successfully', { eventCount });
    } else {
      this.error('Webhook processing failed', { eventCount });
    }
  }

  messageReceived(userId, messageType, messageLength) {
    this.debug('Message received', {
      userId,
      messageType,
      messageLength
    });
  }

  commandProcessed(userId, command, success = true) {
    if (success) {
      this.info('Command processed', { userId, command });
    } else {
      this.error('Command processing failed', { userId, command });
    }
  }

  reminderSent(reminderType, userId, taskId, success = true) {
    if (success) {
      this.info('Reminder sent', {
        reminderType,
        userId,
        taskId
      });
    } else {
      this.error('Reminder sending failed', {
        reminderType,
        userId,
        taskId
      });
    }
  }

  databaseOperation(operation, table, success = true, count = null) {
    const data = { operation, table };
    if (count !== null) data.count = count;
    
    if (success) {
      this.info('Database operation completed', data);
    } else {
      this.error('Database operation failed', data);
    }
  }

  cronJobStarted(jobType, requestDetails = {}) {
    this.info('Cron job started', {
      jobType,
      ...requestDetails
    });
  }

  cronJobCompleted(jobType, results = {}) {
    this.info('Cron job completed', {
      jobType,
      ...results
    });
  }

  cronJobFailed(jobType, error) {
    this.error('Cron job failed', {
      jobType,
      error: error.message,
      stack: error.stack
    });
  }

  // Performance logging
  performance(operation, duration, details = {}) {
    this.debug('Performance metric', {
      operation,
      duration: `${duration}ms`,
      ...details
    });
  }

  // Security logging
  security(event, details = {}) {
    this.warn('Security event', {
      event,
      ...details
    });
  }

  // User validation logging
  userValidation(userId, valid, reason = null) {
    if (valid) {
      this.debug('User validation passed', { userId });
    } else {
      this.warn('User validation failed', { userId, reason });
    }
  }

  // LINE API logging
  lineApiCall(endpoint, method, success = true, responseDetails = {}) {
    if (success) {
      this.debug('LINE API call successful', {
        endpoint,
        method,
        ...responseDetails
      });
    } else {
      this.error('LINE API call failed', {
        endpoint,
        method,
        ...responseDetails
      });
    }
  }

  // Task operation logging
  taskOperation(operation, taskId, userId, success = true, details = {}) {
    const data = { operation, taskId, userId, ...details };
    
    if (success) {
      this.info('Task operation completed', data);
    } else {
      this.error('Task operation failed', data);
    }
  }

  // Reminder operation logging
  reminderOperation(operation, reminderId, success = true, details = {}) {
    const data = { operation, reminderId, ...details };
    
    if (success) {
      this.info('Reminder operation completed', data);
    } else {
      this.error('Reminder operation failed', data);
    }
  }

  // Batch operation logging
  batchOperation(operation, totalCount, successCount, errorCount, details = {}) {
    this.info('Batch operation completed', {
      operation,
      totalCount,
      successCount,
      errorCount,
      ...details
    });
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the class and instance
module.exports = {
  Logger,
  logger
};
