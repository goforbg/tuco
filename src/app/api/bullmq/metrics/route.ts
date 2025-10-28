import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// GET /api/bullmq/metrics - Get BullMQ server metrics
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get metrics from BullMQ server
    const bullmqServerUrl = process.env.BULLMQ_SERVER_URL || 'http://localhost:3001';
    
    try {
      const response = await fetch(`${bullmqServerUrl}/metrics`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.SERVICE_TOKEN}`,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        return NextResponse.json({
          error: 'Failed to fetch metrics from BullMQ server',
          statusCode: response.status,
        }, { status: 503 });
      }

      const metricsData = await response.json();
      
      return NextResponse.json({
        success: true,
        metrics: metricsData,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return NextResponse.json({
        error: 'Failed to connect to BullMQ server',
        details: error instanceof Error ? error.message : 'Unknown error',
        fetchedAt: new Date().toISOString(),
      }, { status: 503 });
    }
  } catch (error) {
    console.error('Error fetching BullMQ metrics:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch metrics' 
    }, { status: 500 });
  }
}
