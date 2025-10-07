import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectDB from '@/lib/mongodb';
import { IMessage, MessageCollection } from '@/models/Message';
import { ILine, LineCollection } from '@/models/Line';
import { ILead, LeadCollection } from '@/models/Lead';
import { ObjectId } from 'mongodb';
import { createMessage, SendMessageRequest } from '@/lib/messageSender';

// GET /api/messages - list messages for current org with optional filters
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
    const leadId = searchParams.get('leadId');
    const lineId = searchParams.get('lineId');

    const { db } = await connectDB();

    // Build filter query
    const filter: Record<string, unknown> = { workspaceId: orgId };
    if (leadId) filter.leadId = new ObjectId(leadId);
    if (lineId) filter.fromLineId = new ObjectId(lineId);

    const skip = (page - 1) * limit;

    const messages = await db
      .collection<IMessage>(MessageCollection)
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count for pagination
    const totalCount = await db
      .collection<IMessage>(MessageCollection)
      .countDocuments(filter);

    // Populate line information
    const lineIds = [...new Set(messages.map(m => m.fromLineId))];
    const lines = await db
      .collection<ILine>(LineCollection)
      .find({ _id: { $in: lineIds } })
      .toArray();

    const lineMap = new Map(lines.map(line => [line._id!.toString(), line]));

    // Populate lead information if needed
    let leadMap = new Map();
    if (leadId || messages.some(m => m.leadId)) {
      const leadIds = [...new Set(messages.filter(m => m.leadId).map(m => m.leadId!))];
      const leads = await db
        .collection<ILead>(LeadCollection)
        .find({ _id: { $in: leadIds } })
        .toArray();
      
      leadMap = new Map(leads.map(lead => [lead._id!.toString(), lead]));
    }

    const enrichedMessages = messages.map(message => {
      const line = lineMap.get(message.fromLineId.toString());
      const lead = message.leadId ? leadMap.get(message.leadId.toString()) : null;

      return {
        ...message,
        fromLine: line ? {
          _id: line._id,
          firstName: line.firstName,
          lastName: line.lastName,
          phone: line.phone,
          email: line.email,
        } : null,
        recipient: lead ? {
          _id: lead._id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
        } : null,
      };
    });

    return NextResponse.json({
      messages: enrichedMessages,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/messages - send a new message
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
    const { 
      message, 
      messageType, 
      fromLineId, 
      leadId, 
      recipientEmail, 
      recipientPhone, 
      recipientName,
      scheduledDate,
      batchId
    } = body;

    // Validate required fields
    if (!message || !messageType || !fromLineId) {
      return NextResponse.json({ 
        error: 'Missing required fields: message, messageType, fromLineId' 
      }, { status: 400 });
    }

    if (!['email', 'sms', 'imessage'].includes(messageType)) {
      return NextResponse.json({ 
        error: 'Invalid messageType. Must be email, sms, or imessage' 
      }, { status: 400 });
    }

    if (!recipientEmail && !recipientPhone) {
      return NextResponse.json({ 
        error: 'Either recipientEmail or recipientPhone is required' 
      }, { status: 400 });
    }

    // Validate scheduledDate if provided
    let parsedScheduledDate: Date | undefined;
    if (scheduledDate) {
      parsedScheduledDate = new Date(scheduledDate);
      if (isNaN(parsedScheduledDate.getTime())) {
        return NextResponse.json({ 
          error: 'Invalid scheduledDate format' 
        }, { status: 400 });
      }
    }

    // Get lead information if leadId is provided
    let lead = null;
    if (leadId) {
      const { db } = await connectDB();
      lead = await db
        .collection<ILead>(LeadCollection)
        .findOne({ _id: new ObjectId(leadId), workspaceId: orgId });

      if (!lead) {
        return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 });
      }
    }

    // Create the message using the message sender service
    const messageRequest: SendMessageRequest = {
      message,
      messageType,
      fromLineId,
      leadId,
      recipientEmail: recipientEmail || lead?.email,
      recipientPhone: recipientPhone || lead?.phone,
      recipientName: recipientName || (lead ? `${lead.firstName} ${lead.lastName}` : undefined),
      scheduledDate: parsedScheduledDate,
      batchId,
    };

    const result = await createMessage(messageRequest, orgId, userId);

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to create message' 
      }, { status: 400 });
    }

    // Get the created message to return
    const { db } = await connectDB();
    const createdMessage = await db
      .collection<IMessage>(MessageCollection)
      .findOne({ _id: new ObjectId(result.messageId!) });

    return NextResponse.json({ 
      message: createdMessage,
      success: true 
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
