const reminderScheduler = require('../../lib/reminder-scheduler');
const auth = require('../../lib/auth');
const security = require('../../lib/security');

module.exports = async (req, res) => {
  // Set security headers
  security.setSecurityHeaders(res);
  
  // Only allow GET requests (for cron jobs)
  if (req.method !== 'GET') {
    console.log('❌ Invalid request method for hourly reminder:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate the request
  if (!auth.validateCronApiKey(req)) {
    console.error('❌ Unauthorized access to hourly reminder endpoint');
    security.logSecurityEvent('unauthorized_cron_access', {
      endpoint: 'hourly-reminder',
      clientIP: security.getClientIP(req)
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      timestamp: new Date().toISOString()
    });
  }

  try {
    console.log('⏰ Starting hourly reminder process...');
    console.log('🔍 Request details:', {
      method: req.method,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
    
    // Process pending reminders (1-hour-before reminders)
    console.log('🔍 Processing pending hourly reminders...');
    const processedCount = await reminderScheduler.processPendingReminders();
    
    console.log('✅ Hourly reminder process completed successfully:', {
      remindersProcessed: processedCount,
      timestamp: new Date().toISOString()
    });
    
    res.status(200).json({ 
      success: true, 
      remindersProcessed: processedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Hourly reminder process failed:', {
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
