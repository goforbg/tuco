import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { 
  addBulkAvailabilityJob, 
  addIntegrationSyncJob,
  addMessageProcessingJob
} from '@/lib/bullmq';

// POST /api/bullmq/jobs - Add jobs to queues
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const body = await request.json();
    const { jobType, data } = body;

    if (!jobType || !data) {
      return NextResponse.json({ 
        error: 'jobType and data are required' 
      }, { status: 400 });
    }

    const workspaceId = orgId || userId;
    let jobId: string | undefined;

    switch (jobType) {
      case 'bulk-availability-check':
        if (!data.leadIds || !Array.isArray(data.leadIds)) {
          return NextResponse.json({ 
            error: 'leadIds array is required for bulk availability check' 
          }, { status: 400 });
        }
        
        jobId = await addBulkAvailabilityJob({
          leadIds: data.leadIds,
          userId,
          workspaceId,
        });
        break;

      case 'integration-sync':
        if (!data.integrationType || !data.configId) {
          return NextResponse.json({ 
            error: 'integrationType and configId are required for integration sync' 
          }, { status: 400 });
        }
        
        jobId = await addIntegrationSyncJob({
          integrationType: data.integrationType,
          userId,
          workspaceId,
          configId: data.configId,
          listId: data.listId,
          forceFullSync: data.forceFullSync,
        });
        break;

      case 'process-message':
        if (!data.messageId) {
          return NextResponse.json({ 
            error: 'messageId is required for message processing' 
          }, { status: 400 });
        }
        
        jobId = await addMessageProcessingJob({
          messageId: data.messageId,
        });
        break;

      default:
        return NextResponse.json({ 
          error: 'Invalid job type' 
        }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      jobId,
      message: `${jobType} job added to queue`,
    });
  } catch (error) {
    console.error('Error adding BullMQ job:', error);
    return NextResponse.json({ 
      error: 'Failed to add job to queue' 
    }, { status: 500 });
  }
}
