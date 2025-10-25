import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { auth } from '@clerk/nextjs/server';
import { IMessage } from '@/models/Message';
import { Filter } from 'mongodb';

export const dynamic = 'force-dynamic';

interface Conversation {
  id: string;
  recipient: string;
  recipientName?: string;
  recipientType: 'email' | 'phone';
  messages: IMessage[];
  lastMessageAt: string;
  unreadCount: number;
  status: 'active' | 'archived';
}

export async function GET() {
  try {
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = orgId || userId;
    const { db } = await connectDB();

    // Get all messages for this workspace
    const filter: Filter<IMessage> = { 
      workspaceId,
      $or: [
        { recipientPhone: { $exists: true, $ne: undefined } },
        { recipientEmail: { $exists: true, $ne: undefined } }
      ]
    };
    
    const messages = await db.collection<IMessage>('messages')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // Group messages by recipient
    const conversationMap = new Map<string, Conversation>();

    for (const message of messages) {
      const recipient = message.recipientPhone || message.recipientEmail;
      const recipientType = message.recipientPhone ? 'phone' : 'email';
      
      if (!recipient) continue;

      if (!conversationMap.has(recipient)) {
        conversationMap.set(recipient, {
          id: recipient,
          recipient,
          recipientName: message.recipientName,
          recipientType,
          messages: [],
          lastMessageAt: message.createdAt.toISOString(),
          unreadCount: 0,
          status: 'active'
        });
      }

      const conversation = conversationMap.get(recipient)!;
      conversation.messages.push(message);
      
      // Update last message time
      if (new Date(message.createdAt) > new Date(conversation.lastMessageAt)) {
        conversation.lastMessageAt = message.createdAt.toISOString();
      }

      // Count unread messages (messages that are replies, not sent by us)
      if (!message.fromLinePhone && !message.fromLineEmail) {
        conversation.unreadCount++;
      }
    }

    // Convert to array and sort by last message time
    const conversations = Array.from(conversationMap.values())
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
