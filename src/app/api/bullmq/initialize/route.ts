import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { initializeScheduledJobs } from '@/lib/bullmq';

// POST /api/bullmq/initialize - Initialize scheduled jobs (admin only)
export async function POST() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Add admin check here if needed
    await initializeScheduledJobs();

    return NextResponse.json({
      success: true,
      message: 'Scheduled jobs initialized successfully',
    });
  } catch (error) {
    console.error('Error initializing BullMQ jobs:', error);
    return NextResponse.json({ 
      error: 'Failed to initialize scheduled jobs' 
    }, { status: 500 });
  }
}
