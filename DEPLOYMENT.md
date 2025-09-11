# Deployment Guide for Mark's Assistant

This guide will walk you through deploying Mark's Assistant LINE bot to Vercel with Supabase as the database.

## Prerequisites

- Node.js 18+ installed
- Vercel account
- Supabase account
- LINE Developer account
- cron-job.org account

## Step-by-Step Deployment

### 1. LINE Bot Setup

1. **Create LINE Developer Account**

   - Go to [LINE Developers Console](https://developers.line.biz/)
   - Sign in with your LINE account

2. **Create Provider**

   - Click "Create" → "Provider"
   - Enter provider name (e.g., "Mark's Assistant")

3. **Create Messaging API Channel**

   - Click "Create" → "Messaging API"
   - Fill in required information:
     - Channel name: "Mark's Assistant"
     - Channel description: "Personal reminder assistant"
     - Category: "Tools"
     - Subcategory: "Other"
   - Accept terms and create

4. **Get Credentials**
   - Go to your channel → "Basic settings"
   - Copy the **Channel Access Token**
   - Copy the **Channel Secret**
   - Go to "Messaging API" tab
   - Copy your **User ID** (you'll need to add the bot as a friend first)

### 2. Supabase Database Setup

1. **Create Supabase Project**

   - Go to [Supabase](https://supabase.com/)
   - Click "New Project"
   - Choose organization and enter project details
   - Set a strong database password
   - Choose region closest to you

2. **Set Up Database Schema**

   - Go to SQL Editor in your Supabase dashboard
   - Copy the entire contents of `supabase-schema.sql`
   - Paste and run the SQL script
   - Verify tables are created successfully

3. **Get Database Credentials**
   - Go to Settings → API
   - Copy the **Project URL**
   - Copy the **anon/public key**

### 3. Vercel Deployment

1. **Install Vercel CLI**

   ```bash
   npm install -g vercel
   ```

2. **Deploy Project**

   ```bash
   # In your project directory
   vercel
   ```

   - Follow the prompts to link to your Vercel account
   - Choose default settings for framework detection

3. **Set Environment Variables**

   - Go to your Vercel dashboard
   - Select your project
   - Go to Settings → Environment Variables
   - Add the following variables:

   ```
   LINE_CHANNEL_ACCESS_TOKEN = your_channel_access_token
   LINE_CHANNEL_SECRET = your_channel_secret
   USER_LINE_ID = your_line_user_id
   SUPABASE_URL = your_supabase_url
   SUPABASE_ANON_KEY = your_supabase_anon_key
   ```

4. **Redeploy**
   ```bash
   vercel --prod
   ```

### 4. LINE Webhook Configuration

1. **Set Webhook URL**

   - In LINE Developers Console, go to your channel
   - Go to "Messaging API" tab
   - Set Webhook URL to: `https://your-app-name.vercel.app/api/webhook`
   - Enable "Use webhook"

2. **Add Bot as Friend**
   - Scan the QR code or add via LINE ID
   - Send a test message to the bot
   - Check Vercel function logs to verify webhook is working

### 5. Cron Job Setup

1. **Create cron-job.org Account**

   - Go to [cron-job.org](https://cron-job.org/)
   - Sign up for a free account

2. **Set Up Daily Reminder Cron**

   - Click "Create cronjob"
   - Title: "Mark's Assistant - Daily Reminder"
   - Address: `https://your-app-name.vercel.app/api/cron/daily-reminder`
   - Schedule: `30 5 * * *` (5:30 AM daily)
   - Method: GET
   - Save

3. **Set Up Hourly Reminder Cron**

   - Title: "Mark's Assistant - Hourly Reminder"
   - Address: `https://your-app-name.vercel.app/api/cron/hourly-reminder`
   - Schedule: `0 * * * *` (Every hour)
   - Method: GET
   - Save

4. **Set Up Special Reminder Cron**
   - Title: "Mark's Assistant - Special Reminder"
   - Address: `https://your-app-name.vercel.app/api/cron/special-reminder`
   - Schedule: `0 6 * * *` (6:00 AM daily)
   - Method: GET
   - Save

### 6. Testing Your Deployment

1. **Test Basic Commands**

   ```
   help
   today
   add "Test task" at 2:00 pm
   ```

2. **Test Recurring Tasks**

   ```
   add "Weekly meeting" at 10:00 am every Monday
   add "Monthly review" on first Sunday of every month special
   ```

3. **Test Reminders**
   - Add a task for 1 hour from now
   - Wait for the hourly reminder
   - Check that reminders are sent correctly

### 7. Monitoring and Maintenance

1. **Monitor Logs**

   - Vercel Dashboard → Functions → View logs
   - Check for any errors or issues

2. **Database Monitoring**

   - Supabase Dashboard → Logs
   - Monitor database performance and queries

3. **Cron Job Monitoring**
   - cron-job.org dashboard
   - Check execution logs and success rates

## Troubleshooting

### Common Issues

1. **Webhook Not Working**

   - Verify webhook URL is correct
   - Check Vercel deployment status
   - Ensure environment variables are set
   - Check Vercel function logs

2. **Database Connection Issues**

   - Verify Supabase credentials
   - Check database schema is properly set up
   - Ensure RLS policies are configured

3. **Reminders Not Sending**

   - Check cron job URLs are correct
   - Verify cron jobs are running
   - Check Vercel function logs for errors
   - Ensure USER_LINE_ID is set correctly

4. **Natural Language Parsing Issues**
   - Check command format matches examples
   - Verify time format is correct
   - Check for typos in task titles

### Getting Help

1. Check Vercel function logs for detailed error messages
2. Review Supabase logs for database issues
3. Test individual components (webhook, cron jobs, database)
4. Verify all environment variables are set correctly

## Security Considerations

1. **Environment Variables**

   - Never commit sensitive credentials to version control
   - Use Vercel's environment variable system
   - Regularly rotate API keys

2. **Database Security**

   - Supabase RLS policies are configured for user isolation
   - Only your user ID can access your tasks
   - Database credentials are stored securely in Vercel

3. **Webhook Security**
   - LINE webhook signature verification is implemented
   - Only POST requests are accepted
   - Error handling prevents information leakage

## Scaling Considerations

- Vercel automatically scales serverless functions
- Supabase handles database scaling
- Cron jobs can be upgraded for higher frequency if needed
- Consider implementing rate limiting for high-volume usage

---

Your Mark's Assistant is now deployed and ready to help manage your daily tasks! 🚀
