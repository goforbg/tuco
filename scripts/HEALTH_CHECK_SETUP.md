# Health Check System Setup

## Overview

The health check system monitors the status of all active iMessage lines and provides real-time status indicators in the UI. It checks server health and iMessage availability for all lines every 2 minutes.

## Features

- ✅ Real-time health monitoring for all active lines
- ✅ Visual health indicator in the top navbar (green/yellow/red bubble)
- ✅ Automatic email notifications when lines go down
- ✅ Smart email throttling (only once per incident, re-enables after 2 days healthy)
- ✅ Two-minute interval health checks
- ✅ Server health ping validation
- ✅ iMessage availability checking

## How It Works

### 1. Health Check Process

Every 5 minutes, the system:

1. Finds all active lines with valid `serverUrl` and `guid`
2. For each line, performs two checks:
   - **Server Health**: `GET {serverUrl}/api/v1/ping?guid={guid}`
     - Expected: `{ status: 200, message: "Ping received!", data: "pong" }`
   - **iMessage Availability**: `GET {serverUrl}/api/v1/handle/availability/imessage?address={phone}&guid={guid}`
     - Expected: `{ status: 200, message: "Success", data: { available: true } }`
3. Updates health status in database
4. Sends email notification if line goes down (only once per incident)

### 2. Health Statuses

- **Healthy** 🟢: Both checks pass
- **Down** 🔴: Both checks fail

### 3. Email Notifications

The system sends email notifications with the following logic:

- Email sent **only once** when a line goes from healthy → down
- Email **re-enabled** after the line has been healthy for 2 days
- Subsequent failures will trigger new emails

This prevents spam while ensuring timely notifications.

## Setup Instructions

### 1. Environment Variables

Add the following environment variables to your `.env.local` file:

```bash
# SMTP Configuration for Health Check Emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Optional: Next.js App URL (for cron job)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

**For Gmail**:
1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Go to App Passwords
4. Generate an app password for "Mail"
5. Use this password in `SMTP_PASS`

**For Other Providers**:
- See [Nodemailer documentation](https://nodemailer.com/about/) for SMTP settings

### 2. Cron Job Setup

#### Option A: Using Cron (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add this line to run health check every 5 minutes
*/5 * * * * cd /path/to/tuco-ai/app && node scripts/run-health-check.js >> /path/to/tuco-ai/app/logs/health-check.log 2>&1
```

#### Option B: Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem file (see below)
# Run with PM2
pm2 start ecosystem.config.js

# Make PM2 restart on server reboot
pm2 startup
pm2 save
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'tuco-health-check',
    script: './scripts/run-health-check.js',
    cron_restart: '*/5 * * * *', // Every 5 minutes
    autorestart: false,
    watch: false,
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://your-domain.com'
    }
  }]
};
```

#### Option C: Using Vercel Cron Jobs

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/health-check",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

#### Option D: Manual Testing

```bash
# Test the health check
npm run health-check

# Or test the API endpoint directly
curl http://localhost:3000/api/health-check
```

### 3. Test the System

#### Test Health Check Endpoint

```bash
curl http://localhost:3000/api/health-check
```

Expected response:
```json
{
  "success": true,
  "checkedAt": "2024-01-01T00:00:00.000Z",
  "summary": {
    "total": 2,
    "healthy": 2,
    "down": 0
  },
  "results": [...]
}
```

#### Test Health Status Endpoint

```bash
curl http://localhost:3000/api/health-check/status
```

Expected response:
```json
{
  "status": "healthy",
  "hasLines": true,
  "healthyCount": 2,
  "downCount": 0,
  "totalCount": 2
}
```

## UI Features

### Health Status in Sidebar

The health status appears in the sidebar as a clean, minimal status display:

- 🟢 **Green** (pulsing): "All lines operational" - All active lines are healthy
- 🟡 **Yellow** (pulsing): "Some lines down (X/Y)" - Shows count of down lines
- 🔴 **Red** (pulsing): "All lines down" - All active lines are failing  
- **Gray**: "Checking status..." - No health data available yet

### Real-time Updates

The health indicator updates automatically:
- On page load
- Every 5 minutes (matches cron job interval)

## Monitoring

### Logs

The health check script logs to console:
```
[2024-01-01T00:00:00.000Z] Starting health check...
[2024-01-01T00:00:00.500Z] Health check completed in 500ms
  Summary: Healthy: 2, Down: 0
  ✅ All lines healthy
```

### Database Fields

Each line has a `healthCheck` object:

```typescript
{
  lastCheckedAt: Date,
  status: 'healthy' | 'down' | 'unknown',
  consecutiveFailures: number,
  lastEmailSentAt: Date,
  sendEmailOnNextDown: boolean
}
```

## Troubleshooting

### Health Check Not Running

1. Verify cron job is set up correctly
2. Check logs: `tail -f logs/health-check.log`
3. Test manually: `npm run health-check`

### Emails Not Sending

1. Verify SMTP configuration in `.env.local`
2. Check `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
3. Test email manually (use nodemailer directly)
4. Check application logs for SMTP errors

### Lines Not Detected

1. Verify lines have `isActive: true`
2. Verify lines have `provisioningStatus: 'active'`
3. Verify lines have `serverUrl` and `guid` set
4. Check database: `db.lines.find({ isActive: true })`

### API Endpoint Errors

1. Check server logs for detailed error messages
2. Verify `NEXT_PUBLIC_APP_URL` is set correctly
3. Ensure API endpoint is accessible
4. Check MongoDB connection

## API Endpoints

### `GET /api/health-check`

Runs health check for all active lines.

**Response:**
```json
{
  "success": true,
  "checkedAt": "2024-01-01T00:00:00.000Z",
  "summary": {
    "total": 2,
    "healthy": 2,
    "down": 0
  },
  "results": [
    {
      "lineId": "...",
      "linePhone": "+1234567890",
      "lineEmail": "line@example.com",
      "status": "healthy",
      "failures": [],
      "checkedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### `GET /api/health-check/status`

Gets health status for the current workspace.

**Response:**
```json
{
  "status": "healthy",
  "hasLines": true,
  "healthyCount": 2,
  "downCount": 0,
  "totalCount": 2,
  "lines": [...]
}
```

## Maintenance

### Check Recent Health Checks

```bash
# In MongoDB
db.lines.find(
  { "healthCheck.lastCheckedAt": { $gte: new Date(Date.now() - 3600000) } },
  { phone: 1, "healthCheck.status": 1, "healthCheck.lastCheckedAt": 1 }
)
```

### Check Failed Lines

```bash
db.lines.find(
  { "healthCheck.status": { $in: ["down"] } },
  { phone: 1, email: 1, "healthCheck.status": 1, "healthCheck.lastEmailSentAt": 1 }
)
```

## Future Enhancements

- [ ] Webhook notifications (Slack, Discord)
- [ ] Health check history/dashboard
- [ ] Line-specific health reports
- [ ] SMS notifications in addition to email
- [ ] Retry logic for transient failures
- [ ] Health check performance metrics

