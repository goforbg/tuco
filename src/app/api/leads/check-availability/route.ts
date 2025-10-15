import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { ILead, LeadCollection } from '@/models/Lead';
import { ILine, LineCollection } from '@/models/Line';
import { ObjectId } from 'mongodb';

/**
 * Checks iMessage availability for a single lead
 * Checks all non-empty phone and email fields, prioritizing those with blue bubble status
 */
async function checkSingleAvailability(
  lead: ILead,
  serverUrl: string,
  guid: string
): Promise<{ success: boolean; available?: boolean; error?: string; checkedAddresses?: string[] }> {
  try {
    // Collect all non-empty phone and email addresses
    const addresses: string[] = [];
    
    // Primary phone and email
    if (lead.phone) addresses.push(lead.phone);
    if (lead.email) addresses.push(lead.email);
    
    // Alternate phones
    if (lead.altPhone1) addresses.push(lead.altPhone1);
    if (lead.altPhone2) addresses.push(lead.altPhone2);
    if (lead.altPhone3) addresses.push(lead.altPhone3);
    
    // Alternate emails
    if (lead.altEmail1) addresses.push(lead.altEmail1);
    if (lead.altEmail2) addresses.push(lead.altEmail2);
    if (lead.altEmail3) addresses.push(lead.altEmail3);
    
    if (addresses.length === 0) {
      return { success: false, error: 'No phone or email found' };
    }

    // Check each address until we find one that supports iMessage
    const checkedAddresses: string[] = [];
    
    for (const address of addresses) {
      try {
        checkedAddresses.push(address);
        
        // URL encode the address properly
        const encodedAddress = encodeURIComponent(address);
        
        console.log(`Checking availability for address: ${address} (encoded: ${encodedAddress})`);
        console.log(`API URL: ${serverUrl}/api/v1/handle/availability/imessage?address=${encodedAddress}&guid=${guid}`);
        
        const response = await fetch(
          `${serverUrl}/api/v1/handle/availability/imessage?address=${encodedAddress}&guid=${guid}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.warn(`HTTP ${response.status} for address ${address}, trying next address`);
          continue;
        }

        const data = await response.json();
        console.log(`API response for ${address}:`, data);
        
        // Parse the API response structure: { status: 200, message: 'Success', data: { available: true } }
        let available = false;
        if (data.data && typeof data.data.available === 'boolean') {
          available = data.data.available;
        } else if (typeof data.available === 'boolean') {
          available = data.available;
        } else if (typeof data === 'boolean') {
          available = data;
        }
        
        console.log(`Parsed availability for ${address}:`, available);
        
        if (Boolean(available)) {
          console.log(`Found iMessage support for ${address}`);
          return { 
            success: true, 
            available: true, 
            checkedAddresses: checkedAddresses 
          };
        }
      } catch (error) {
        console.warn(`Error checking address ${address}:`, error);
        // Continue to next address
        continue;
      }
    }
    
    // If we get here, none of the addresses support iMessage
    return { 
      success: true, 
      available: false, 
      checkedAddresses: checkedAddresses 
    };
  } catch (error) {
    console.error(`Error checking availability for lead ${lead._id}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// GET /api/leads/check-availability?id=<leadId> - check availability for single lead
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
    const leadId = searchParams.get('id');

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    const { db } = await connectDB();

    // Get the lead
    const lead = await db
      .collection<ILead>(LeadCollection)
      .findOne({ _id: new ObjectId(leadId), workspaceId: orgId });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Get an active line to use for the API call
    const activeLine = await db
      .collection<ILine>(LineCollection)
      .findOne({ 
        workspaceId: orgId, 
        isActive: true, 
        provisioningStatus: 'active' 
      });

    if (!activeLine) {
      return NextResponse.json({ 
        error: 'No active line found to check availability' 
      }, { status: 400 });
    }

    // Update lead status to checking
    await db.collection<ILead>(LeadCollection).updateOne(
      { _id: new ObjectId(leadId) },
      {
        $set: {
          availabilityStatus: 'checking',
          updatedAt: new Date(),
        },
      }
    );

    // Check availability
    const result = await checkSingleAvailability(lead, activeLine.serverUrl, activeLine.guid);

    // Update lead with result
    const updateData: Record<string, unknown> = {
      availabilityCheckedAt: new Date(),
      updatedAt: new Date(),
    };

    if (result.success) {
      updateData.availabilityStatus = result.available ? 'available' : 'unavailable';
    } else {
      updateData.availabilityStatus = 'error';
    }

    await db.collection<ILead>(LeadCollection).updateOne(
      { _id: new ObjectId(leadId) },
      { $set: updateData }
    );

    return NextResponse.json({
      success: true,
      leadId,
      available: result.available,
      status: updateData.availabilityStatus,
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/leads/check-availability - check availability for multiple leads
export async function POST(request: NextRequest) {
  try {
    console.log('=== CHECK AVAILABILITY API CALL ===');
    
    // Check for server-side auth headers first (for background calls)
    const authHeader = request.headers.get('authorization');
    const userIdHeader = request.headers.get('x-user-id');
    const orgIdHeader = request.headers.get('x-org-id');
    
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');
    console.log('User ID header:', userIdHeader);
    console.log('Org ID header:', orgIdHeader);
    
    let userId, orgId;
    
    if (authHeader && userIdHeader && orgIdHeader) {
      console.log('Using server-side auth headers');
      // Server-side call with custom headers
      userId = userIdHeader;
      orgId = orgIdHeader;
    } else {
      console.log('Using regular Clerk auth');
      // Regular client-side call
      const authResult = await auth();
      userId = authResult.userId;
      orgId = authResult.orgId;
    }
    
    console.log('Final userId:', userId);
    console.log('Final orgId:', orgId);
    
    if (!userId) {
      console.log('ERROR: No userId found');
      return NextResponse.json({ error: 'Unauthorized - No userId' }, { status: 401 });
    }
    if (!orgId) {
      console.log('ERROR: No orgId found');
      return NextResponse.json({ error: 'No active workspace - No orgId' }, { status: 400 });
    }

    const body = await request.json();
    console.log('Request body:', body);
    const { leadIds, listId, address } = body;
    console.log('leadIds:', leadIds);
    console.log('listId:', listId);
    console.log('address:', address);

    const { db } = await connectDB();

    // Get an active line to use for the API call
    console.log('Looking for active line with orgId:', orgId);
    const activeLine = await db
      .collection<ILine>(LineCollection)
      .findOne({ 
        workspaceId: orgId, 
        isActive: true, 
        provisioningStatus: 'active' 
      });

    console.log('Active line found:', activeLine ? 'Yes' : 'No');
    if (activeLine) {
      console.log('Active line serverUrl:', activeLine.serverUrl);
    }

    if (!activeLine) {
      console.log('ERROR: No active line found');
      return NextResponse.json({ 
        error: 'NO_ACTIVE_LINE',
        message: 'No active line found to check availability. Please create and activate a line in the Lines page first.',
        details: 'You need an active line with a server URL to check iMessage availability.'
      }, { status: 400 });
    }

    // Handle individual address checking (for Quick Send)
    if (address) {
      console.log('Checking individual address:', address);
      try {
        const encodedAddress = encodeURIComponent(address);
        const response = await fetch(
          `${activeLine.serverUrl}/api/v1/handle/availability/imessage?address=${encodedAddress}&guid=9UV08w2e`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          return NextResponse.json({ 
            success: false, 
            available: false, 
            error: `HTTP ${response.status}` 
          });
        }

        const data = await response.json();
        console.log(`API response for ${address}:`, data);
        
        // Parse the API response structure: { status: 200, message: 'Success', data: { available: true } }
        let available = false;
        if (data.data && typeof data.data.available === 'boolean') {
          available = data.data.available;
        } else if (typeof data.available === 'boolean') {
          available = data.available;
        } else if (typeof data === 'boolean') {
          available = data;
        }
        
        console.log(`Parsed availability for ${address}:`, available);
        
        return NextResponse.json({
          success: true,
          available,
          address,
        });
      } catch (error) {
        console.error(`Error checking address ${address}:`, error);
        return NextResponse.json({ 
          success: false, 
          available: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    // Build query for leads to check
    let query: Record<string, unknown> = { workspaceId: orgId };
    console.log('Building query with workspaceId:', orgId);
    
    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      console.log('Using leadIds query, count:', leadIds.length);
      query._id = { $in: leadIds.map((id: string) => new ObjectId(id)) };
    } else if (listId) {
      console.log('Using listId query:', listId);
      query.listId = new ObjectId(listId);
    } else {
      console.log('Using all leads query');
      // If no specific leads or list, get all leads
      query = { workspaceId: orgId };
    }

    console.log('Final query:', JSON.stringify(query));

    // Get leads to check
    const leads = await db
      .collection<ILead>(LeadCollection)
      .find(query)
      .toArray();

    console.log('Found leads to check:', leads.length);

    if (leads.length === 0) {
      console.log('ERROR: No leads found to check');
      return NextResponse.json({ 
        error: 'No leads found to check' 
      }, { status: 404 });
    }

    // Update all leads to checking status
    const leadIdsToUpdate = leads.map(lead => lead._id!);
    await db.collection<ILead>(LeadCollection).updateMany(
      { _id: { $in: leadIdsToUpdate } },
      {
        $set: {
          availabilityStatus: 'checking',
          updatedAt: new Date(),
        },
      }
    );

    // Check availability for each lead
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const lead of leads) {
      const result = await checkSingleAvailability(lead, activeLine.serverUrl, activeLine.guid);
      
      const updateData: Record<string, unknown> = {
        availabilityCheckedAt: new Date(),
        updatedAt: new Date(),
      };

      if (result.success) {
        updateData.availabilityStatus = result.available ? 'available' : 'unavailable';
        successCount++;
      } else {
        updateData.availabilityStatus = 'error';
        errorCount++;
      }

      await db.collection<ILead>(LeadCollection).updateOne(
        { _id: lead._id },
        { $set: updateData }
      );

      results.push({
        leadId: lead._id,
        available: result.available,
        status: updateData.availabilityStatus,
        error: result.error,
      });
    }

    return NextResponse.json({
      success: true,
      checked: leads.length,
      successful: successCount,
      errors: errorCount,
      results,
    });
  } catch (error) {
    console.error('Error checking bulk availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
