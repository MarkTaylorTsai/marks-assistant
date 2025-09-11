# Mark's Assistant - Comprehensive Logging System

This document outlines the comprehensive logging system implemented for Mark's Assistant LINE bot, providing detailed visibility into all operations, errors, and performance metrics.

## Logging Categories

### 🔍 **Normal Flow Logs**

These logs track successful operations and provide counts and status updates.

#### Database Operations

```
✅ Fetched tasks: { count: 5, userId: "U123..." }
✅ Fetched pending reminders: { count: 3, types: { hourly: 2, daily: 1 } }
✅ Successfully created task: { id: "abc-123", title: "Gym session" }
✅ Successfully marked reminder as sent: { id: "rem-456" }
```

#### Message Operations

```
📨 Successfully sent text message to user: U123...
📨 Successfully sent flex message to user: U123...
📨 Successfully sent reminder message: { reminderType: "hourly", userId: "U123...", taskId: "abc-123" }
```

#### Command Processing

```
✅ Command processed: { userId: "U123...", command: "add" }
✅ Task operation completed: { operation: "create", taskId: "abc-123", userId: "U123..." }
```

### ⚠️ **Warning Logs**

These logs indicate non-critical issues that don't prevent operation.

#### User ID Validation

```
⚠️ Skipping user U123 - not a valid LINE user ID format
⚠️ Skipping group G456 - not a valid LINE group ID format
```

#### Unhandled Events

```
⚠️ Unhandled event type: follow
⚠️ Unknown command from user: { userId: "U123...", message: "random text" }
```

### ❌ **Error Logs**

These logs capture failures and provide detailed error information.

#### Database Errors

```
❌ Error getting tasks: { error: "Connection timeout", userId: "U123..." }
❌ Error creating task: { error: "Validation failed", taskData: {...} }
❌ Error marking reminder sent: { error: "Record not found", reminderId: "rem-456" }
```

#### LINE API Errors

```
❌ Failed to send text message to user: U123... { error: "Invalid user ID" }
LINE API error details: { message: "Invalid user ID", code: 400 }
LINE API status: 400
LINE API headers: { "content-type": "application/json" }
```

#### Processing Errors

```
❌ Failed to send reminder: { reminderId: "rem-456", reminderType: "hourly", taskId: "abc-123", userId: "U123...", error: "User blocked bot" }
❌ Error handling text message: { userId: "U123...", message: "add task", error: "Database connection failed" }
```

## Detailed Operation Logs

### 🔍 **Diagnostic Information**

These logs provide detailed information about operations for debugging and monitoring.

#### Reminder Processing

```
🔍 Processing pending reminders at: 2024-01-15T10:30:00.000Z
🔍 Processing reminder: { reminderId: "rem-456", reminderType: "hourly", taskId: "abc-123", taskTitle: "Gym session", userId: "U123..." }
🔍 Task details: { id: "abc-123", title: "Gym session", scheduled_time: "2024-01-15T11:30:00.000Z", is_special: false, is_recurring: false }
🔍 Message content: { messageLength: 45, preview: "⏰ Reminder: Gym session is coming up in 1 hour!..." }
```

#### Command Processing

```
🔍 Handling text message: { userId: "U123...", message: "add \"Gym\" at 7:00 am", messageLength: 20 }
🔍 Processing add command for user: U123...
🔍 Creating task: { title: "Gym", scheduled_time: "2024-01-15T07:00:00.000Z" }
```

#### Webhook Processing

```
🔍 Received webhook request: { method: "POST", headers: {...}, bodySize: 256, timestamp: "2024-01-15T10:30:00.000Z" }
🔍 Parsed webhook events: { count: 1 }
🔍 Event details: [{ type: "message", source: "user", userId: "U123...", messageType: "text" }]
🔍 Handling webhook events: { count: 1 }
🔍 Processing event: { type: "message", source: "user", userId: "U123...", messageType: "text" }
```

### 📊 **Count and Statistics**

These logs provide operational metrics and counts.

#### Reminder Processing

```
✅ Reminder processing completed: { total: 5, successful: 4, failed: 1 }
✅ Fetched pending reminders: { count: 5, types: { hourly: 3, daily: 1, special_day_before: 1 }, beforeTime: "2024-01-15T10:30:00.000Z" }
```

#### Recurring Task Generation

```
✅ Fetched recurring tasks: { count: 3 }
✅ Generated instances for task: { taskId: "abc-123", title: "Weekly meeting", instanceCount: 12 }
✅ Recurring task instance generation completed: { totalTasks: 3, totalInstances: 36, errors: 0 }
```

#### Cron Job Execution

```
✅ Daily reminder process completed successfully: { tasksCount: 3, remindersProcessed: 2, userId: "U123..." }
✅ Hourly reminder process completed successfully: { remindersProcessed: 1, timestamp: "2024-01-15T10:30:00.000Z" }
✅ Special reminder process completed successfully: { remindersProcessed: 0, timestamp: "2024-01-15T10:30:00.000Z" }
```

## Log Structure

### Standard Log Format

```
[EMOJI] [TIMESTAMP] MESSAGE: { JSON_DATA }
```

### Examples

```
🔍 [2024-01-15T10:30:00.000Z] Processing pending reminders at: 2024-01-15T10:30:00.000Z
📨 [2024-01-15T10:30:00.000Z] Successfully sent reminder message: {"reminderType":"hourly","userId":"U123...","taskId":"abc-123","taskTitle":"Gym session"}
❌ [2024-01-15T10:30:00.000Z] Failed to send reminder: {"reminderId":"rem-456","reminderType":"hourly","taskId":"abc-123","userId":"U123...","error":"User blocked bot"}
```

## Log Levels

The system supports different log levels that can be configured via the `LOG_LEVEL` environment variable:

- **error** (0): Only error messages
- **warn** (1): Warnings and errors
- **info** (2): Info, warnings, and errors (default)
- **debug** (3): All messages including detailed diagnostics

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Reminder Success Rate**: `successful / total` in reminder processing logs
2. **Command Processing Errors**: Count of command processing failures
3. **Database Connection Issues**: Database operation failures
4. **LINE API Failures**: Failed message sending attempts
5. **Webhook Processing**: Failed webhook events

### Alert Conditions

- Reminder success rate < 90%
- Database connection failures
- High volume of LINE API errors
- Webhook processing failures
- Cron job execution failures

## Log Analysis

### Common Patterns

- **Normal Operation**: Mix of 🔍, ✅, and 📨 logs
- **Issues**: Presence of ⚠️ and ❌ logs
- **Performance**: Timing information in diagnostic logs
- **User Behavior**: Command usage patterns in processing logs

### Troubleshooting

1. **No Reminders Sent**: Check for database connection errors and reminder processing logs
2. **Commands Not Working**: Look for command processing errors and webhook logs
3. **LINE API Issues**: Review LINE API error details and user ID validation warnings
4. **Database Problems**: Check database operation logs and connection status

## Implementation Details

The logging system is implemented across all major components:

- **Database Service** (`lib/database.js`): All CRUD operations
- **LINE Bot Service** (`lib/line-bot.js`): Message sending and command processing
- **Reminder Scheduler** (`lib/reminder-scheduler.js`): Reminder processing and generation
- **Webhook Handler** (`api/webhook.js`): Event processing
- **Cron Endpoints** (`api/cron/*.js`): Scheduled job execution
- **Logger Utility** (`lib/logger.js`): Centralized logging configuration

This comprehensive logging system provides full visibility into Mark's Assistant operations, making it easy to monitor, debug, and maintain the bot effectively.
