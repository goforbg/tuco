import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { ILead, LeadCollection } from '@/models/Lead';
import { IList, ListCollection } from '@/models/List';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { leads, listId, source = 'csv' } = await request.json();

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json({ error: 'Invalid leads data' }, { status: 400 });
    }

    if (!listId) {
      return NextResponse.json({ error: 'List ID is required' }, { status: 400 });
    }

    const { db } = await connectDB();

    // Validate listId (must belong to same workspace)
    const list = await db.collection<IList>(ListCollection)
      .findOne({ _id: new ObjectId(listId), workspaceId: orgId });
    
    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Process and validate leads
    const processedLeads = leads.map((lead: Record<string, unknown>) => {
      // Validate required fields - firstName is required, either email OR phone is required
      if (!lead.firstName || (!lead.email && !lead.phone)) {
        throw new Error('Missing required fields: firstName and either email or phone');
      }

      // Extract custom fields (any field not in standard fields) and merge if provided
      const standardFields = ['firstName', 'lastName', 'email', 'phone', 'companyName', 'jobTitle', 'linkedinUrl', 'notes', 'customFields'];
      const customFields: { [key: string]: string | number | boolean } = {};

      // Merge pre-parsed customFields if sent by client
      if (lead.customFields && typeof lead.customFields === 'object') {
        Object.entries(lead.customFields as Record<string, string | number | boolean>).forEach(([k, v]) => {
          if (v !== undefined && v !== '') customFields[k] = v as string | number | boolean;
        });
      }

      Object.keys(lead).forEach(key => {
        if (!standardFields.includes(key) && lead[key] !== undefined && lead[key] !== '') {
          customFields[key] = lead[key] as string | number | boolean;
        }
      });

      return {
        firstName: String(lead.firstName),
        lastName: lead.lastName ? String(lead.lastName) : undefined,
        email: lead.email ? String(lead.email) : undefined,
        phone: lead.phone ? String(lead.phone) : undefined,
        companyName: lead.companyName ? String(lead.companyName) : undefined,
        jobTitle: lead.jobTitle ? String(lead.jobTitle) : undefined,
        linkedinUrl: lead.linkedinUrl ? String(lead.linkedinUrl) : undefined,
        notes: lead.notes ? String(lead.notes) : undefined,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        availabilityStatus: 'checking' as const, // Default to checking status
        listId: new ObjectId(listId),
        workspaceId: orgId,
        contactOwnerId: (lead as Record<string, unknown>).contactOwnerId ? String((lead as Record<string, unknown>).contactOwnerId) : userId,
        createdByUserId: userId,
        source,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    // Check for duplicates within the same list
    // We'll check for duplicates based on:
    // 1. Email + Phone combination (if both exist)
    // 2. Email only (if only email exists)
    // 3. Phone only (if only phone exists)
    
    const duplicateCheckQueries: Array<{
      email?: string | { $exists: boolean };
      phone?: string | { $exists: boolean };
    }> = [];
    
    // Build queries for different duplicate scenarios
    processedLeads.forEach(lead => {
      if (lead.email && lead.phone) {
        // Both email and phone exist - check for exact match
        duplicateCheckQueries.push({
          email: lead.email.toLowerCase(),
          phone: lead.phone
        });
      } else if (lead.email && !lead.phone) {
        // Only email exists - check for email match
        duplicateCheckQueries.push({
          email: lead.email.toLowerCase(),
          phone: { $exists: false }
        });
      } else if (!lead.email && lead.phone) {
        // Only phone exists - check for phone match
        duplicateCheckQueries.push({
          phone: lead.phone,
          email: { $exists: false }
        });
      }
    });

    const existingLeads = duplicateCheckQueries.length > 0 ? await db.collection<ILead>(LeadCollection)
      .find({
        workspaceId: orgId,
        listId: new ObjectId(listId), // Check only within the same list
        $or: duplicateCheckQueries
      })
      .project({ email: 1, phone: 1 })
      .toArray() : [];

    // Create sets for different types of duplicates
    const existingEmailPhoneCombos = new Set<string>();
    const existingEmailsOnly = new Set<string>();
    const existingPhonesOnly = new Set<string>();

    existingLeads.forEach(lead => {
      if (lead.email && lead.phone) {
        existingEmailPhoneCombos.add(`${lead.email.toLowerCase()}:${lead.phone}`);
      } else if (lead.email && !lead.phone) {
        existingEmailsOnly.add(lead.email.toLowerCase());
      } else if (!lead.email && lead.phone) {
        existingPhonesOnly.add(lead.phone);
      }
    });

    // Filter out duplicates
    const newLeads = processedLeads.filter(lead => {
      if (lead.email && lead.phone) {
        // Both email and phone exist - check for exact match
        return !existingEmailPhoneCombos.has(`${lead.email.toLowerCase()}:${lead.phone}`);
      } else if (lead.email && !lead.phone) {
        // Only email exists - check for email match
        return !existingEmailsOnly.has(lead.email.toLowerCase());
      } else if (!lead.email && lead.phone) {
        // Only phone exists - check for phone match
        return !existingPhonesOnly.has(lead.phone);
      }
      // If neither email nor phone exists, this shouldn't happen due to validation above
      return true;
    });

    const duplicateCount = processedLeads.length - newLeads.length;

    // Insert only new leads
    let insertedCount = 0;
    let leadIds: string[] = [];
    
    if (newLeads.length > 0) {
      const result = await db.collection<ILead>(LeadCollection).insertMany(newLeads);
      insertedCount = result.insertedCount;
      leadIds = Object.values(result.insertedIds).map(id => id.toString());
    }

    // Update list lead count
    if (insertedCount > 0) {
      await db.collection<IList>(ListCollection).updateOne(
        { _id: new ObjectId(listId), workspaceId: orgId },
        { 
          $inc: { leadCount: insertedCount },
          $set: { updatedAt: new Date() }
        }
      );
    }

    // Trigger bulk availability checking for new leads (async, don't wait)
    if (leadIds.length > 0) {
      console.log(`🔄 TRIGGERING AVAILABILITY CHECK for ${leadIds.length} leads`);
      console.log(`📋 Lead IDs: ${leadIds.slice(0, 5).join(', ')}${leadIds.length > 5 ? '...' : ''}`);
      
      // Start bulk availability checking in background with proper auth
      fetch(`${process.env.NEXT_PUBLIC_APP_URL|| 'https://app.tuco.ai'}/api/leads/check-availability`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await auth().then(auth => auth.getToken())}`,
          'X-User-ID': userId,
          'X-Org-ID': orgId,
        },
        body: JSON.stringify({ leadIds }),
      }).then(async (response) => {
        console.log(`📡 Availability check API response: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ Error triggering bulk availability check:', errorData);
          
          // If it's a NO_AVAILABILITY_SERVER error, update all leads to no_active_line status
          if (errorData.error === 'NO_AVAILABILITY_SERVER') {
            console.log('⚠️ Availability checking skipped: No availability server configured');
            
            // Update all leads to no_active_line status
            await db.collection<ILead>(LeadCollection).updateMany(
              { _id: { $in: leadIds.map(id => new ObjectId(id)) } },
              {
                $set: {
                  availabilityStatus: 'no_active_line' as const,
                  updatedAt: new Date(),
                },
              }
            );
            console.log(`✅ Updated ${leadIds.length} leads to 'no_active_line' status`);
          }
        } else {
          const result = await response.json();
          console.log('✅ Availability check triggered successfully:', result);
        }
      }).catch(error => {
        console.error('❌ Network error triggering bulk availability check:', error);
      });
    } else {
      console.log('ℹ️ No leads to check availability for');
    }

    return NextResponse.json({ 
      message: 'Leads saved successfully', 
      savedCount: insertedCount,
      duplicateCount, // Duplicates found within the same list
      totalProcessed: processedLeads.length,
      listId: listId || null
    });

  } catch (error) {
    console.error('Error saving leads:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' }, 
      { status: 500 }
    );
  }
}

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
    const listId = searchParams.get('listId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const { db } = await connectDB();

    // Build query
    const query: Record<string, string | ObjectId> = { workspaceId: orgId };
    if (listId) {
      query.listId = new ObjectId(listId);
    }

    // Get leads with pagination
    const leads = await db.collection<ILead>(LeadCollection)
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count
    const totalCount = await db.collection<ILead>(LeadCollection).countDocuments(query);

    // Get lists for this user
    const lists = await db.collection<IList>(ListCollection)
      .find({ workspaceId: orgId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ 
      leads,
      lists,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { _id, update } = await request.json();
    if (!_id || !update || typeof update !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { db } = await connectDB();
    // If contactOwnerId is being set, default validate format (optional: validate membership via Clerk)
    if (update.contactOwnerId) {
      update.contactOwnerId = String(update.contactOwnerId);
    }

    const result = await db.collection<ILead>(LeadCollection).updateOne(
      { _id: new ObjectId(_id), workspaceId: orgId },
      { $set: { ...update, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Lead updated' });
  } catch (error) {
    console.error('Error updating lead:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }

    const objectIds = ids.map((id: string) => new ObjectId(id));
    const { db } = await connectDB();

    // Find impacted leads to decrement counts per list
    const leadsToDelete = await db.collection<ILead>(LeadCollection)
      .find({ _id: { $in: objectIds }, workspaceId: orgId })
      .project({ listId: 1 })
      .toArray();

    const result = await db.collection<ILead>(LeadCollection).deleteMany({
      _id: { $in: objectIds },
      workspaceId: orgId,
    });

    // Decrement list counts
    const listDecrements: Record<string, number> = {};
    for (const lead of leadsToDelete) {
      if (lead.listId) {
        const key = String(lead.listId);
        listDecrements[key] = (listDecrements[key] || 0) + 1;
      }
    }
    for (const [listId, dec] of Object.entries(listDecrements)) {
      await db.collection<IList>(ListCollection).updateOne(
        { _id: new ObjectId(listId), workspaceId: orgId },
        { $inc: { leadCount: -dec }, $set: { updatedAt: new Date() } }
      );
    }

    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting leads:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
