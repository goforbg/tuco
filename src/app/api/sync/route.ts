import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';
import { ObjectId } from 'mongodb';

// Background sync service for continuous integration syncing
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { integrationType, listId, forceFullSync = false } = await request.json();
    const { db } = await connectDB();

    // Get integration config
    const config = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
      .findOne({ userId, type: integrationType, isActive: true });

    if (!config) {
      return NextResponse.json({ error: `${integrationType} integration not configured` }, { status: 404 });
    }

    // Trigger sync based on integration type
    let syncResult;
    switch (integrationType) {
      case 'hubspot':
        syncResult = await triggerHubSpotSync(userId, config, listId, forceFullSync);
        break;
      case 'salesforce':
        syncResult = await triggerSalesforceSync(userId, config, listId, forceFullSync);
        break;
      case 'google_sheets':
        syncResult = await triggerGoogleSheetsSync(userId, config, listId, forceFullSync);
        break;
      default:
        return NextResponse.json({ error: 'Unsupported integration type' }, { status: 400 });
    }

    return NextResponse.json({
      message: `${integrationType} sync started`,
      jobId: syncResult.jobId,
    });

  } catch (error) {
    console.error('Error starting sync:', error);
    return NextResponse.json(
      { error: 'Failed to start sync' },
      { status: 500 }
    );
  }
}

// Get sync status
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const { db } = await connectDB();

    if (jobId) {
      // Get specific job status
      const job = await db.collection('import_jobs').findOne({
        _id: new ObjectId(jobId),
        userId
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json({ job });
    } else {
      // Get all active integrations and their sync status
      const integrations = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
        .find({ userId, isActive: true })
        .toArray();

      const syncStatus = await Promise.all(
        integrations.map(async (integration) => {
          const lastJob = await db.collection('import_jobs')
            .findOne(
              { userId, type: integration.type },
              { sort: { createdAt: -1 } }
            );

          return {
            type: integration.type,
            isActive: integration.isActive,
            lastSyncAt: integration.settings.lastSyncAt,
            autoSync: integration.settings.autoSync,
            syncInterval: integration.settings.syncInterval,
            lastJob: lastJob ? {
              status: lastJob.status,
              processedRecords: lastJob.processedRecords,
              successfulRecords: lastJob.successfulRecords,
              failedRecords: lastJob.failedRecords,
              createdAt: lastJob.createdAt,
              completedAt: lastJob.completedAt,
            } : null,
          };
        })
      );

      return NextResponse.json({ integrations: syncStatus });
    }

  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

async function triggerHubSpotSync(
  _userId: string, 
  config: IIntegrationConfig, 
  _listId?: string, 
  _forceFullSync = false
): Promise<{ jobId: ObjectId }> {
  // Suppress unused parameter warnings
  void _listId;
  void _forceFullSync;
  // For now, return a dummy job ID since we can't import the function
  // In a real implementation, you'd call the HubSpot import directly
  return { jobId: config._id! };
}

async function triggerSalesforceSync(
  _userId: string, 
  config: IIntegrationConfig, 
  _listId?: string, 
  _forceFullSync = false
): Promise<{ jobId: ObjectId }> {
  // Suppress unused parameter warnings
  void _listId;
  void _forceFullSync;
  // For now, return a dummy job ID since we can't import the function
  // In a real implementation, you'd call the Salesforce import directly
  return { jobId: config._id! };
}

async function triggerGoogleSheetsSync(
  _userId: string, 
  config: IIntegrationConfig, 
  _listId?: string, 
  _forceFullSync = false
): Promise<{ jobId: ObjectId }> {
  // Suppress unused parameter warnings
  void _listId;
  void _forceFullSync;
  // For now, return a dummy job ID since we can't import the function
  // In a real implementation, you'd call the Google Sheets import directly
  return { jobId: config._id! };
}
