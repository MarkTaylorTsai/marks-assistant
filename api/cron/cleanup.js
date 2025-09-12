const reminderScheduler = require('../../lib/reminder-scheduler');
const auth = require('../../lib/auth');
const security = require('../../lib/security');

module.exports = async (req, res) => {
  // Set security headers
  security.setSecurityHeaders(res);
  
  // Only allow GET requests (for cron jobs)
  if (req.method !== 'GET') {
    console.log('❌ Invalid request method for cleanup:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate the request
  if (!auth.validateCronApiKey(req)) {
    console.error('❌ Unauthorized access to cleanup endpoint');
    security.logSecurityEvent('unauthorized_cron_access', {
      endpoint: 'cleanup',
      clientIP: security.getClientIP(req)
    });
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      timestamp: new Date().toISOString()
    });
  }

  const startTime = new Date();
  console.log('🧹 Starting cleanup process...', {
    timestamp: startTime.toISOString(),
    method: req.method,
    headers: req.headers
  });

  try {
    // Get user ID from environment
    const userId = process.env.USER_LINE_ID;
    if (!userId) {
      console.error('❌ USER_LINE_ID environment variable not set');
      throw new Error('USER_LINE_ID environment variable not set');
    }

    console.log('🔍 Processing cleanup for user:', userId);

    // Run cleanup process
    console.log('🧹 Cleaning up old tasks...');
    const cleanupResult = await reminderScheduler.cleanup();
    
    // Generate recurring task instances (in case they weren't generated)
    console.log('🔄 Generating recurring task instances...');
    await reminderScheduler.generateRecurringInstances();

    const endTime = new Date();
    const duration = endTime - startTime;
    
    console.log('✅ Cleanup process completed successfully:', {
      duration: `${duration}ms`,
      cleanupResult: cleanupResult,
      timestamp: endTime.toISOString()
    });
    
    res.status(200).json({ 
      success: true,
      cleanupResult: cleanupResult,
      duration: `${duration}ms`,
      timestamp: endTime.toISOString()
    });
  } catch (error) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    console.error('❌ Cleanup process failed:', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: endTime.toISOString()
    });
    
    res.status(500).json({ 
      error: error.message,
      timestamp: endTime.toISOString(),
      duration: `${duration}ms`
    });
  }
};
