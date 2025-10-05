import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { ILead, LeadCollection } from '@/models/Lead';
import { IList, ListCollection } from '@/models/List';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leads, listId, source = 'csv' } = await request.json();

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json({ error: 'Invalid leads data' }, { status: 400 });
    }

    const { db } = await connectDB();

    // Validate listId if provided
    if (listId) {
      const list = await db.collection<IList>(ListCollection)
        .findOne({ _id: new ObjectId(listId), userId });
      
      if (!list) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 });
      }
    }

    // Process and validate leads
    const processedLeads = leads.map((lead: Record<string, string | number | boolean>) => {
      // Validate required fields
      if (!lead.firstName || !lead.lastName || !lead.email || !lead.phone) {
        throw new Error('Missing required fields: firstName, lastName, email, phone');
      }

      // Extract custom fields (any field not in standard fields)
      const standardFields = ['firstName', 'lastName', 'email', 'phone', 'companyName', 'jobTitle', 'linkedinUrl', 'notes'];
      const customFields: { [key: string]: string | number | boolean } = {};
      
      Object.keys(lead).forEach(key => {
        if (!standardFields.includes(key) && lead[key] !== undefined && lead[key] !== '') {
          customFields[key] = lead[key];
        }
      });

      return {
        firstName: String(lead.firstName),
        lastName: String(lead.lastName),
        email: String(lead.email),
        phone: String(lead.phone),
        companyName: lead.companyName ? String(lead.companyName) : undefined,
        jobTitle: lead.jobTitle ? String(lead.jobTitle) : undefined,
        linkedinUrl: lead.linkedinUrl ? String(lead.linkedinUrl) : undefined,
        notes: lead.notes ? String(lead.notes) : undefined,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        listId: listId ? new ObjectId(listId) : undefined,
        userId,
        source,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    // Insert leads into database
    const result = await db.collection<ILead>(LeadCollection).insertMany(processedLeads);

    // Update list lead count if listId provided
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
      message: 'Leads saved successfully', 
      count: result.insertedCount 
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
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('listId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const { db } = await connectDB();

    // Build query
    const query: Record<string, string | ObjectId> = { userId };
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
      .find({ userId })
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
