import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { auth } from '@clerk/nextjs/server';
import { IMessage, MessageCollection } from '@/models/Message';
import { IActivity, ActivityCollection } from '@/models/Activity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = orgId || userId;
    const { conversationId, message } = await req.json();

    if (!conversationId || !message) {
      return NextResponse.json({ error: 'Missing conversationId or message' }, { status: 400 });
    }

    const { db } = await connectDB();

    // Find the conversation to get recipient details
    const existingMessages = await db.collection(MessageCollection)
      .find({ 
        workspaceId,
        $or: [
          { recipientPhone: conversationId },
          { recipientEmail: conversationId }
        ]
      })
      .limit(1)
      .toArray();

    if (existingMessages.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const existingMessage = existingMessages[0];
    const isPhone = !!existingMessage.recipientPhone;
    
    // Find an available line for sending
    const availableLine = await db.collection('lines')
      .findOne({ 
        workspaceId,
        status: 'active',
        ...(isPhone ? { phone: { $exists: true } } : { email: { $exists: true } })
      });

    if (!availableLine) {
      return NextResponse.json({ 
        error: `No available ${isPhone ? 'phone' : 'email'} line found` 
      }, { status: 400 });
    }

    // Create the reply message
    const replyMessage: IMessage = {
      message,
      messageType: isPhone ? 'imessage' : 'email',
      recipientPhone: isPhone ? conversationId : undefined,
      recipientEmail: !isPhone ? conversationId : undefined,
      recipientName: existingMessage.recipientName,
      fromLineId: availableLine._id,
      fromLinePhone: availableLine.phone,
      fromLineEmail: availableLine.email,
      workspaceId,
      createdByUserId: userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Insert the message
    const result = await db.collection(MessageCollection).insertOne(replyMessage);
    const messageId = result.insertedId;

    // Create activity log
    const activity: IActivity = {
      type: 'message_sent',
      action: 'send_message',
      description: `Sent reply to ${conversationId}: ${message.substring(0, 100)}...`,
      status: 'success',
      messageId,
      messageContent: message,
      messageType: replyMessage.messageType,
      recipientPhone: replyMessage.recipientPhone,
      recipientEmail: replyMessage.recipientEmail,
      fromLineId: availableLine._id,
      fromLinePhone: availableLine.phone,
      fromLineEmail: availableLine.email,
      workspaceId,
      createdByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection(ActivityCollection).insertOne(activity);

    // Here you would integrate with your message sending service
    // For now, we'll just mark it as sent
    await db.collection(MessageCollection).updateOne(
      { _id: messageId },
      { 
        $set: { 
          status: 'sent',
          sentAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    console.log('Reply message created and sent', { messageId, conversationId });

    return NextResponse.json({ 
      success: true, 
      messageId: messageId.toString() 
    });
  } catch (error) {
    console.error('Error sending reply:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
