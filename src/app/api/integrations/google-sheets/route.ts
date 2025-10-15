import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';
import { ILead, LeadCollection } from '@/models/Lead';
import { IList, ListCollection } from '@/models/List';
import { ObjectId } from 'mongodb';
import { google } from 'googleapis';

// Google Sheets API configuration
const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// Get Google Sheets access token from service account
async function getGoogleSheetsAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  
  if (!clientEmail || !privateKey) {
    throw new Error('Google Service Account credentials not configured');
  }

  // Replace escaped newlines with actual newlines and ensure proper PEM format
  const formattedPrivateKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/\n\s*\n/g, '\n'); // Remove empty lines
  
  // Use the newer JWT constructor instead of deprecated methods
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: formattedPrivateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return auth;
}

async function getAccessToken(): Promise<string> {
  try {
    const auth = await getGoogleSheetsAuth();
    await auth.authorize();
    const accessToken = await auth.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error('Failed to get access token from service account');
    }
    
    return accessToken.token;
  } catch (error) {
    console.error('Error getting Google Sheets access token:', error);
    throw new Error(`Google Sheets authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to extract spreadsheet ID from URL or return as-is if already an ID
function extractSpreadsheetId(urlOrId: string): string {
  // If it's already just an ID (no slashes), return it
  if (!urlOrId.includes('/')) {
    return urlOrId;
  }
  
  // Try to extract from various Google Sheets URL formats
  // Format: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit...
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  
  // If no match, return the original (might be an ID)
  return urlOrId;
}

// Helper function to fetch Google Sheets data without importing
async function fetchGoogleSheetsData(spreadsheetId: string, accessToken: string) {
  try {
    // Get spreadsheet metadata
    const sheetsResponse = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!sheetsResponse.ok) {
      return NextResponse.json({ 
        error: 'Unable to access spreadsheet. Make sure the URL is correct and the sheet is shared properly.' 
      }, { status: 400 });
    }

    const sheetsData = await sheetsResponse.json();
    const firstSheet = sheetsData.sheets?.[0];
    const sheetName = firstSheet?.properties?.title || 'Sheet1';
    const spreadsheetName = sheetsData.properties?.title || 'Google Sheets Import';

    // Fetch all data from the first sheet
    const dataResponse = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${sheetName}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!dataResponse.ok) {
      return NextResponse.json({ 
        error: `Unable to read data from sheet "${sheetName}". Make sure it's not empty.` 
      }, { status: 400 });
    }

    const data = await dataResponse.json();
    const values = data.values || [];

    if (values.length === 0) {
      return NextResponse.json({ 
        error: 'The spreadsheet is empty. Please add data and try again.' 
      }, { status: 400 });
    }

    // First row is headers, rest is data
    const headers = values[0];
    const rows = values.slice(1);

    return NextResponse.json({
      success: true,
      headers,
      data: rows,
      spreadsheetName,
      sheetName,
      rowCount: rows.length
    });
  } catch (error) {
    console.error('Error fetching Google Sheets data:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch data from Google Sheets' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { spreadsheetId: spreadsheetUrlOrId, listId, action } = await request.json();

    if (!spreadsheetUrlOrId) {
      return NextResponse.json({ error: 'Google Sheet URL or ID is required' }, { status: 400 });
    }

    // Extract the spreadsheet ID from URL or use as-is if already an ID
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);

    // Get access token from service account
    const accessToken = await getAccessToken();

    // If action is 'fetch', just return the data without importing
    if (action === 'fetch') {
      return await fetchGoogleSheetsData(spreadsheetId, accessToken);
    }

    const { db } = await connectDB();

    // Get the first sheet name from the spreadsheet
    const sheetsResponse = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!sheetsResponse.ok) {
      return NextResponse.json({ error: 'Invalid Google Sheets credentials or spreadsheet not accessible. Make sure the spreadsheet is shared with the service account email: google-sheets@red-road-475121-b4.iam.gserviceaccount.com' }, { status: 400 });
    }

    const sheetsData = await sheetsResponse.json();
    const firstSheet = sheetsData.sheets?.[0];
    const sheetName = firstSheet?.properties?.title || 'Sheet1';

    // Test the access token by making a request to the first sheet
    const testResponse = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${sheetName}?range=A1:Z1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      return NextResponse.json({ error: `Unable to access sheet "${sheetName}". Make sure the sheet exists and is accessible.` }, { status: 400 });
    }

    // Save or update integration config
    const integrationConfig: IIntegrationConfig = {
      type: 'google_sheets',
      credentials: {
        accountId: spreadsheetId,
        workspaceId: sheetName,
      },
      settings: {
        autoSync: false,
        syncInterval: 60,
        fieldMappings: {
          firstName: 'firstName',
          lastName: 'lastName',
          email: 'email',
          phone: 'phone',
          companyName: 'companyName',
          jobTitle: 'jobTitle',
          linkedinUrl: 'linkedinUrl',
          notes: 'notes',
        },
      },
      isActive: true,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Check if integration already exists
    const existingConfig = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
      .findOne({ userId, type: 'google_sheets' });

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

    // Import data from Google Sheets
    const sheetData = await importGoogleSheetsData(accessToken, spreadsheetId, sheetName);
    
    if (sheetData.length > 0) {
      // Process data and save to database
      const processedLeads = sheetData
        .filter((row: string[], index: number) => index > 0) // Skip header row
        .map((row: string[], index: number) => {
        
        return {
          firstName: row[0] || '',
          lastName: row[1] || '',
          email: row[2] || '',
          phone: row[3] || '',
          companyName: row[4] || undefined,
          jobTitle: row[5] || undefined,
          linkedinUrl: row[6] || undefined,
          notes: row[7] || undefined,
          integrationIds: {
            googleSheetsRowId: `${index + 2}`, // Row number in sheet (index + 2 because we filtered out header)
          },
          listId: listId ? new ObjectId(listId) : undefined,
          workspaceId: orgId!,
          contactOwnerId: userId,
          createdByUserId: userId,
          source: 'google_sheets' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }).filter(Boolean);

      // Check for duplicates based on email + phone combination in the workspace
      const emailPhonePairs = processedLeads.map(lead => ({
        email: lead.email.toLowerCase(),
        phone: lead.phone
      }));

      const existingLeads = await db.collection<ILead>(LeadCollection)
        .find({
          workspaceId: orgId,
          $or: emailPhonePairs.map(pair => ({
            email: pair.email,
            phone: pair.phone
          }))
        })
        .project({ email: 1, phone: 1 })
        .toArray();

      // Create a Set of existing email+phone combinations for fast lookup
      const existingCombos = new Set(
        existingLeads.map(lead => `${lead.email.toLowerCase()}:${lead.phone}`)
      );

      // Filter out duplicates
      const newLeads = processedLeads.filter(lead => 
        !existingCombos.has(`${lead.email.toLowerCase()}:${lead.phone}`)
      );

      const duplicateCount = processedLeads.length - newLeads.length;

      // Insert only new leads
      let insertedCount = 0;
      if (newLeads.length > 0) {
        const result = await db.collection<ILead>(LeadCollection).insertMany(newLeads);
        insertedCount = result.insertedCount;
      }

      // Update list count if listId provided
      if (listId && insertedCount > 0) {
        await db.collection<IList>(ListCollection).updateOne(
          { _id: new ObjectId(listId) },
          { 
            $inc: { leadCount: insertedCount },
            $set: { updatedAt: new Date() }
          }
        );
      }

      return NextResponse.json({
        message: 'Google Sheets integration successful',
        importedCount: insertedCount,
        duplicateCount,
        totalProcessed: processedLeads.length,
        configId,
      });
    }

    return NextResponse.json({
      message: 'Google Sheets integration configured successfully',
      importedCount: 0,
      configId,
    });

  } catch (error) {
    console.error('Error setting up Google Sheets integration:', error);
    return NextResponse.json(
      { error: 'Failed to setup Google Sheets integration' },
      { status: 500 }
    );
  }
}

async function importGoogleSheetsData(accessToken: string, spreadsheetId: string, sheetName: string): Promise<string[][]> {
  try {
    // Get all data from the sheet
    const response = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${sheetName}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.status}`);
    }

    const data = await response.json();
    return data.values || [];

  } catch (error) {
    console.error('Error importing Google Sheets data:', error);
    throw error;
  }
}

// This function is currently unused but kept for future implementation
// async function startGoogleSheetsImportJob(
//   _userId: string,
//   _accessToken: string,
//   _spreadsheetId: string,
//   _sheetName: string,
//   configId: ObjectId,
//   _listId?: string
// ): Promise<ObjectId> {
//   // For now, just return a dummy ObjectId since Google Sheets doesn't have background processing
//   // In a real implementation, you'd create an import job and process it
//   return configId;
// }
