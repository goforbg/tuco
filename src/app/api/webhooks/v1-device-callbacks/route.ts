import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { IActivity, ActivityCollection } from '@/models/Activity';
import { IMessage, MessageCollection } from '@/models/Message';
import { LineCollection } from '@/models/Line';
import { ObjectId } from 'mongodb';
import { Db } from 'mongodb';

export const dynamic = 'force-dynamic';

// Type definitions for BlueBubbles webhook events
interface BlueBubblesWebhookData {
  type: string;
  data: string | {
    guid?: string;
    isFromMe?: boolean;
    text?: string;
    attributedBody?: {
      string?: string;
    };
    chats?: Array<{
      guid: string;
      displayName?: string;
      participants?: Array<{
        handle?: string;
        address?: string;
      }>;
    }>;
    error?: string;
    errorCode?: string;
    status?: string;
    messageId?: string;
    deliveryStatus?: 'delivered' | 'failed' | 'pending';
    // Add more fields as needed based on BlueBubbles documentation
  };
}

// Helper function to extract message text from various BlueBubbles message formats
function extractMessageText(data: BlueBubblesWebhookData['data']): string {
  // Handle string data type
  if (typeof data === 'string') {
    return data;
  }
  
  // Handle object data type
  if (typeof data === 'object' && data !== null) {
    // Try different text fields that BlueBubbles might use
    if (data.text) {
      return data.text;
    }
    
    if (data.attributedBody?.string) {
      return data.attributedBody.string;
    }
    
    // Handle other possible text formats
    if ('text' in data) {
      return String(data.text);
    }
  }
  
  return '';
}

// Helper function to extract phone number from chat participants
function extractPhoneNumber(data: BlueBubblesWebhookData['data']): string | null {
  // Handle string data type
  if (typeof data === 'string') {
    return null;
  }
  
  // Handle object data type
  if (typeof data === 'object' && data !== null) {
    const chats = data.chats;
    if (!chats || chats.length === 0) return null;
    
    const chat = chats[0];
    if (!chat.participants || chat.participants.length === 0) return null;
    
    // Find the participant that's not "me" (assuming the first non-me participant is the recipient)
    const otherParticipant = chat.participants.find(p => p.handle || p.address);
    return otherParticipant?.handle || otherParticipant?.address || null;
  }
  
  return null;
}

// Helper function to create activity log entry
async function createActivityLog(
  db: Db,
  type: IActivity['type'],
  action: IActivity['action'],
  description: string,
  status: IActivity['status'],
  workspaceId: string,
  createdByUserId: string,
  additionalData: Partial<IActivity> = {}
) {
  const activity: IActivity = {
    type,
    action,
    description,
    status,
    workspaceId,
    createdByUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...additionalData
  };

  console.log('🔵 CREATING ACTIVITY LOG', { 
    type, 
    action, 
    status, 
    description: description.substring(0, 100) + '...',
    workspaceId,
    createdByUserId,
    additionalDataKeys: Object.keys(additionalData)
  });

  await db.collection(ActivityCollection).insertOne(activity);
  console.log('🔵 ACTIVITY LOG CREATED SUCCESSFULLY', { 
    type, 
    action, 
    status, 
    activityId: activity._id
  });
}

// Helper function to find existing message by external ID
async function findMessageByExternalId(db: Db, externalMessageId: string): Promise<IMessage | null> {
  console.log('🔵 SEARCHING FOR MESSAGE BY EXTERNAL ID', { externalMessageId });
  const message = await db.collection<IMessage>(MessageCollection).findOne({ externalMessageId });
  console.log('🔵 MESSAGE SEARCH RESULT', { 
    externalMessageId, 
    found: !!message,
    messageId: message?._id,
    currentStatus: message?.status
  });
  return message;
}

// Helper function to update message status
async function updateMessageStatus(
  db: Db,
  messageId: ObjectId,
  status: IMessage['status'],
  additionalData: Partial<IMessage> = {}
) {
  const updateData = {
    status,
    updatedAt: new Date(),
    ...additionalData
  };

  console.log('🔵 UPDATING MESSAGE STATUS', { 
    messageId, 
    newStatus: status,
    additionalDataKeys: Object.keys(additionalData)
  });

  const result = await db.collection(MessageCollection).updateOne(
    { _id: messageId },
    { $set: updateData }
  );
  
  console.log('🔵 MESSAGE STATUS UPDATE RESULT', { 
    messageId, 
    status, 
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `bb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('🔵 BLUEBUBBLES WEBHOOK START', { 
    requestId,
    timestamp: new Date().toISOString(),
    userAgent: req.headers.get('user-agent'),
    contentType: req.headers.get('content-type'),
    contentLength: req.headers.get('content-length')
  });

  try {
    // Get raw body for debugging
    const rawBody = await req.text();
    console.log('🔵 RAW REQUEST BODY', { 
      requestId,
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 500) + (rawBody.length > 500 ? '...' : '')
    });

    // Parse the request body
    let data: BlueBubblesWebhookData;
    try {
      data = JSON.parse(rawBody);
      console.log('🔵 PARSED WEBHOOK DATA', { 
        requestId,
        type: data.type,
        hasData: !!data.data,
        dataKeys: data.data ? Object.keys(data.data) : [],
        fullData: JSON.stringify(data, null, 2)
      });
    } catch (parseError) {
      console.error('🔵 JSON PARSE ERROR', { 
        requestId,
        error: parseError instanceof Error ? parseError.message : 'unknown',
        rawBody: rawBody.substring(0, 1000)
      });
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!data.type || !data.data) {
      console.error('🔵 INVALID WEBHOOK DATA', { 
        requestId,
        hasType: !!data.type,
        hasData: !!data.data,
        receivedData: data
      });
      return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
    }

    console.log('🔵 CONNECTING TO DATABASE', { requestId });
    const { db } = await connectDB();
    console.log('🔵 DATABASE CONNECTED', { requestId });

    // Handle different event types
    console.log('🔵 PROCESSING EVENT TYPE', { requestId, eventType: data.type });
    
    switch (data.type) {
      case 'new-message':
        console.log('🔵 HANDLING NEW MESSAGE', { requestId });
        await handleNewMessage(db, data, requestId);
        break;
      
      case 'message-delivered':
        console.log('🔵 HANDLING MESSAGE DELIVERED', { requestId });
        await handleMessageDelivered(db, data, requestId);
        break;
      
      case 'message-failed':
        console.log('🔵 HANDLING MESSAGE FAILED', { requestId });
        await handleMessageFailed(db, data, requestId);
        break;
      
      case 'server-error':
        console.log('🔵 HANDLING SERVER ERROR', { requestId });
        await handleServerError(db, data, requestId);
        break;
      
      case 'new-server':
        console.log('🔵 HANDLING NEW SERVER', { requestId });
        await handleNewServer(db, data, requestId, req);
        break;
      
      default:
        console.log('🔵 UNHANDLED EVENT TYPE', { 
          requestId, 
          eventType: data.type,
          data: JSON.stringify(data, null, 2)
        });
        // Still return 200 to acknowledge receipt
        break;
    }

    const duration = Date.now() - startTime;
    console.log('🔵 BLUEBUBBLES WEBHOOK COMPLETE', { 
      requestId,
      eventType: data.type, 
      durationMs: duration,
      success: true
    });

    return NextResponse.json({ 
      ok: true, 
      requestId,
      processedAt: new Date().toISOString(),
      eventType: data.type
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'unknown';
    const stack = error instanceof Error ? error.stack : undefined;
    
    console.error('🔵 BLUEBUBBLES WEBHOOK ERROR', { 
      requestId,
      error: message,
      stack,
      durationMs: duration,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json({ 
      error: 'Internal server error', 
      requestId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Handle new incoming messages (replies)
async function handleNewMessage(db: Db, data: BlueBubblesWebhookData, requestId: string) {
  console.log('🔵 HANDLING NEW MESSAGE', { requestId });
  
  const messageData = data.data;
  
  // Handle string data type (not a message)
  if (typeof messageData === 'string') {
    console.log('🔵 IGNORING STRING DATA FOR NEW MESSAGE', { requestId, data: messageData });
    return;
  }
  
  console.log('🔵 MESSAGE DATA ANALYSIS', { 
    requestId,
    isFromMe: messageData.isFromMe,
    guid: messageData.guid,
    hasText: !!messageData.text,
    hasAttributedBody: !!messageData.attributedBody,
    chatsCount: messageData.chats?.length || 0,
    chats: messageData.chats,
    fullMessageData: JSON.stringify(messageData, null, 2)
  });
  
  // Ignore messages that we sent
  if (messageData.isFromMe) {
    console.log('🔵 IGNORING OUTGOING MESSAGE', { requestId, isFromMe: messageData.isFromMe });
    return;
  }

  const messageText = extractMessageText(messageData);
  console.log('🔵 EXTRACTED MESSAGE TEXT', { 
    requestId,
    messageText,
    textLength: messageText.length,
    hasText: !!messageText
  });
  
  if (!messageText) {
    console.log('🔵 NO MESSAGE TEXT FOUND', { requestId });
    return;
  }

  const phoneNumber = extractPhoneNumber(messageData);
  console.log('🔵 EXTRACTED PHONE NUMBER', { 
    requestId,
    phoneNumber,
    chats: messageData.chats
  });
  
  if (!phoneNumber) {
    console.log('🔵 NO PHONE NUMBER FOUND', { requestId });
    return;
  }

  // Find the original message this is replying to
  // We'll need to implement a way to match replies to original messages
  // For now, we'll create a new message entry for the reply
  
  // Extract workspace and user info from the request context
  // In a real implementation, you might need to determine this from the phone number
  // or store it in a mapping table
  const workspaceId = 'default-workspace'; // This should be determined from the phone number
  const createdByUserId = 'system'; // This should be determined from the phone number

  console.log('🔵 CREATING REPLY MESSAGE', { 
    requestId,
    messageText: messageText.substring(0, 100) + '...',
    phoneNumber,
    workspaceId,
    createdByUserId
  });

  // Create a new message entry for the reply
  const replyMessage: IMessage = {
    message: messageText,
    messageType: 'imessage',
    recipientPhone: phoneNumber,
    fromLineId: new ObjectId(), // This should be determined from the phone number
    fromLinePhone: phoneNumber, // This should be the sending line's phone
    workspaceId,
    createdByUserId,
    status: 'delivered',
    externalMessageId: messageData.guid || `reply-${Date.now()}`,
    sentAt: new Date(),
    deliveredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  console.log('🔵 INSERTING REPLY MESSAGE TO DATABASE', { 
    requestId,
    messageId: replyMessage._id,
    externalMessageId: replyMessage.externalMessageId
  });

  await db.collection(MessageCollection).insertOne(replyMessage);
  console.log('🔵 REPLY MESSAGE CREATED SUCCESSFULLY', { 
    requestId,
    messageId: replyMessage._id,
    insertedId: replyMessage._id
  });

  // Create activity log
  console.log('🔵 CREATING ACTIVITY LOG', { requestId });
  await createActivityLog(
    db,
    'message_sent',
    'send_message',
    `Received reply from ${phoneNumber}: ${messageText.substring(0, 100)}...`,
    'success',
    workspaceId,
    createdByUserId,
    {
      messageId: replyMessage._id,
      messageContent: messageText,
      messageType: 'imessage',
      recipientPhone: phoneNumber,
      externalMessageId: messageData.guid
    }
  );
  
  console.log('🔵 NEW MESSAGE HANDLING COMPLETE', { requestId });
}

// Handle message delivery confirmation
async function handleMessageDelivered(db: Db, data: BlueBubblesWebhookData, requestId: string) {
  console.log('🔵 HANDLING MESSAGE DELIVERED', { requestId });
  
  const messageData = data.data;
  
  // Handle string data type (not a message)
  if (typeof messageData === 'string') {
    console.log('🔵 IGNORING STRING DATA FOR MESSAGE DELIVERED', { requestId, data: messageData });
    return;
  }
  
  const externalMessageId = messageData.messageId || messageData.guid;
  
  console.log('🔵 DELIVERY DATA ANALYSIS', { 
    requestId,
    externalMessageId,
    messageId: messageData.messageId,
    guid: messageData.guid,
    status: messageData.status,
    deliveryStatus: messageData.deliveryStatus,
    fullData: JSON.stringify(messageData, null, 2)
  });
  
  if (!externalMessageId) {
    console.log('🔵 NO EXTERNAL MESSAGE ID FOUND', { requestId });
    return;
  }

  console.log('🔵 SEARCHING FOR ORIGINAL MESSAGE', { requestId, externalMessageId });
  // Find the original message
  const originalMessage = await findMessageByExternalId(db, externalMessageId);
  if (!originalMessage) {
    console.log('🔵 ORIGINAL MESSAGE NOT FOUND', { requestId, externalMessageId });
    return;
  }

  console.log('🔵 ORIGINAL MESSAGE FOUND', { 
    requestId,
    messageId: originalMessage._id,
    currentStatus: originalMessage.status,
    recipient: originalMessage.recipientPhone || originalMessage.recipientEmail
  });

  // Update message status
  console.log('🔵 UPDATING MESSAGE STATUS TO DELIVERED', { requestId });
  if (originalMessage._id) {
    await updateMessageStatus(db, originalMessage._id, 'delivered', {
      deliveredAt: new Date()
    });
  }

  // Create activity log
  console.log('🔵 CREATING DELIVERY ACTIVITY LOG', { requestId });
  await createActivityLog(
    db,
    'message_sent',
    'send_message',
    `Message delivered to ${originalMessage.recipientPhone || originalMessage.recipientEmail}`,
    'success',
    originalMessage.workspaceId,
    originalMessage.createdByUserId,
    {
      messageId: originalMessage._id,
      messageContent: originalMessage.message,
      messageType: originalMessage.messageType,
      recipientPhone: originalMessage.recipientPhone,
      recipientEmail: originalMessage.recipientEmail,
      externalMessageId
    }
  );
  
  console.log('🔵 MESSAGE DELIVERED HANDLING COMPLETE', { requestId });
}

// Handle message delivery failure
async function handleMessageFailed(db: Db, data: BlueBubblesWebhookData, requestId: string) {
  console.log('🔵 HANDLING MESSAGE FAILED', { requestId });
  
  const messageData = data.data;
  
  // Handle string data type (not a message)
  if (typeof messageData === 'string') {
    console.log('🔵 IGNORING STRING DATA FOR MESSAGE FAILED', { requestId, data: messageData });
    return;
  }
  
  const externalMessageId = messageData.messageId || messageData.guid;
  const errorMessage = messageData.error || 'Unknown error';
  const errorCode = messageData.errorCode || 'UNKNOWN_ERROR';
  
  console.log('🔵 FAILURE DATA ANALYSIS', { 
    requestId,
    externalMessageId,
    errorMessage,
    errorCode,
    messageId: messageData.messageId,
    guid: messageData.guid,
    status: messageData.status,
    fullData: JSON.stringify(messageData, null, 2)
  });
  
  if (!externalMessageId) {
    console.log('🔵 NO EXTERNAL MESSAGE ID FOUND', { requestId });
    return;
  }

  console.log('🔵 SEARCHING FOR ORIGINAL MESSAGE', { requestId, externalMessageId });
  // Find the original message
  const originalMessage = await findMessageByExternalId(db, externalMessageId);
  if (!originalMessage) {
    console.log('🔵 ORIGINAL MESSAGE NOT FOUND', { requestId, externalMessageId });
    return;
  }

  console.log('🔵 ORIGINAL MESSAGE FOUND', { 
    requestId,
    messageId: originalMessage._id,
    currentStatus: originalMessage.status,
    recipient: originalMessage.recipientPhone || originalMessage.recipientEmail
  });

  // Update message status
  console.log('🔵 UPDATING MESSAGE STATUS TO FAILED', { requestId, errorMessage });
  if (originalMessage._id) {
    await updateMessageStatus(db, originalMessage._id, 'failed', {
      errorMessage
    });
  }

  // Create activity log
  console.log('🔵 CREATING FAILURE ACTIVITY LOG', { requestId });
  await createActivityLog(
    db,
    'message_failed',
    'send_message',
    `Message failed to deliver to ${originalMessage.recipientPhone || originalMessage.recipientEmail}: ${errorMessage}`,
    'error',
    originalMessage.workspaceId,
    originalMessage.createdByUserId,
    {
      messageId: originalMessage._id,
      messageContent: originalMessage.message,
      messageType: originalMessage.messageType,
      recipientPhone: originalMessage.recipientPhone,
      recipientEmail: originalMessage.recipientEmail,
      externalMessageId,
      errorCode,
      errorMessage
    }
  );
  
  console.log('🔵 MESSAGE FAILED HANDLING COMPLETE', { requestId });
}

// Handle server errors
async function handleServerError(db: Db, data: BlueBubblesWebhookData, requestId: string) {
  console.log('🔵 HANDLING SERVER ERROR', { requestId });
  
  const messageData = data.data;
  
  // Handle string data type
  if (typeof messageData === 'string') {
    console.log('🔵 STRING DATA FOR SERVER ERROR', { requestId, data: messageData });
    const errorMessage = messageData || 'BlueBubbles server error';
    const errorCode = 'SERVER_ERROR';
    
    console.log('🔵 SERVER ERROR DATA ANALYSIS', { 
      requestId,
      errorMessage,
      errorCode,
      fullData: messageData
    });
    
    // Create activity log for server error
    console.log('🔵 CREATING SERVER ERROR ACTIVITY LOG', { requestId });
    await createActivityLog(
      db,
      'line_error',
      'send_message',
      `BlueBubbles server error: ${errorMessage}`,
      'error',
      'system', // This should be determined from context
      'system',
      {
        errorCode,
        errorMessage,
        apiEndpoint: 'bluebubbles-server'
      }
    );
    
    console.log('🔵 SERVER ERROR HANDLING COMPLETE', { requestId });
    return;
  }
  
  // Handle object data type
  const errorMessage = messageData.error || 'BlueBubbles server error';
  const errorCode = messageData.errorCode || 'SERVER_ERROR';
  
  console.log('🔵 SERVER ERROR DATA ANALYSIS', { 
    requestId,
    errorMessage,
    errorCode,
    status: messageData.status,
    fullData: JSON.stringify(messageData, null, 2)
  });
  
  // Create activity log for server error
  console.log('🔵 CREATING SERVER ERROR ACTIVITY LOG', { requestId });
  await createActivityLog(
    db,
    'line_error',
    'send_message',
    `BlueBubbles server error: ${errorMessage}`,
    'error',
    'system', // This should be determined from context
    'system',
    {
      errorCode,
      errorMessage,
      apiEndpoint: 'bluebubbles-server'
    }
  );
  
  console.log('🔵 SERVER ERROR HANDLING COMPLETE', { requestId });
}

// Handle new server URL
async function handleNewServer(db: Db, data: BlueBubblesWebhookData, requestId: string, req: NextRequest) {
  console.log('🔵 HANDLING NEW SERVER', { requestId });
  
  const serverUrl = data.data;
  
  // Handle string data type
  if (typeof serverUrl !== 'string') {
    console.log('🔵 INVALID SERVER URL DATA TYPE', { requestId, dataType: typeof serverUrl, data: serverUrl });
    return;
  }
  
  // Get email from query parameters
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  
  // Decode URL-encoded email (e.g., bg%40foxwellpierce.com -> bg@foxwellpierce.com)
  const decodedEmail = email ? decodeURIComponent(email) : null;
  
  console.log('🔵 NEW SERVER DATA ANALYSIS', { 
    requestId,
    serverUrl,
    email,
    decodedEmail,
    hasEmail: !!decodedEmail
  });
  
  if (!decodedEmail) {
    console.log('🔵 NO EMAIL PROVIDED IN QUERY PARAMS', { requestId });
    return;
  }
  
  // Find the line by email
  console.log('🔵 SEARCHING FOR LINE BY EMAIL', { requestId, email: decodedEmail });
  const line = await db.collection(LineCollection).findOne({ email: decodedEmail });
  
  if (!line) {
    console.log('🔵 LINE NOT FOUND FOR EMAIL', { requestId, email: decodedEmail });
    return;
  }
  
  console.log('🔵 LINE FOUND', { 
    requestId,
    lineId: line._id,
    currentServerUrl: line.serverUrl,
    newServerUrl: serverUrl
  });
  
  // Update the line's serverUrl
  console.log('🔵 UPDATING LINE SERVER URL', { requestId, lineId: line._id });
  const updateResult = await db.collection(LineCollection).updateOne(
    { _id: line._id },
    { 
      $set: { 
        serverUrl: serverUrl,
        updatedAt: new Date()
      }
    }
  );
  
  console.log('🔵 LINE UPDATE RESULT', { 
    requestId,
    lineId: line._id,
    matchedCount: updateResult.matchedCount,
    modifiedCount: updateResult.modifiedCount
  });
  
  // Create activity log
  console.log('🔵 CREATING NEW SERVER ACTIVITY LOG', { requestId });
  await createActivityLog(
    db,
    'message_sent',
    'send_message',
    `Updated server URL for line ${decodedEmail}: ${serverUrl}`,
    'success',
    line.workspaceId,
    line.createdByUserId,
    {
      fromLineId: line._id,
      fromLineEmail: line.email,
      apiEndpoint: 'bluebubbles-server',
      apiResponse: { newServerUrl: serverUrl }
    }
  );
  
  console.log('🔵 NEW SERVER HANDLING COMPLETE', { requestId });
}
