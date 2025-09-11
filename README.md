# Mark's Assistant - LINE Bot

A personal reminder assistant LINE bot that helps you manage your daily tasks, events, and reminders with natural language commands.

## Features

### 🤖 Core Functionality

- **Daily Morning Reminder**: Automatic 5:30 AM daily task summary
- **Event Reminders**: 1-hour-before notifications for all tasks
- **Special Task Handling**: 1-day-before + day-of reminders for important tasks
- **Task Management**: Full CRUD operations via natural language
- **Recurring Tasks**: Weekly, biweekly, and monthly recurring events
- **Smart Cleanup**: Automatic deletion of past non-recurring tasks

### 💬 Natural Language Commands

- `add "Task Name" at 7:00 am` - Add a one-time task
- `add "Gym" at 7:00 am every Monday` - Add recurring weekly task
- `add "Meeting" at 2:00 pm special` - Add special task with extra reminders
- `update "Task Name" to 3:00 pm` - Update task time
- `delete "Task Name"` - Delete a task
- `today` - View today's tasks
- `week` - View this week's tasks
- `month` - View this month's tasks
- `list` - View all upcoming tasks

### 🔄 Recurring Patterns

- **Weekly**: `every Monday`, `every Tuesday`, etc.
- **Biweekly**: `every 2 weeks on Monday`
- **Monthly**: `first Sunday of every month`, `15th of every month`

## Architecture

### Tech Stack

- **Backend**: Node.js with Express
- **Hosting**: Vercel (Serverless Functions)
- **Database**: Supabase (PostgreSQL)
- **Scheduling**: cron-job.org
- **Bot Framework**: LINE Messaging API

### Project Structure

```
├── api/
│   ├── webhook.js              # LINE bot webhook handler
│   └── cron/
│       ├── daily-reminder.js   # Daily 5:30 AM reminders
│       ├── hourly-reminder.js  # 1-hour-before reminders
│       └── special-reminder.js # Special task reminders
├── lib/
│   ├── database.js             # Supabase database service
│   ├── line-bot.js             # LINE bot service
│   ├── nlp-parser.js           # Natural language parser
│   └── reminder-scheduler.js   # Reminder scheduling logic
├── package.json
├── vercel.json
└── supabase-schema.sql
```

## Setup Instructions

### 1. LINE Bot Setup

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Create a new provider and channel
3. Choose "Messaging API" channel type
4. Note down:
   - Channel Access Token
   - Channel Secret
   - Your User ID (from LINE app)

### 2. Supabase Setup

1. Create a new project at [Supabase](https://supabase.com/)
2. Go to SQL Editor and run the contents of `supabase-schema.sql`
3. Note down:
   - Project URL
   - Anon/Public Key

### 3. Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Clone this repository
3. Install dependencies: `npm install`
4. Deploy to Vercel: `vercel`
5. Set environment variables in Vercel dashboard:

```bash
LINE_CHANNEL_ACCESS_TOKEN=your_line_access_token
LINE_CHANNEL_SECRET=your_line_secret
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
USER_LINE_ID=your_line_user_id
CRON_API_KEY=your_secure_cron_api_key
TIMEZONE=Asia/Taipei
```

### 4. LINE Webhook Configuration

1. In LINE Developers Console, set webhook URL to:
   `https://your-vercel-app.vercel.app/api/webhook`
2. Enable webhook
3. Add your bot as a friend in LINE

### 5. Cron Job Setup

Set up three cron jobs at [cron-job.org](https://cron-job.org/):

#### Daily Reminder (5:30 AM EST)

- **URL**: `https://your-vercel-app.vercel.app/api/cron/daily-reminder?api_key=your_cron_api_key`
- **Schedule**: `30 5 * * *` (5:30 AM daily)
- **Method**: GET
- **Headers**: `X-API-Key: your_cron_api_key` (alternative to query param)

#### Hourly Reminder Check

- **URL**: `https://your-vercel-app.vercel.app/api/cron/hourly-reminder?api_key=your_cron_api_key`
- **Schedule**: `0 * * * *` (Every hour)
- **Method**: GET
- **Headers**: `X-API-Key: your_cron_api_key` (alternative to query param)

#### Special Reminder Check

- **URL**: `https://your-vercel-app.vercel.app/api/cron/special-reminder?api_key=your_cron_api_key`
- **Schedule**: `0 6 * * *` (6:00 AM daily)
- **Method**: GET
- **Headers**: `X-API-Key: your_cron_api_key` (alternative to query param)

## Usage Examples

### Adding Tasks

```
add "Gym session" at 7:00 am
add "Team meeting" at 2:30 pm special
add "Weekly review" at 9:00 am every Monday
add "Monthly report" on first Sunday of every month special
```

### Managing Tasks

```
today                    # View today's tasks
week                     # View this week's tasks
update "Gym" to 8:00 am  # Update task time
delete "Old task"        # Delete a task
```

### Viewing Tasks

- **Today**: Shows all tasks scheduled for today
- **Week**: Shows all tasks for the current week
- **Month**: Shows all tasks for the current month
- **List**: Shows all upcoming tasks (default view)

## Database Schema

### Tasks Table

- `id`: UUID primary key
- `user_id`: LINE user ID
- `title`: Task title
- `description`: Optional task description
- `scheduled_time`: When the task is scheduled
- `is_special`: Whether it's a special task (extra reminders)
- `is_recurring`: Whether the task repeats
- `recurrence_pattern`: JSON pattern for recurring tasks
- `notes`: Optional notes
- `is_active`: Soft delete flag

### Reminders Table

- `id`: UUID primary key
- `task_id`: Reference to task
- `reminder_type`: Type of reminder (daily, hourly, special_day_before, special_day_of)
- `scheduled_time`: When to send the reminder
- `sent_at`: When the reminder was actually sent

## Environment Variables

| Variable                    | Description                     | Required |
| --------------------------- | ------------------------------- | -------- |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE bot access token           | Yes      |
| `LINE_CHANNEL_SECRET`       | LINE bot secret                 | Yes      |
| `SUPABASE_URL`              | Supabase project URL            | Yes      |
| `SUPABASE_ANON_KEY`         | Supabase anonymous key          | Yes      |
| `USER_LINE_ID`              | Your LINE user ID               | Yes      |
| `CRON_API_KEY`              | API key for cron jobs           | Yes      |
| `TIMEZONE`                  | Timezone (default: Asia/Taipei) | No       |

## Development

### Local Development

```bash
npm install
npm run dev
```

### Testing

Test the webhook locally using ngrok:

```bash
ngrok http 3000
# Use the ngrok URL as your webhook URL in LINE console
```

## Troubleshooting

### Common Issues

1. **Webhook not receiving messages**

   - Check LINE console webhook URL
   - Verify Vercel deployment is successful
   - Check Vercel function logs

2. **Database connection issues**

   - Verify Supabase credentials
   - Check database schema is properly set up
   - Ensure RLS policies are configured

3. **Reminders not sending**
   - Check cron job URLs are correct
   - Verify cron jobs are running
   - Check Vercel function logs for errors

### Logs

- Vercel function logs: Available in Vercel dashboard
- LINE webhook logs: Available in LINE Developers Console
- Database logs: Available in Supabase dashboard

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review Vercel and Supabase logs
3. Create an issue in the repository

---

**Mark's Assistant** - Your personal reminder secretary in LINE! 🤖✨
