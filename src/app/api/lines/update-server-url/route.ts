import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { ILine, LineCollection } from '@/models/Line';
import { ObjectId } from 'mongodb';

// PUT /api/lines/update-server-url - update serverUrl for a line (for testing)
export async function PUT(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const body = await request.json();
    const { lineId, serverUrl } = body;

    if (!lineId || !serverUrl) {
      return NextResponse.json({ 
        error: 'lineId and serverUrl are required' 
      }, { status: 400 });
    }

    // Validate serverUrl format
    try {
      new URL(serverUrl);
    } catch {
      return NextResponse.json({ 
        error: 'Invalid serverUrl format' 
      }, { status: 400 });
    }

    const { db } = await connectDB();

    // Verify the line exists and belongs to the workspace
    const line = await db
      .collection<ILine>(LineCollection)
      .findOne({ _id: new ObjectId(lineId), workspaceId: orgId });

    if (!line) {
      return NextResponse.json({ error: 'Line not found or access denied' }, { status: 404 });
    }

    // Update the serverUrl
    const updateResult = await db
      .collection<ILine>(LineCollection)
      .updateOne(
        { _id: new ObjectId(lineId), workspaceId: orgId },
        { 
          $set: { 
            serverUrl,
            updatedAt: new Date(),
          } 
        }
      );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'ServerUrl updated successfully' 
    });
  } catch (error) {
    console.error('Error updating serverUrl:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
