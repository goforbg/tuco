import { NextRequest, NextResponse } from 'next/server';
import { processScheduledMessages } from '@/lib/messageSender';
import connectDB from '@/lib/mongodb';

// POST /api/messages/process-scheduled - process all scheduled messages that are due
export async function POST() {
  try {
    // This endpoint can be called by a cron job or scheduler
    const result = await processScheduledMessages();
    
    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      message: `Processed ${result.processed} messages with ${result.errors} errors`,
    });
  } catch (error) {
    console.error('Error processing scheduled messages:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// GET /api/messages/process-scheduled - get status of scheduled messages
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');
    
    // Get scheduled messages in the next X hours
    const now = new Date();
    const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
    
    const { db } = await connectDB();
    
    const scheduledMessages = await db
      .collection('messages')
      .find({
        status: 'scheduled',
        scheduledDate: { 
          $gte: now,
          $lte: futureTime 
        },
      })
      .sort({ scheduledDate: 1 })
      .toArray();

    return NextResponse.json({
      scheduledMessages: scheduledMessages.length,
      nextMessageAt: scheduledMessages[0]?.scheduledDate || null,
      messages: scheduledMessages.map(msg => ({
        id: msg._id,
        scheduledDate: msg.scheduledDate,
        message: msg.message.substring(0, 50) + '...',
        recipientName: msg.recipientName,
      })),
    });
  } catch (error) {
    console.error('Error getting scheduled messages status:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
