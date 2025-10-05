import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IList, ListCollection } from '@/models/List';

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
