import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IActivity, ActivityCollection } from '@/models/Activity';

// GET /api/activities - list activities for current org with optional filters
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const filter = searchParams.get('filter'); // success, error, warning
    const type = searchParams.get('type'); // message_sent, message_failed, line_error, api_error

    const { db } = await connectDB();

    // Build filter query
    const filterQuery: Record<string, unknown> = { workspaceId: orgId };
    
    if (filter && filter !== 'all') {
      filterQuery.status = filter;
    }
    
    if (type && type !== 'all') {
      filterQuery.type = type;
    }

    const skip = (page - 1) * limit;

    const activities = await db
      .collection<IActivity>(ActivityCollection)
      .find(filterQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count for pagination
    const totalCount = await db
      .collection<IActivity>(ActivityCollection)
      .countDocuments(filterQuery);

    return NextResponse.json({
      activities,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
