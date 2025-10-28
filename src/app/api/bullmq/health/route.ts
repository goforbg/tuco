import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// GET /api/bullmq/health - Health check for BullMQ server
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if BullMQ server is reachable
    const bullmqServerUrl = process.env.BULLMQ_SERVER_URL || 'http://localhost:3001';
    
    try {
      const response = await fetch(`${bullmqServerUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.SERVICE_TOKEN}`,
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        return NextResponse.json({
          status: 'unhealthy',
          message: 'BullMQ server is not responding properly',
          statusCode: response.status,
        }, { status: 503 });
      }

      const healthData = await response.json();
      
      return NextResponse.json({
        status: 'healthy',
        message: 'BullMQ server is healthy',
        bullmqServer: healthData,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      return NextResponse.json({
        status: 'unhealthy',
        message: 'BullMQ server is not reachable',
        error: error instanceof Error ? error.message : 'Unknown error',
        checkedAt: new Date().toISOString(),
      }, { status: 503 });
    }
  } catch (error) {
    console.error('Error checking BullMQ health:', error);
    return NextResponse.json({ 
      error: 'Failed to check BullMQ health' 
    }, { status: 500 });
  }
}
