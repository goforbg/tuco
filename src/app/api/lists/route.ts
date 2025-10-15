import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IList, ListCollection } from '@/models/List';
import { ILead, LeadCollection } from '@/models/Lead';
import { ObjectId } from 'mongodb';

export async function GET() {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { db } = await connectDB();

    const lists = await db.collection<IList>(ListCollection)
      .find({ workspaceId: orgId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ lists });

  } catch (error) {
    console.error('Error fetching lists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { name, description } = await request.json();

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }

    const { db } = await connectDB();

    // Check if list name already exists for this user
    const existingList = await db.collection<IList>(ListCollection)
      .findOne({ workspaceId: orgId, name });

    if (existingList) {
      return NextResponse.json({ error: 'List name already exists' }, { status: 400 });
    }

    const newList: IList = {
      name,
      description,
      workspaceId: orgId,
      createdByUserId: userId,
      leadCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection<IList>(ListCollection).insertOne(newList);

    return NextResponse.json({ 
      message: 'List created successfully',
      list: { ...newList, _id: result.insertedId }
    });

  } catch (error) {
    console.error('Error creating list:', error);
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

    const { listId, deleteLeads = false } = await request.json();

    if (!listId) {
      return NextResponse.json({ error: 'List ID is required' }, { status: 400 });
    }

    const { db } = await connectDB();

    // Verify the list exists and belongs to the workspace
    const list = await db.collection<IList>(ListCollection)
      .findOne({ _id: new ObjectId(listId), workspaceId: orgId });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // If deleteLeads is true, delete all leads in the list first
    if (deleteLeads) {
      const deleteResult = await db.collection<ILead>(LeadCollection)
        .deleteMany({ listId: new ObjectId(listId), workspaceId: orgId });
      
      console.log(`Deleted ${deleteResult.deletedCount} leads from list ${listId}`);
    } else {
      // Move leads to "Unassigned" (no listId) instead of deleting them
      await db.collection<ILead>(LeadCollection)
        .updateMany(
          { listId: new ObjectId(listId), workspaceId: orgId },
          { 
            $unset: { listId: "" },
            $set: { updatedAt: new Date() }
          }
        );
    }

    // Delete the list
    const result = await db.collection<IList>(ListCollection)
      .deleteOne({ _id: new ObjectId(listId), workspaceId: orgId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'List deleted successfully',
      deletedLeads: deleteLeads ? 'all leads deleted' : 'leads moved to unassigned'
    });

  } catch (error) {
    console.error('Error deleting list:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
