import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';
import { ILead, LeadCollection } from '@/models/Lead';
import { IList, ListCollection } from '@/models/List';
import { IImportJob, ImportJobCollection } from '@/models/ImportJob';
import { ObjectId } from 'mongodb';

// Salesforce OAuth configuration
const SALESFORCE_LOGIN_URL = 'https://login.salesforce.com';
// const SALESFORCE_SANDBOX_URL = 'https://test.salesforce.com';

// Environment variables for OAuth
const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID;
const SALESFORCE_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET;
const SALESFORCE_REDIRECT_URI = process.env.SALESFORCE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/salesforce/callback`;

// OAuth flow initiation
export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'oauth') {
      // Initiate OAuth flow
      const state = Buffer.from(JSON.stringify({ userId, orgId })).toString('base64');
      const scopes = 'api refresh_token';
      
      const authUrl = `${SALESFORCE_LOGIN_URL}/services/oauth2/authorize?` + new URLSearchParams({
        response_type: 'code',
        client_id: SALESFORCE_CLIENT_ID!,
        redirect_uri: SALESFORCE_REDIRECT_URI,
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
      const { userId: stateUserId, orgId: stateOrgId } = stateData;

      // Exchange code for access token
      const tokenResponse = await fetch(`${SALESFORCE_LOGIN_URL}/services/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: SALESFORCE_CLIENT_ID!,
          client_secret: SALESFORCE_CLIENT_SECRET!,
          redirect_uri: SALESFORCE_REDIRECT_URI,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = await tokenResponse.json();
      const { access_token, refresh_token, instance_url } = tokenData;

      // Save integration config
      const { db } = await connectDB();
      const integrationConfig: IIntegrationConfig = {
        type: 'salesforce',
        credentials: {
          accessToken: access_token,
          refreshToken: refresh_token,
          accountId: instance_url,
        },
        settings: {
          autoSync: true,
          syncInterval: 15, // 15 minutes
          lastSyncAt: new Date(),
          fieldMappings: {
            firstName: 'FirstName',
            lastName: 'LastName',
            email: 'Email',
            phone: 'Phone',
            companyName: 'Company',
            jobTitle: 'Title',
            linkedinUrl: 'LinkedIn_URL__c',
            notes: 'Description',
          },
        },
        isActive: true,
        userId: stateUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Check if integration already exists
      const existingConfig = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
        .findOne({ userId: stateUserId, type: 'salesforce' });

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
      await startSalesforceImportJob(stateUserId, stateOrgId, access_token, instance_url, configId);

      return NextResponse.json({
        message: 'Salesforce OAuth successful',
        configId,
        redirectUrl: '/leads?salesforce=connected'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Salesforce OAuth error:', error);
    return NextResponse.json(
      { error: 'OAuth flow failed' },
      { status: 500 }
    );
  }
}

// Manual import trigger
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { listId, forceFullSync = false } = await request.json();
    const { db } = await connectDB();

    // Get integration config
    const config = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
      .findOne({ userId, type: 'salesforce', isActive: true });

    if (!config) {
      return NextResponse.json({ error: 'Salesforce integration not configured' }, { status: 404 });
    }

    // Check if we need to refresh token
    const { accessToken, instanceUrl } = await getValidSalesforceCredentials(config);
    if (!accessToken || !instanceUrl) {
      return NextResponse.json({ error: 'Failed to get valid credentials' }, { status: 401 });
    }

    // Start import job
    const jobId = await startSalesforceImportJob(userId, orgId, accessToken, instanceUrl, config._id!, listId, forceFullSync);

    return NextResponse.json({
      message: 'Salesforce import started',
      jobId,
    });

  } catch (error) {
    console.error('Error starting Salesforce import:', error);
    return NextResponse.json(
      { error: 'Failed to start import' },
      { status: 500 }
    );
  }
}

async function startSalesforceImportJob(
  userId: string,
  orgId: string,
  accessToken: string, 
  instanceUrl: string,
  configId: ObjectId, 
  listId?: string, 
  forceFullSync = false
): Promise<ObjectId> {
  const { db } = await connectDB();

  // Create import job
  const importJob: IImportJob = {
    type: 'salesforce',
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

  // Start background import
  importSalesforceLeadsBackground(userId, orgId, accessToken, instanceUrl, jobId, configId, listId, forceFullSync)
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

async function importSalesforceLeadsBackground(
  userId: string,
  orgId: string,
  accessToken: string,
  instanceUrl: string,
  jobId: ObjectId,
  configId: ObjectId,
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
    let nextRecordsUrl: string | undefined;

    // Get existing Salesforce IDs to avoid duplicates (unless force full sync)
    let existingSalesforceIds = new Set<string>();
    if (!forceFullSync) {
      const existingLeads = await db.collection<ILead>(LeadCollection)
        .find({ 
          userId, 
          'integrationIds.salesforceRecordId': { $exists: true } 
        })
        .project({ 'integrationIds.salesforceRecordId': 1 })
        .toArray();
      
      existingSalesforceIds = new Set(
        existingLeads
          .map(lead => lead.integrationIds?.salesforceRecordId)
          .filter(Boolean)
      );
    }

    // Initial query to get leads
    const initialQuery = `SELECT Id, FirstName, LastName, Email, Phone, Company, Title, LinkedIn_URL__c, Description, CreatedDate, LastModifiedDate FROM Lead ORDER BY LastModifiedDate DESC`;
    let queryUrl = `${instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(initialQuery)}`;

    do {
      // Fetch leads from Salesforce
      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid or expired access token');
        }
        throw new Error(`Salesforce API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const leads = data.records || [];
      
      if (leads.length === 0) break;

      // Process leads in batches
      const leadsToInsert: ILead[] = [];
      const leadsToUpdate: Array<{ filter: Record<string, string | ObjectId>; update: { $set: Partial<ILead> } }> = [];

      for (const lead of leads) {
        totalProcessed++;
        
        // Skip if we already have this lead (unless force full sync)
        if (!forceFullSync && existingSalesforceIds.has(lead.Id)) {
          continue;
        }

        const leadData: ILead = {
          firstName: lead.FirstName || '',
          lastName: lead.LastName || '',
          email: lead.Email || '',
          phone: lead.Phone || '',
          companyName: lead.Company || undefined,
          jobTitle: lead.Title || undefined,
          linkedinUrl: lead.LinkedIn_URL__c || undefined,
          notes: lead.Description || undefined,
          integrationIds: {
            salesforceRecordId: lead.Id,
          },
          listId: listId ? new ObjectId(listId) : undefined,
          workspaceId: orgId!,
          contactOwnerId: userId,
          createdByUserId: userId,
          source: 'salesforce' as const,
          createdAt: new Date(lead.CreatedDate),
          updatedAt: new Date(lead.LastModifiedDate),
        };

        // Check if lead already exists
        const existingLead = await db.collection<ILead>(LeadCollection)
          .findOne({ 
            userId, 
            'integrationIds.salesforceRecordId': lead.Id 
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

      nextRecordsUrl = data.nextRecordsUrl;

      // Rate limiting - Salesforce allows 1000 API calls per 24 hours
      if (nextRecordsUrl) {
        await new Promise(resolve => setTimeout(resolve, 200));
        queryUrl = `${instanceUrl}${nextRecordsUrl}`;
      }

    } while (nextRecordsUrl);

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
      { _id: configId },
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
    console.error('Salesforce import error:', error);
    
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

async function getValidSalesforceCredentials(config: IIntegrationConfig): Promise<{ accessToken: string | null; instanceUrl: string | null }> {
  if (!config.credentials.accessToken || !config.credentials.accountId) {
    return { accessToken: null, instanceUrl: null };
  }

  // For now, return the stored credentials
  // In production, you'd check expiration and refresh if needed
  return { 
    accessToken: config.credentials.accessToken, 
    instanceUrl: config.credentials.accountId 
  };
}
