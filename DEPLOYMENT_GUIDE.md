# Deployment Guide for Mark's Assistant LINE Bot

## Quick Fix for Webhook 404 Error

The webhook 404 error has been fixed with the following changes:

### 1. Fixed Rate Limiting Issue

- Updated `lib/security.js` to return boolean values for rate limiting
- Updated `api/webhook.js` to properly handle rate limiting responses

### 2. Enhanced Vercel Configuration

- Added explicit route for `/api/webhook` in `vercel.json`
- Added debugging endpoints for testing

### 3. Improved Error Handling

- Added better error handling for signature verification
- Added comprehensive logging for debugging

## Testing Endpoints

After deployment, you can test these endpoints:

1. **Health Check**: `https://marks-assistant.vercel.app/api/health`
2. **Test Webhook**: `https://marks-assistant.vercel.app/api/test-webhook`
3. **Main Webhook**: `https://marks-assistant.vercel.app/api/webhook`

## Deployment Steps

1. **Deploy to Vercel**:

   ```bash
   vercel --prod
   ```

2. **Test the endpoints**:

   ```bash
   # Test health endpoint
   curl https://marks-assistant.vercel.app/api/health

   # Test webhook endpoint (should return 405 for GET)
   curl https://marks-assistant.vercel.app/api/webhook
   ```

3. **Update LINE Webhook URL**:
   - Go to LINE Developers Console
   - Update webhook URL to: `https://marks-assistant.vercel.app/api/webhook`
   - Test the webhook connection

## Environment Variables Required

Make sure these are set in Vercel:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Troubleshooting

If you still get 404 errors:

1. Check Vercel deployment logs
2. Verify the webhook URL is correct
3. Test the health endpoint first
4. Check environment variables are set

## Files Modified

- `api/webhook.js` - Fixed rate limiting and error handling
- `lib/security.js` - Updated rate limiting to return boolean
- `vercel.json` - Added explicit webhook route
- `api/health.js` - New health check endpoint
- `api/test-webhook.js` - New test endpoint
