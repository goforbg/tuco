# Scheduled Message Processing

This directory contains scripts for processing scheduled messages in the Tuco AI application.

## Overview

The message scheduling system allows users to:
- Send messages immediately
- Schedule messages for future delivery
- Create batch messages for sequences
- Process scheduled messages automatically via cron jobs

## Files

### `process-scheduled-messages.js`

A Node.js script that processes all scheduled messages that are due to be sent. This script should be run as a cron job.

## Setup Instructions

### 1. Install Dependencies

Make sure Node.js is installed on your server.

### 2. Configure Environment Variables

Set the following environment variable:

```bash
export API_BASE_URL="https://your-domain.com"  # Your app's base URL
```

For local development:
```bash
export API_BASE_URL="http://localhost:3000"
```

### 3. Set Up Cron Job

Add the following line to your crontab to run the script every minute:

```bash
# Edit crontab
crontab -e

# Add this line (adjust the path as needed)
* * * * * cd /path/to/your/app && node scripts/process-scheduled-messages.js >> /var/log/tuco-scheduled-messages.log 2>&1
```

### 4. Alternative: Using PM2

If you prefer using PM2 for process management:

```bash
# Install PM2 globally
npm install -g pm2

# Create a PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'tuco-scheduled-messages',
    script: 'scripts/process-scheduled-messages.js',
    cron_restart: '* * * * *',
    autorestart: false,
    watch: false,
    env: {
      API_BASE_URL: 'https://your-domain.com'
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
```

### 5. Alternative: Using Systemd Timer

Create a systemd service and timer:

```bash
# Create service file
sudo tee /etc/systemd/system/tuco-scheduled-messages.service << EOF
[Unit]
Description=Tuco AI Scheduled Message Processor
After=network.target

[Service]
Type=oneshot
User=www-data
WorkingDirectory=/path/to/your/app
Environment=API_BASE_URL=https://your-domain.com
ExecStart=/usr/bin/node scripts/process-scheduled-messages.js
StandardOutput=journal
StandardError=journal
EOF

# Create timer file
sudo tee /etc/systemd/system/tuco-scheduled-messages.timer << EOF
[Unit]
Description=Run Tuco AI Scheduled Message Processor every minute
Requires=tuco-scheduled-messages.service

[Timer]
OnCalendar=*:*:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Enable and start the timer
sudo systemctl daemon-reload
sudo systemctl enable tuco-scheduled-messages.timer
sudo systemctl start tuco-scheduled-messages.timer
```

## Testing

### Manual Testing

You can test the script manually:

```bash
# Run the script once
node scripts/process-scheduled-messages.js

# Check the output
# You should see logs indicating the processing status
```

### API Testing

Test the API endpoint directly:

```bash
# Check scheduled messages status
curl -X GET "https://your-domain.com/api/messages/process-scheduled?hours=24"

# Process scheduled messages manually
curl -X POST "https://your-domain.com/api/messages/process-scheduled"
```

## Monitoring

### Log Files

Monitor the cron job logs:

```bash
# View recent cron logs
tail -f /var/log/cron

# View application logs (if using systemd)
journalctl -u tuco-scheduled-messages.service -f

# View PM2 logs (if using PM2)
pm2 logs tuco-scheduled-messages
```

### Database Monitoring

Check scheduled messages in your database:

```javascript
// MongoDB query to see scheduled messages
db.messages.find({
  status: "scheduled",
  scheduledDate: { $lte: new Date() }
}).sort({ scheduledDate: 1 });
```

## Troubleshooting

### Common Issues

1. **Script not running**: Check cron job syntax and permissions
2. **API connection failed**: Verify API_BASE_URL and network connectivity
3. **Messages not processing**: Check database connection and message status
4. **Permission denied**: Ensure the script has execute permissions

### Debug Mode

Run the script with debug output:

```bash
DEBUG=* node scripts/process-scheduled-messages.js
```

### Check Cron Job Status

```bash
# Check if cron is running
sudo systemctl status cron

# Check cron logs
sudo tail -f /var/log/cron
```

## Security Considerations

1. **API Security**: The script makes requests to your API without authentication. Ensure your API endpoints are properly secured or run on a trusted network.

2. **File Permissions**: Set appropriate file permissions for the script:
   ```bash
   chmod 755 scripts/process-scheduled-messages.js
   ```

3. **Log Rotation**: Set up log rotation to prevent log files from growing too large:
   ```bash
   # Add to /etc/logrotate.d/tuco-scheduled-messages
   /var/log/tuco-scheduled-messages.log {
       daily
       missingok
       rotate 7
       compress
       delaycompress
       notifempty
   }
   ```
