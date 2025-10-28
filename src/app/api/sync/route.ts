import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';
import { ObjectId } from 'mongodb';
import { addIntegrationSyncJob } from '@/lib/bullmq';

// Background sync service for continuous integration syncing
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
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

    // Add sync job to BullMQ queue instead of processing synchronously
    const workspaceId = orgId || userId;
    const jobId = await addIntegrationSyncJob({
      integrationType,
      userId,
      workspaceId,
      configId: config._id!.toString(),
      listId,
      forceFullSync,
    });

    return NextResponse.json({
      message: `${integrationType} sync started`,
      jobId,
      processingMode: 'background',
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

