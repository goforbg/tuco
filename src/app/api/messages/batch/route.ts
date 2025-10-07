import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createBatchMessages } from '@/lib/messageSender';

// POST /api/messages/batch - create multiple messages in a batch/sequence
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
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ 
        error: 'messages array is required and must not be empty' 
      }, { status: 400 });
    }

    // Validate each message in the batch
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg.message || !msg.messageType || !msg.fromLineId) {
        return NextResponse.json({ 
          error: `Message ${i + 1} is missing required fields: message, messageType, fromLineId` 
        }, { status: 400 });
      }
      
      if (!['email', 'sms', 'imessage'].includes(msg.messageType)) {
        return NextResponse.json({ 
          error: `Message ${i + 1} has invalid messageType. Must be email, sms, or imessage` 
        }, { status: 400 });
      }

      if (!msg.recipientEmail && !msg.recipientPhone) {
        return NextResponse.json({ 
          error: `Message ${i + 1} must have either recipientEmail or recipientPhone` 
        }, { status: 400 });
      }

      // Validate scheduledDate if provided
      if (msg.scheduledDate) {
        const parsedDate = new Date(msg.scheduledDate);
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json({ 
            error: `Message ${i + 1} has invalid scheduledDate format` 
          }, { status: 400 });
        }
      }
    }

    // Create the batch messages
    const result = await createBatchMessages(messages, orgId, userId);

    if (!result.success) {
      return NextResponse.json({ 
        error: result.errors?.join(', ') || 'Failed to create batch messages' 
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      messageIds: result.messageIds,
      created: result.messageIds?.length || 0,
      errors: result.errors?.length || 0,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating batch messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
