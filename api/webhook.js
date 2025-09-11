const line = require('@line/bot-sdk');
const lineBot = require('../lib/line-bot');
const security = require('../lib/security');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const middleware = line.middleware(config);

module.exports = async (req, res) => {
  // Set security headers
  security.setSecurityHeaders(res);
  
  // Apply rate limiting
  security.rateLimit(req, res);
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log('❌ Invalid request method for webhook:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request size
    security.validateRequestSize(req, 1024 * 1024); // 1MB limit
    
    console.log('🔍 Received webhook request:', {
      method: req.method,
      headers: req.headers,
      bodySize: JSON.stringify(req.body).length,
      clientIP: security.getClientIP(req),
      timestamp: new Date().toISOString()
    });

    // Verify LINE signature
    const signature = req.headers['x-line-signature'];
    if (!signature) {
      console.error('❌ Missing LINE signature in webhook request');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify signature using LINE middleware
    try {
      const body = JSON.stringify(req.body);
      const isValid = line.validateSignature(body, config.channelSecret, signature);
      
      if (!isValid) {
        console.error('❌ Invalid LINE signature in webhook request');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      console.log('✅ LINE signature verified successfully');
    } catch (signatureError) {
      console.error('❌ LINE signature verification failed:', signatureError.message);
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    // Parse events
    const events = req.body.events || [];
    console.log('🔍 Parsed webhook events:', { count: events.length });
    
    if (events.length > 0) {
      console.log('🔍 Event details:', events.map(event => ({
        type: event.type,
        source: event.source?.type,
        userId: event.source?.userId,
        messageType: event.message?.type
      })));
    }

    // Handle events
    await lineBot.handleWebhook(events);

    console.log('✅ Webhook processed successfully:', {
      eventCount: events.length,
      timestamp: new Date().toISOString()
    });

    // Return success response
    res.status(200).json({ 
      success: true,
      eventCount: events.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Webhook processing failed:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};
