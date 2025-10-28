import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection configuration
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
});

// Job types and their data interfaces
export interface ProcessScheduledMessagesJobData {
  type: 'process-scheduled-messages';
}

export interface HealthCheckJobData {
  type: 'health-check';
}

export interface BulkAvailabilityCheckJobData {
  type: 'bulk-availability-check';
  leadIds: string[];
  userId: string;
  workspaceId: string;
}

export interface IntegrationSyncJobData {
  type: 'integration-sync';
  integrationType: 'hubspot' | 'salesforce' | 'google_sheets';
  userId: string;
  workspaceId: string;
  configId: string;
  listId?: string;
  forceFullSync?: boolean;
}

export interface ProcessMessageJobData {
  type: 'process-message';
  messageId: string;
}

export type JobData = 
  | ProcessScheduledMessagesJobData
  | HealthCheckJobData
  | BulkAvailabilityCheckJobData
  | IntegrationSyncJobData
  | ProcessMessageJobData;

// Queue definitions
export const scheduledMessagesQueue = new Queue<ProcessScheduledMessagesJobData>('scheduled-messages', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const healthCheckQueue = new Queue<HealthCheckJobData>('health-check', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export const bulkAvailabilityQueue = new Queue<BulkAvailabilityCheckJobData>('bulk-availability', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
});

export const integrationSyncQueue = new Queue<IntegrationSyncJobData>('integration-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 30,
    removeOnFail: 15,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
  },
});

export const messageProcessingQueue = new Queue<ProcessMessageJobData>('message-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Job scheduling functions
export async function scheduleScheduledMessagesJob() {
  // Schedule to run every minute
  await scheduledMessagesQueue.add(
    'process-scheduled-messages',
    { type: 'process-scheduled-messages' },
    {
      repeat: { pattern: '* * * * *' }, // Every minute
      jobId: 'scheduled-messages-cron',
    }
  );
}

export async function scheduleHealthCheckJob() {
  // Schedule to run every 5 minutes
  await healthCheckQueue.add(
    'health-check',
    { type: 'health-check' },
    {
      repeat: { pattern: '*/5 * * * *' }, // Every 5 minutes
      jobId: 'health-check-cron',
    }
  );
}

export async function addBulkAvailabilityJob(data: Omit<BulkAvailabilityCheckJobData, 'type'>) {
  const job = await bulkAvailabilityQueue.add('bulk-availability-check', {
    type: 'bulk-availability-check',
    ...data,
  });
  return job.id;
}

export async function addIntegrationSyncJob(data: Omit<IntegrationSyncJobData, 'type'>) {
  const job = await integrationSyncQueue.add('integration-sync', {
    type: 'integration-sync',
    ...data,
  });
  return job.id;
}

export async function addMessageProcessingJob(data: Omit<ProcessMessageJobData, 'type'>) {
  const job = await messageProcessingQueue.add('process-message', {
    type: 'process-message',
    ...data,
  });
  return job.id;
}

// Queue monitoring functions
export async function getQueueStats() {
  const queues = [
    scheduledMessagesQueue,
    healthCheckQueue,
    bulkAvailabilityQueue,
    integrationSyncQueue,
    messageProcessingQueue,
  ];

  const stats = await Promise.all(
    queues.map(async (queue) => ({
      name: queue.name,
      waiting: await queue.getWaiting(),
      active: await queue.getActive(),
      completed: await queue.getCompleted(),
      failed: await queue.getFailed(),
      delayed: await queue.getDelayed(),
    }))
  );

  return stats;
}

export async function getJobCounts() {
  const queues = [
    scheduledMessagesQueue,
    healthCheckQueue,
    bulkAvailabilityQueue,
    integrationSyncQueue,
    messageProcessingQueue,
  ];

  const counts = await Promise.all(
    queues.map(async (queue) => ({
      name: queue.name,
      waiting: await queue.getWaitingCount(),
      active: await queue.getActiveCount(),
      completed: await queue.getCompletedCount(),
      failed: await queue.getFailedCount(),
      delayed: await queue.getDelayedCount(),
    }))
  );

  return counts;
}

// Cleanup function
export async function closeConnections() {
  await Promise.all([
    scheduledMessagesQueue.close(),
    healthCheckQueue.close(),
    bulkAvailabilityQueue.close(),
    integrationSyncQueue.close(),
    messageProcessingQueue.close(),
  ]);
  
  redisConnection.disconnect();
}

// Initialize scheduled jobs (call this on app startup)
export async function initializeScheduledJobs() {
  try {
    // Clear existing repeatable jobs to avoid duplicates
    await scheduledMessagesQueue.removeJobScheduler('scheduled-messages-cron');
    await healthCheckQueue.removeJobScheduler('health-check-cron');

    // Schedule new jobs
    await scheduleScheduledMessagesJob();
    await scheduleHealthCheckJob();

    console.log('✅ BullMQ scheduled jobs initialized');
  } catch (error) {
    console.error('❌ Failed to initialize BullMQ scheduled jobs:', error);
    throw error;
  }
}
