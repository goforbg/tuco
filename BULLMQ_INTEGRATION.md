# BullMQ Integration

This document describes the BullMQ integration for background job processing in the Tuco AI application.

## Overview

The application has been updated to use BullMQ for background job processing instead of traditional cron jobs. This provides better scalability, reliability, and monitoring capabilities.

## Architecture

```
Main App (Next.js)          BullMQ Server (Separate)
├── Web UI                  ├── Scheduled Jobs
├── API Routes              ├── Background Workers  
├── User Auth               ├── Queue Management
└── Real-time Updates       └── Job Monitoring
```

## Architecture Improvements

### Bulk Availability Check Design

The bulk availability check uses a clean Redis-based approach:

#### Current Architecture
1. App server fetches leads from MongoDB
2. App server adds job with lead IDs to BullMQ queue
3. Worker fetches leads from MongoDB using the provided IDs
4. Worker processes leads and updates database

#### Benefits
- **Clean Redis storage** - Only essential IDs are stored in Redis
- **Fresh data** - Worker always gets the latest lead data from MongoDB
- **Separation of concerns** - App server handles UI logic, worker handles processing
- **Scalability** - Multiple workers can process jobs independently
- **Data consistency** - Worker processes current state of leads

#### Design Rationale
- Redis is kept lightweight with minimal data
- MongoDB remains the single source of truth for lead data
- Worker can handle data validation and business logic
- Easier to debug and monitor job processing

## Job Types

### 1. Scheduled Message Processing
- **Schedule**: Every minute (`* * * * *`)
- **Purpose**: Process scheduled messages that are due to be sent
- **Queue**: `scheduled-messages`

### 2. Health Check System
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Purpose**: Check server health and iMessage availability for all active lines
- **Queue**: `health-check`

### 3. Bulk iMessage Availability Check
- **Trigger**: API call for bulk processing (>10 leads)
- **Purpose**: Check iMessage availability for multiple leads
- **Queue**: `bulk-availability`

### 4. Integration Sync Jobs
- **Trigger**: API call for sync operations
- **Purpose**: Sync data from external integrations (HubSpot, Salesforce, Google Sheets)
- **Queue**: `integration-sync`

### 5. Message Processing
- **Trigger**: Individual message sending
- **Purpose**: Send individual messages via external APIs
- **Queue**: `message-processing`

## API Endpoints

### BullMQ Management

#### `GET /api/bullmq/stats`
Get queue statistics and job counts.

#### `POST /api/bullmq/jobs`
Add jobs to queues.

**Request Body:**
```json
{
  "jobType": "bulk-availability-check",
  "data": {
    "leadIds": ["lead1", "lead2"],
    "userId": "user123",
    "workspaceId": "org123"
  }
}
```

**Note:** The `leadIds` array contains only the MongoDB ObjectIds of leads. The worker will fetch the actual lead data from MongoDB when processing the job. In the map fields stage, leads might have incomplete data (missing lastName, email, or phone), but at least one of email OR phone is required for availability checking.

#### `POST /api/bullmq/initialize`
Initialize scheduled jobs (admin only).

#### `GET /api/bullmq/health`
Check BullMQ server health.

#### `GET /api/bullmq/metrics`
Get BullMQ server metrics.

## Environment Variables

Add these environment variables to your `.env.local`:

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# BullMQ Server Configuration
BULLMQ_SERVER_URL=http://localhost:3001
SERVICE_TOKEN=your-service-token-here
```

## Migration from Cron Jobs

### Before (Cron Jobs)
- `scripts/process-scheduled-messages.js` - Processed scheduled messages every minute
- `scripts/run-health-check.js` - Ran health checks every 5 minutes
- System cron jobs managed scheduling

### After (BullMQ)
- Jobs are managed by BullMQ server
- Better error handling and retry logic
- Real-time monitoring and metrics
- Horizontal scaling support

## Usage

### Starting the System

1. **Start Redis Server**
   ```bash
   redis-server
   ```

2. **Start Main App**
   ```bash
   npm run dev
   ```

3. **Start BullMQ Server** (separate repository)
   ```bash
   # In the BullMQ server repository
   npm start
   ```

4. **Initialize Scheduled Jobs**
   ```bash
   npm run bullmq:init
   ```

### Monitoring

#### Check Queue Statistics
```bash
npm run bullmq:stats
```

#### Check Server Health
```bash
npm run bullmq:health
```

#### View Metrics
```bash
curl http://localhost:3000/api/bullmq/metrics
```

## Job Processing Logic

### Bulk Availability Check
- **≤10 leads**: Processed synchronously for immediate results
- **>10 leads**: Processed asynchronously via BullMQ queue

### Message Processing
- **Immediate messages**: Added to BullMQ queue for background processing
- **Scheduled messages**: Processed by scheduled job every minute
- **Fallback**: If BullMQ fails, falls back to synchronous processing

### Integration Sync
- All sync operations are processed asynchronously via BullMQ
- Better handling of large data imports
- Improved error handling and retry logic

## Error Handling

- **Retry Logic**: Jobs are retried with exponential backoff
- **Dead Letter Queue**: Failed jobs are moved to dead letter queue
- **Fallback Processing**: If BullMQ is unavailable, critical operations fall back to synchronous processing
- **Monitoring**: Comprehensive logging and metrics for troubleshooting

## Benefits

1. **Scalability**: Horizontal scaling of background workers
2. **Reliability**: Job persistence and recovery
3. **Monitoring**: Real-time queue statistics and metrics
4. **Performance**: Non-blocking background processing
5. **Flexibility**: Easy addition of new job types
6. **Error Handling**: Comprehensive retry and error management

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Ensure Redis server is running
   - Check `REDIS_URL` environment variable

2. **BullMQ Server Not Responding**
   - Ensure BullMQ server is running
   - Check `BULLMQ_SERVER_URL` environment variable
   - Verify `SERVICE_TOKEN` is correct

3. **Jobs Not Processing**
   - Check queue statistics via `/api/bullmq/stats`
   - Verify workers are running in BullMQ server
   - Check Redis connection

4. **Scheduled Jobs Not Running**
   - Initialize jobs via `/api/bullmq/initialize`
   - Check BullMQ server logs
   - Verify Redis connection

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Check BullMQ server health
curl http://localhost:3000/api/bullmq/health

# Get queue statistics
curl http://localhost:3000/api/bullmq/stats

# Initialize scheduled jobs
curl -X POST http://localhost:3000/api/bullmq/initialize
```

## Next Steps

1. **Deploy BullMQ Server**: Set up the separate BullMQ server repository
2. **Configure Production**: Update environment variables for production
3. **Set Up Monitoring**: Configure Prometheus metrics and alerting
4. **Scale Workers**: Add more worker processes as needed
5. **Remove Old Scripts**: Clean up old cron job scripts after migration is complete
