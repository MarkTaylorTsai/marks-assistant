// Security utilities for Mark's Assistant

class SecurityService {
  constructor() {
    this.rateLimitMap = new Map();
    this.rateLimitWindow = 60 * 1000; // 1 minute
    this.maxRequestsPerWindow = 10; // Max 10 requests per minute per IP
  }

  // Set security headers
  setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Rate limiting middleware
  rateLimit(req, res, next) {
    const clientIP = this.getClientIP(req);
    const now = Date.now();
    
    // Clean up old entries
    this.cleanupRateLimit();
    
    // Get or create rate limit entry for this IP
    let rateLimitEntry = this.rateLimitMap.get(clientIP);
    
    if (!rateLimitEntry) {
      rateLimitEntry = {
        count: 0,
        windowStart: now
      };
      this.rateLimitMap.set(clientIP, rateLimitEntry);
    }
    
    // Reset window if needed
    if (now - rateLimitEntry.windowStart > this.rateLimitWindow) {
      rateLimitEntry.count = 0;
      rateLimitEntry.windowStart = now;
    }
    
    // Check if rate limit exceeded
    if (rateLimitEntry.count >= this.maxRequestsPerWindow) {
      console.warn('⚠️ Rate limit exceeded for IP:', clientIP);
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((rateLimitEntry.windowStart + this.rateLimitWindow - now) / 1000)
      });
      return false; // Indicate that response was sent
    }
    
    // Increment counter
    rateLimitEntry.count++;
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', this.maxRequestsPerWindow);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequestsPerWindow - rateLimitEntry.count));
    res.setHeader('X-RateLimit-Reset', new Date(rateLimitEntry.windowStart + this.rateLimitWindow).toISOString());
    
    if (next) next();
    return true; // Indicate that request should continue
  }

  // Get client IP address
  getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           'unknown';
  }

  // Clean up old rate limit entries
  cleanupRateLimit() {
    const now = Date.now();
    for (const [ip, entry] of this.rateLimitMap.entries()) {
      if (now - entry.windowStart > this.rateLimitWindow) {
        this.rateLimitMap.delete(ip);
      }
    }
  }

  // Validate request size
  validateRequestSize(req, maxSize = 1024 * 1024) { // 1MB default
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      throw new Error(`Request too large. Maximum size is ${maxSize} bytes.`);
    }
    
    return true;
  }

  // Sanitize user input
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/[^\w\s\-.,!?@#$%&*()+=]/g, '') // Keep only safe characters
      .trim()
      .substring(0, 1000); // Limit length
  }

  // Validate LINE user ID
  validateLineUserId(userId) {
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    
    // LINE user IDs are typically 32-33 character strings starting with 'U'
    return userId.length >= 30 && 
           userId.length <= 35 && 
           userId.startsWith('U') &&
           /^[A-Za-z0-9]+$/.test(userId);
  }

  // Log security events
  logSecurityEvent(event, details) {
    console.warn('🔒 Security Event:', {
      event,
      details,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new SecurityService();
