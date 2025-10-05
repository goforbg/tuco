import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';
import { ILead, LeadCollection } from '@/models/Lead';
import { IList, ListCollection } from '@/models/List';
import { ObjectId } from 'mongodb';

// Google Sheets API configuration
const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken, spreadsheetId, sheetName = 'Sheet1', listId } = await request.json();

    if (!accessToken || !spreadsheetId) {
      return NextResponse.json({ error: 'Access token and spreadsheet ID are required' }, { status: 400 });
    }

    const { db } = await connectDB();

    // Test the access token by making a request to Google Sheets
    const testResponse = await fetch(`${GOOGLE_SHEETS_API_BASE}/${spreadsheetId}/values/${sheetName}?range=A1:Z1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      return NextResponse.json({ error: 'Invalid Google Sheets credentials or spreadsheet not accessible' }, { status: 400 });
    }

    // Save or update integration config
    const integrationConfig: IIntegrationConfig = {
      type: 'google_sheets',
      credentials: {
        accessToken,
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

      // Insert leads
      const result = await db.collection<ILead>(LeadCollection).insertMany(processedLeads);

      // Update list count if listId provided
      if (listId) {
        await db.collection<IList>(ListCollection).updateOne(
          { _id: new ObjectId(listId) },
          { 
            $inc: { leadCount: result.insertedCount },
            $set: { updatedAt: new Date() }
          }
        );
      }

      return NextResponse.json({
        message: 'Google Sheets integration successful',
        importedCount: result.insertedCount,
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
