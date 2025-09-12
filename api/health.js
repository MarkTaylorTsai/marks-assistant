module.exports = async (req, res) => {
  console.log('🔍 Health check endpoint accessed:', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
};
