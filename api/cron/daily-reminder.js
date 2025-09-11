const reminderScheduler = require('../../lib/reminder-scheduler');
const database = require('../../lib/database');
const lineBot = require('../../lib/line-bot');
const auth = require('../../lib/auth');
const security = require('../../lib/security');

module.exports = async (req, res) => {
  // Set security headers
  security.setSecurityHeaders(res);
  
  // Only allow GET requests (for cron jobs)
  if (req.method !== 'GET') {
    console.log('❌ Invalid request method for daily reminder:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate the request
  if (!auth.validateCronApiKey(req)) {
    console.error('❌ Unauthorized access to daily reminder endpoint');
    security.logSecurityEvent('unauthorized_cron_access', {
      endpoint: 'daily-reminder',
      clientIP: security.getClientIP(req)
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      timestamp: new Date().toISOString()
    });
  }

  try {
    console.log('🌅 Starting daily reminder process...');
    console.log('🔍 Request details:', {
      method: req.method,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
    
    // Get user ID from environment
    const userId = process.env.USER_LINE_ID;
    if (!userId) {
      console.error('❌ USER_LINE_ID environment variable not set');
      throw new Error('USER_LINE_ID environment variable not set');
    }

    console.log('🔍 Processing daily reminder for user:', userId);

    // Get today's tasks
    const todaysTasks = await database.getTodaysTasks(userId);
    console.log('✅ Fetched today\'s tasks:', { count: todaysTasks.length });
    
    if (todaysTasks.length === 0) {
      console.log('📨 Sending empty daily reminder to user:', userId);
      await lineBot.sendTextMessage(userId, '🌅 Good morning! You have no tasks scheduled for today. Have a great day!');
    } else {
      console.log('📨 Sending daily task list to user:', userId);
      await lineBot.sendTaskListMessage(userId, todaysTasks, "🌅 Good morning! Here's your schedule for today:");
    }

    // Process any pending reminders
    console.log('🔍 Processing pending reminders...');
    const processedCount = await reminderScheduler.processPendingReminders();
    
    // Generate recurring task instances
    console.log('🔍 Generating recurring task instances...');
    await reminderScheduler.generateRecurringInstances();
    
    // Clean up old tasks
    console.log('🔍 Cleaning up old tasks...');
    await reminderScheduler.cleanup();

    console.log('✅ Daily reminder process completed successfully:', {
      tasksCount: todaysTasks.length,
      remindersProcessed: processedCount,
      userId: userId
    });
    
    res.status(200).json({ 
      success: true, 
      tasksCount: todaysTasks.length,
      remindersProcessed: processedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Daily reminder process failed:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
