import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';
import { ILead, LeadCollection } from '@/models/Lead';
import { IList, ListCollection } from '@/models/List';
import { IImportJob, ImportJobCollection } from '@/models/ImportJob';
import { ObjectId } from 'mongodb';

// HubSpot API configuration
const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const HUBSPOT_OAUTH_BASE = 'https://app.hubspot.com/oauth';

// Environment variables for OAuth
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/hubspot/callback`;

// OAuth flow initiation
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'oauth') {
      // Initiate OAuth flow
      const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
      const scopes = 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read';
      
      const authUrl = `${HUBSPOT_OAUTH_BASE}/authorize?` + new URLSearchParams({
        client_id: HUBSPOT_CLIENT_ID!,
        redirect_uri: HUBSPOT_REDIRECT_URI,
        scope: scopes,
        state,
      });

      return NextResponse.json({ authUrl });
    }

    if (action === 'callback') {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      
      if (!code || !state) {
        return NextResponse.json({ error: 'Missing authorization code or state' }, { status: 400 });
      }

      // Decode state to get userId
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId: stateUserId } = stateData;

      // Exchange code for access token
      const tokenResponse = await fetch(`${HUBSPOT_OAUTH_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: HUBSPOT_CLIENT_ID!,
          client_secret: HUBSPOT_CLIENT_SECRET!,
          redirect_uri: HUBSPOT_REDIRECT_URI,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = await tokenResponse.json();
      const { access_token, refresh_token } = tokenData;

      // Save integration config
      const { db } = await connectDB();
      const integrationConfig: IIntegrationConfig = {
        type: 'hubspot',
        credentials: {
          accessToken: access_token,
          refreshToken: refresh_token,
          accountId: tokenData.hub_id,
        },
        settings: {
          autoSync: true,
          syncInterval: 15, // 15 minutes
          lastSyncAt: new Date(),
          fieldMappings: {
            firstName: 'firstname',
            lastName: 'lastname',
            email: 'email',
            phone: 'phone',
            companyName: 'company',
            jobTitle: 'jobtitle',
            linkedinUrl: 'linkedin_url',
            notes: 'notes',
          },
        },
        isActive: true,
        userId: stateUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Check if integration already exists
      const existingConfig = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
        .findOne({ userId: stateUserId, type: 'hubspot' });

      let configId: ObjectId;
      if (existingConfig) {
        await db.collection<IIntegrationConfig>(IntegrationConfigCollection).updateOne(
          { _id: existingConfig._id },
          { $set: integrationConfig }
        );
        configId = existingConfig._id!;
      } else {
        const result = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
          .insertOne(integrationConfig);
        configId = result.insertedId;
      }

      // Start background import job
      await startHubSpotImportJob(stateUserId, access_token, configId);

      return NextResponse.json({
        message: 'HubSpot OAuth successful',
        configId,
        redirectUrl: '/leads?hubspot=connected'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('HubSpot OAuth error:', error);
    return NextResponse.json(
      { error: 'OAuth flow failed' },
      { status: 500 }
    );
  }
}

// Manual import trigger
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { listId, forceFullSync = false } = await request.json();
    const { db } = await connectDB();

    // Get integration config
    const config = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
      .findOne({ userId, type: 'hubspot', isActive: true });

    if (!config) {
      return NextResponse.json({ error: 'HubSpot integration not configured' }, { status: 404 });
    }

    // Check if we need to refresh token
    const accessToken = await getValidAccessToken(config);
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get valid access token' }, { status: 401 });
    }

    // Start import job
    const jobId = await startHubSpotImportJob(userId, accessToken, config._id!, listId, forceFullSync);

    return NextResponse.json({
      message: 'HubSpot import started',
      jobId,
    });

  } catch (error) {
    console.error('Error starting HubSpot import:', error);
    return NextResponse.json(
      { error: 'Failed to start import' },
      { status: 500 }
    );
  }
}

async function startHubSpotImportJob(
  userId: string, 
  accessToken: string, 
  configId: ObjectId, 
  listId?: string, 
  forceFullSync = false
): Promise<ObjectId> {
  const { db } = await connectDB();

  // Create import job
  const importJob: IImportJob = {
    type: 'hubspot',
    status: 'pending',
    totalRecords: 0,
    processedRecords: 0,
    successfulRecords: 0,
    failedRecords: 0,
    integrationConfigId: configId,
    listId: listId ? new ObjectId(listId) : undefined,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const jobResult = await db.collection<IImportJob>(ImportJobCollection).insertOne(importJob);
  const jobId = jobResult.insertedId;

  // Start background import (in production, use a proper job queue like Bull or Agenda)
  importHubSpotContactsBackground(userId, accessToken, jobId, listId, forceFullSync)
    .catch(error => {
      console.error('Background import failed:', error);
      // Update job status to failed
      db.collection<IImportJob>(ImportJobCollection).updateOne(
        { _id: jobId },
        { 
          $set: { 
            status: 'failed',
            lastError: error.message,
            completedAt: new Date()
          }
        }
      );
    });

  return jobId;
}

async function importHubSpotContactsBackground(
  userId: string,
  accessToken: string,
  jobId: ObjectId,
  listId?: string,
  forceFullSync = false
): Promise<void> {
  const { db } = await connectDB();

  try {
    // Update job status
    await db.collection<IImportJob>(ImportJobCollection).updateOne(
      { _id: jobId },
      { $set: { status: 'processing' } }
    );

    let totalImported = 0;
    let totalProcessed = 0;
    let after: string | undefined;
    const batchSize = 100;

    // Get existing HubSpot IDs to avoid duplicates (unless force full sync)
    let existingHubSpotIds = new Set<string>();
    if (!forceFullSync) {
      const existingLeads = await db.collection<ILead>(LeadCollection)
        .find({ 
          userId, 
          'integrationIds.hubspotRecordId': { $exists: true } 
        })
        .project({ 'integrationIds.hubspotRecordId': 1 })
        .toArray();
      
      existingHubSpotIds = new Set(
        existingLeads
          .map(lead => lead.integrationIds?.hubspotRecordId)
          .filter(Boolean)
      );
    }

    do {
      // Fetch contacts from HubSpot
      const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?` + new URLSearchParams({
        limit: batchSize.toString(),
        properties: 'firstname,lastname,email,phone,company,jobtitle,linkedin_url,notes,createdate,lastmodifieddate',
        ...(after && { after }),
      });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid or expired access token');
        }
        throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const contacts = data.results || [];
      
      if (contacts.length === 0) break;

      // Process contacts in batches
      const leadsToInsert: ILead[] = [];
      const leadsToUpdate: Array<{ filter: Record<string, string | ObjectId>; update: { $set: Partial<ILead> } }> = [];

      for (const contact of contacts) {
        totalProcessed++;
        
        // Skip if we already have this contact (unless force full sync)
        if (!forceFullSync && existingHubSpotIds.has(contact.id)) {
          continue;
        }

        const leadData = {
          firstName: contact.properties.firstname || '',
          lastName: contact.properties.lastname || '',
          email: contact.properties.email || '',
          phone: contact.properties.phone || '',
          companyName: contact.properties.company || undefined,
          jobTitle: contact.properties.jobtitle || undefined,
          linkedinUrl: contact.properties.linkedin_url || undefined,
          notes: contact.properties.notes || undefined,
          integrationIds: {
            hubspotRecordId: contact.id,
          },
          listId: listId ? new ObjectId(listId) : undefined,
          userId,
          source: 'hubspot' as const,
          createdAt: new Date(contact.properties.createdate || contact.createdAt),
          updatedAt: new Date(contact.properties.lastmodifieddate || contact.updatedAt),
        };

        // Check if lead already exists
        const existingLead = await db.collection<ILead>(LeadCollection)
          .findOne({ 
            userId, 
            'integrationIds.hubspotRecordId': contact.id 
          });

        if (existingLead) {
          leadsToUpdate.push({
            filter: { _id: existingLead._id },
            update: { $set: leadData }
          });
        } else {
          leadsToInsert.push(leadData);
        }
      }

      // Bulk insert new leads
      if (leadsToInsert.length > 0) {
        await db.collection<ILead>(LeadCollection).insertMany(leadsToInsert);
        totalImported += leadsToInsert.length;
      }

      // Bulk update existing leads
      if (leadsToUpdate.length > 0) {
        for (const updateOp of leadsToUpdate) {
          await db.collection<ILead>(LeadCollection).updateOne(
            updateOp.filter,
            updateOp.update
          );
        }
      }

      // Update job progress
      await db.collection<IImportJob>(ImportJobCollection).updateOne(
        { _id: jobId },
        { 
          $set: { 
            processedRecords: totalProcessed,
            successfulRecords: totalImported,
            updatedAt: new Date()
          }
        }
      );

      after = data.paging?.next?.after;

      // Rate limiting - HubSpot allows 100 requests per 10 seconds
      if (after) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } while (after);

    // Update list count if listId provided
    if (listId) {
      const leadCount = await db.collection<ILead>(LeadCollection)
        .countDocuments({ userId, listId: new ObjectId(listId) });
      
      await db.collection<IList>(ListCollection).updateOne(
        { _id: new ObjectId(listId) },
        { 
          $set: { 
            leadCount,
            updatedAt: new Date()
          }
        }
      );
    }

    // Update integration config last sync time
    await db.collection<IIntegrationConfig>(IntegrationConfigCollection).updateOne(
      { _id: jobId },
      { 
        $set: { 
          'settings.lastSyncAt': new Date(),
          updatedAt: new Date()
        }
      }
    );

    // Mark job as completed
    await db.collection<IImportJob>(ImportJobCollection).updateOne(
      { _id: jobId },
      { 
        $set: { 
          status: 'completed',
          totalRecords: totalProcessed,
          completedAt: new Date()
        }
      }
    );

  } catch (error) {
    console.error('HubSpot import error:', error);
    
    // Mark job as failed
    await db.collection<IImportJob>(ImportJobCollection).updateOne(
      { _id: jobId },
      { 
        $set: { 
          status: 'failed',
          lastError: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date()
        }
      }
    );
    
    throw error;
  }
}

async function getValidAccessToken(config: IIntegrationConfig): Promise<string | null> {
  if (!config.credentials.accessToken) {
    return null;
  }

  // For now, return the stored token
  // In production, you'd check expiration and refresh if needed
  return config.credentials.accessToken;
}
