import { initializeScheduledJobs } from '@/lib/bullmq';

// Initialize BullMQ scheduled jobs on app startup
export async function initializeBullMQ() {
  try {
    console.log('🚀 Initializing BullMQ scheduled jobs...');
    await initializeScheduledJobs();
    console.log('✅ BullMQ scheduled jobs initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize BullMQ scheduled jobs:', error);
    // Don't throw error to prevent app startup failure
    // BullMQ jobs can be initialized later via API endpoint
  }
}

// Call this function when the app starts
if (typeof window === 'undefined') {
  // Only run on server side
  initializeBullMQ();
}
