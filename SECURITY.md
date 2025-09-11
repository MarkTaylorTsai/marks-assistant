# Security Guide for Mark's Assistant

This document outlines the security measures implemented in Mark's Assistant and provides guidance for secure deployment and operation.

## 🔒 Security Features Implemented

### 1. **LINE Signature Verification**

- All webhook requests are verified using LINE's signature validation
- Prevents unauthorized requests from reaching the bot
- Uses `line.validateSignature()` for cryptographic verification

### 2. **Cron Endpoint Authentication**

- All cron endpoints require API key authentication
- Supports both query parameter and header-based authentication
- Prevents unauthorized triggering of reminder systems

### 3. **Input Validation & Sanitization**

- All user inputs are validated and sanitized
- Prevents injection attacks and malicious content
- Length limits on all text inputs (1000 chars for commands, 200 for titles)
- UUID validation for task IDs

### 4. **Rate Limiting**

- Webhook endpoints have rate limiting (10 requests per minute per IP)
- Prevents abuse and DoS attacks
- Automatic cleanup of rate limit data

### 5. **Security Headers**

- Comprehensive security headers on all responses:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy: default-src 'self'`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`

### 6. **Database Security (RLS)**

- Row Level Security implemented in Supabase
- User context properly set for all database operations
- Users can only access their own tasks and reminders

### 7. **Request Size Validation**

- Maximum request size limits (1MB for webhooks)
- Prevents large payload attacks

## 🛡️ Security Best Practices

### Environment Variables

- **NEVER** commit real credentials to version control
- Use strong, unique API keys for cron authentication
- Rotate credentials regularly
- Use Vercel's secure environment variable system

### API Key Management

- Generate a strong, random API key for cron jobs
- Use at least 32 characters with mixed case, numbers, and symbols
- Store securely in environment variables
- Never log or expose API keys

### Database Security

- Use Supabase RLS policies
- Regularly review database access logs
- Monitor for unusual query patterns
- Keep database credentials secure

### Monitoring & Logging

- Monitor security events in logs
- Set up alerts for failed authentication attempts
- Review rate limiting violations
- Track unusual user behavior patterns

## 🚨 Security Incident Response

### If Credentials Are Compromised

1. **Immediately revoke** all exposed credentials
2. **Generate new credentials** for all services
3. **Update environment variables** in Vercel
4. **Redeploy** the application
5. **Review logs** for any unauthorized access

### If API Key Is Compromised

1. **Generate new API key** immediately
2. **Update cron jobs** with new API key
3. **Update environment variables**
4. **Monitor** for unauthorized cron executions

### If Database Is Compromised

1. **Review database logs** for unauthorized access
2. **Check RLS policies** are working correctly
3. **Consider data backup** and restoration
4. **Update database credentials** if necessary

## 🔍 Security Monitoring

### Key Metrics to Monitor

- Failed authentication attempts
- Rate limit violations
- Unusual request patterns
- Database query anomalies
- LINE API error rates

### Log Patterns to Watch

```
❌ Invalid LINE signature in webhook request
❌ Unauthorized access to cron endpoint
⚠️ Rate limit exceeded for IP
❌ Missing API key in cron request
```

### Alert Conditions

- Multiple failed authentication attempts from same IP
- High volume of rate limit violations
- Unusual database query patterns
- LINE API errors indicating potential abuse

## 🛠️ Security Configuration

### Required Environment Variables

```bash
# LINE Bot Security
LINE_CHANNEL_ACCESS_TOKEN=your_secure_token
LINE_CHANNEL_SECRET=your_secure_secret

# Database Security
SUPABASE_URL=your_secure_url
SUPABASE_ANON_KEY=your_secure_key

# Cron Security
CRON_API_KEY=your_very_secure_api_key_here

# User Security
USER_LINE_ID=your_line_user_id
```

### Cron Job Security Setup

When setting up cron jobs, use the API key in the URL:

```
https://your-app.vercel.app/api/cron/daily-reminder?api_key=your_secure_api_key
```

Or in headers:

```
X-API-Key: your_secure_api_key
```

## 🔐 Additional Security Recommendations

### 1. **Regular Security Audits**

- Review code for security vulnerabilities
- Update dependencies regularly
- Test authentication mechanisms
- Verify RLS policies are working

### 2. **Access Control**

- Limit who has access to environment variables
- Use strong passwords for all accounts
- Enable 2FA where possible
- Regularly review access permissions

### 3. **Data Protection**

- Encrypt sensitive data at rest
- Use HTTPS for all communications
- Implement proper backup strategies
- Follow data retention policies

### 4. **Network Security**

- Use Vercel's built-in security features
- Consider IP whitelisting for cron jobs
- Monitor network traffic patterns
- Use secure DNS settings

## 📞 Security Contact

If you discover a security vulnerability, please:

1. **Do not** create a public issue
2. **Contact** the maintainer privately
3. **Provide** detailed information about the vulnerability
4. **Allow** time for the issue to be addressed before disclosure

## 🔄 Security Updates

This security guide will be updated as new security features are added or vulnerabilities are discovered. Please review it regularly and ensure your deployment follows current best practices.

---

**Remember**: Security is an ongoing process, not a one-time setup. Regular monitoring, updates, and reviews are essential for maintaining a secure application.
