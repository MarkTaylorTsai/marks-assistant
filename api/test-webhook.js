module.exports = async (req, res) => {
  console.log('🔍 Test webhook endpoint accessed:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });

  // Set CORS headers for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-line-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.status(200).json({
    message: 'Webhook endpoint is accessible',
    method: req.method,
    timestamp: new Date().toISOString(),
    body: req.body || null
  });
};
