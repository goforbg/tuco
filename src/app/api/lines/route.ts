import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { ILine, LineCollection } from '@/models/Line';
import { MessageCollection } from '@/models/Message';
import { ObjectId } from 'mongodb';
import { sendTelegramNotification } from '@/lib/telegram';

// Generate a random GUID for new lines
function generateGuid(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// GET /api/lines - list lines for current org
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

    const lines = await db
      .collection<ILine>(LineCollection)
      .find({ workspaceId: orgId })
      .sort({ createdAt: -1 })
      .toArray();

    // Get today's date for usage calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get message usage for each line
    const linesWithUsage = await Promise.all(
      lines.map(async (line) => {
        // Count messages sent today from this line
        const messageUsage = await db
          .collection(MessageCollection)
          .aggregate([
            {
              $match: {
                fromLineId: line._id,
                workspaceId: orgId,
                createdAt: {
                  $gte: today,
                  $lt: tomorrow,
                },
                status: { $in: ['sent', 'delivered'] },
              },
            },
            {
              $group: {
                _id: null,
                totalMessages: { $sum: 1 },
                uniqueConversations: {
                  $addToSet: {
                    $cond: [
                      { $ifNull: ['$recipientEmail', false] },
                      '$recipientEmail',
                      '$recipientPhone',
                    ],
                  },
                },
              },
            },
          ])
          .toArray();

        const usage = messageUsage[0] || {
          totalMessages: 0,
          uniqueConversations: [],
        };

        // Strip critical server-only properties before sending to frontend
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { serverUrl, guid, ...safeLine } = line;
        
        return {
          ...safeLine,
          usage: {
            date: today.toISOString().split('T')[0],
            newConversationsCount: usage.uniqueConversations.length,
            totalMessagesCount: usage.totalMessages,
          },
        };
      })
    );

    return NextResponse.json({ lines: linesWithUsage });
  } catch (error) {
    console.error('Error fetching lines:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/lines - purchase/create a new line for org
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const body = await request.json();
    const { phone, email, firstName, lastName, profileImageUrl, lineType } = body as Partial<ILine>;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { db } = await connectDB();

    // TODO: Enforce plan free lines vs paid lines - update organizations doc accordingly (not a new collection)
    // For now, we insert the line and expect a separate process to adjust org document (webhook or same request in future).

    const now = new Date();
    const provisioningEta = new Date(now.getTime() + 36 * 60 * 60 * 1000); // midpoint of 24-48h
    const etaDateString = provisioningEta.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-').toUpperCase();
    const newLine: ILine = {
      workspaceId: orgId,
      createdByUserId: userId,
      serverUrl: `https://line-${Date.now()}.internal.tuco.ai`, // Internal server URL
      guid: generateGuid(), // Generate unique GUID for this line
      phone: phone || 'PENDING',
      email: email || `pending+${Date.now()}@assigned.local`,
      firstName,
      lastName,
      profileImageUrl,
      isActive: false,
      provisioningStatus: 'provisioning',
      provisioningSubmittedAt: now,
      estimatedReadyAt: etaDateString,
      lineType: lineType || 'purchased', // default to purchased if not specified
      dailyNewConversationsLimit: 20,
      dailyTotalMessagesLimit: 150,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection<ILine>(LineCollection).insertOne(newLine);

    // Update organizations collection to reflect free vs purchased lines usage
    const organizations = db.collection('organizations');
    const org = await organizations.findOne({ clerkOrgId: orgId });

    // Get current org counters
    const freeLinesIncluded = (org?.freeLinesIncluded as number) || 0;
    const totalLinesIncluded = (org?.totalLinesIncluded as number) || 0;
    const currentLinesCount = (org?.currentLinesCount as number) || 0;

    // Determine if this line should count against free allocation
    const isFreeLine = lineType === 'byon' && currentLinesCount < freeLinesIncluded;
    const isPaidLine = !isFreeLine;

    const inc: Record<string, number> = { currentLinesCount: 1 };
    if (isPaidLine) {
      inc.purchasedLinesCount = 1;
    }

    await organizations.updateOne(
      { clerkOrgId: orgId },
      {
        $inc: inc,
        $set: { 
          updatedAt: new Date(),
          freeLinesIncluded: freeLinesIncluded || 0,
          totalLinesIncluded: totalLinesIncluded || 0,
        },
      }
    );

    // Send Telegram notification
    const notificationMessage = `🚀 <b>New Line Created!</b>

<b>Name:</b> ${firstName} ${lastName}
<b>Type:</b> ${lineType || 'purchased'}
<b>Workspace:</b> ${orgId}
<b>Created by:</b> ${userId}
<b>ETA:</b> ${etaDateString}

<b>Line ID:</b> <code>${result.insertedId}</code>`;

    // Send notification asynchronously (don't wait for it)
    sendTelegramNotification(notificationMessage).catch(error => {
      console.error('Failed to send Telegram notification:', error);
    });

    return NextResponse.json({ _id: result.insertedId, ...newLine }, { status: 201 });
  } catch (error) {
    console.error('Error creating line:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/lines - update profile or status of a line (by _id in body)
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
    const { _id, firstName, lastName, profileImageUrl, isActive, provisioningStatus } = body as Partial<ILine> & { _id?: string };
    if (!_id) {
      return NextResponse.json({ error: 'Missing _id' }, { status: 400 });
    }

    const { db } = await connectDB();

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof firstName === 'string') update.firstName = firstName;
    if (typeof lastName === 'string') update.lastName = lastName;
    if (typeof profileImageUrl === 'string' || profileImageUrl === null) update.profileImageUrl = profileImageUrl || undefined;
    if (typeof isActive === 'boolean') update.isActive = isActive;
    if (provisioningStatus === 'active' || provisioningStatus === 'failed' || provisioningStatus === 'provisioning') {
      update.provisioningStatus = provisioningStatus;
      if (provisioningStatus === 'active') {
        update.isActive = true;
      }
    }

    const updateRes = await db
      .collection<ILine>(LineCollection)
      .updateOne(
        { _id: new ObjectId(_id), workspaceId: orgId },
        { $set: update }
      );

    if (updateRes.matchedCount === 0) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 });
    }

    const updatedLine = await db
      .collection<ILine>(LineCollection)
      .findOne({ _id: new ObjectId(_id), workspaceId: orgId });

    if (!updatedLine) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 });
    }

    // Strip critical server-only properties before sending to frontend
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { serverUrl, guid, ...safeLine } = updatedLine;
    // serverUrl and guid are intentionally excluded for security

    return NextResponse.json({ line: safeLine });
  } catch (error) {
    console.error('Error updating line:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/lines?id=<lineId> - remove a line and adjust org counters
export async function DELETE(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const { db } = await connectDB();
    const linesCol = db.collection<ILine>(LineCollection);

    const line = await linesCol.findOne({ _id: new ObjectId(id), workspaceId: orgId });
    if (!line) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 });
    }

    await linesCol.deleteOne({ _id: new ObjectId(id), workspaceId: orgId });

    // decrement organization counters
    const organizations = db.collection('organizations');
    const dec: Record<string, number> = { currentLinesCount: -1 };
    if (line.lineType === 'purchased') {
      dec.purchasedLinesCount = -1;
    }
    await organizations.updateOne(
      { clerkOrgId: orgId },
      { $inc: dec, $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting line:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


