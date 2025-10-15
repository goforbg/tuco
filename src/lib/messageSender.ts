import { IMessage, MessageCollection } from '@/models/Message';
import { ILine, LineCollection } from '@/models/Line';
import { IActivity, ActivityCollection } from '@/models/Activity';
import { ILead, LeadCollection } from '@/models/Lead';
import connectDB from './mongodb';
import { ObjectId } from 'mongodb';

export interface SendMessageRequest {
  message: string;
  messageType: 'email' | 'sms' | 'imessage';
  fromLineId: string;
  leadId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  scheduledDate?: Date;
  batchId?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  externalMessageId?: string;
  error?: string;
}

/**
 * Creates an activity record for tracking API calls and results
 */
async function createActivityRecord(
  activity: Omit<IActivity, '_id' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  try {
    const { db } = await connectDB();
    const now = new Date();
    
    const activityRecord: IActivity = {
      ...activity,
      createdAt: now,
      updatedAt: now,
    };
    
    await db.collection<IActivity>(ActivityCollection).insertOne(activityRecord);
  } catch (error) {
    console.error('Error creating activity record:', error);
    // Don't throw here to avoid breaking the main flow
  }
}

/**
 * Gets prioritized addresses for a lead based on availability status
 * For iMessage: tries phone first, then alt phones, then emails (sequential, not all at once)
 * For SMS: tries phone first, then alt phones
 * For Email: tries email first, then alt emails
 */
export async function getPrioritizedAddressesForLead(
  leadId: string,
  messageType: 'email' | 'sms' | 'imessage'
): Promise<{ addresses: string[]; primaryAddress?: string }> {
  try {
    const { db } = await connectDB();
    
    const lead = await db
      .collection<ILead>(LeadCollection)
      .findOne({ _id: new ObjectId(leadId) });
    
    if (!lead) {
      return { addresses: [] };
    }
    
    const addresses: string[] = [];
    
    // For iMessage: prioritize phones first (primary phone, then alt phones), then emails
    if (messageType === 'imessage') {
      // Primary phone first
      if (lead.phone) addresses.push(lead.phone);
      
      // Alt phones in order
      if (lead.altPhone1) addresses.push(lead.altPhone1);
      if (lead.altPhone2) addresses.push(lead.altPhone2);
      if (lead.altPhone3) addresses.push(lead.altPhone3);
      
      // Primary email
      if (lead.email) addresses.push(lead.email);
      
      // Alt emails in order
      if (lead.altEmail1) addresses.push(lead.altEmail1);
      if (lead.altEmail2) addresses.push(lead.altEmail2);
      if (lead.altEmail3) addresses.push(lead.altEmail3);
    }
    // For SMS: only phones
    else if (messageType === 'sms') {
      if (lead.phone) addresses.push(lead.phone);
      if (lead.altPhone1) addresses.push(lead.altPhone1);
      if (lead.altPhone2) addresses.push(lead.altPhone2);
      if (lead.altPhone3) addresses.push(lead.altPhone3);
    }
    // For Email: only emails
    else if (messageType === 'email') {
      if (lead.email) addresses.push(lead.email);
      if (lead.altEmail1) addresses.push(lead.altEmail1);
      if (lead.altEmail2) addresses.push(lead.altEmail2);
      if (lead.altEmail3) addresses.push(lead.altEmail3);
    }
    
    return {
      addresses,
      primaryAddress: addresses[0] // First address is the primary one
    };
  } catch (error) {
    console.error('Error getting prioritized addresses for lead:', error);
    return { addresses: [] };
  }
}

/**
 * Sends a message via the external messaging service
 */
export async function sendMessageViaAPI(
  message: string,
  addresses: string[],
  serverUrl: string,
  guid: string,
  context?: {
    workspaceId?: string;
    createdByUserId?: string;
    messageId?: ObjectId;
    recipientEmail?: string;
    recipientPhone?: string;
    recipientName?: string;
    fromLineId?: ObjectId;
    messageType?: string;
    batchId?: string;
    scheduledDate?: Date;
  }
): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
  const apiEndpoint = `${serverUrl}/api/v1/chat/new?password=${guid}`;
  
  // Try sending to addresses sequentially until one succeeds
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    console.log(`Attempting to send message to address ${i + 1}/${addresses.length}: ${address}`);
    
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addresses: [address], // Send to one address at a time
          message,
        }),
      });

      // const apiResponse = {
      //   status: response.status,
      //   statusText: response.statusText,
      //   headers: Object.fromEntries(response.headers.entries()),
      // };

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Failed to send to ${address}: HTTP ${response.status}: ${errorText}`);
        
        // If this is the last address, throw the error
        if (i === addresses.length - 1) {
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Otherwise, try the next address
        continue;
      }

      const data = await response.json();
      console.log(`Successfully sent message to ${address}`);
      
      // Create success activity record
      if (context?.workspaceId && context?.createdByUserId) {
        await createActivityRecord({
          type: 'message_sent',
          action: context.scheduledDate ? 'schedule_message' : 'send_message',
          description: `Message sent successfully to ${address}`,
          messageId: context.messageId,
          messageContent: message,
          messageType: context.messageType as 'email' | 'sms' | 'imessage',
          recipientEmail: context.recipientEmail,
          recipientPhone: context.recipientPhone,
          recipientName: context.recipientName,
          fromLineId: context.fromLineId,
          externalMessageId: data.id || data.messageId || data.externalId,
          apiEndpoint,
          apiResponse: { status: response.status, body: data },
          status: 'success',
          scheduledDate: context.scheduledDate,
          batchId: context.batchId,
          workspaceId: context.workspaceId,
          createdByUserId: context.createdByUserId,
        });
      }
      
      return {
        success: true,
        externalMessageId: data.id || data.messageId || data.externalId,
      };
    } catch (error) {
      console.warn(`Error sending to ${address}:`, error);
      
      // If this is the last address, create error activity record
      if (i === addresses.length - 1) {
        if (context?.workspaceId && context?.createdByUserId) {
          await createActivityRecord({
            type: 'api_error',
            action: context.scheduledDate ? 'schedule_message' : 'send_message',
            description: `Failed to send message to all addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
            messageId: context.messageId,
            messageContent: message,
            messageType: context.messageType as 'email' | 'sms' | 'imessage',
            recipientEmail: context.recipientEmail,
            recipientPhone: context.recipientPhone,
            recipientName: context.recipientName,
            fromLineId: context.fromLineId,
            apiEndpoint,
            status: 'error',
            errorCode: 'API_ERROR',
            errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
            scheduledDate: context.scheduledDate,
            batchId: context.batchId,
            workspaceId: context.workspaceId,
            createdByUserId: context.createdByUserId,
          });
        }
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
      // Otherwise, continue to next address
    }
  }
  
  // If we get here, all addresses failed
  return {
    success: false,
    error: 'All addresses failed',
  };
}

/**
 * Creates and stores a message in the database
 */
export async function createMessage(
  request: SendMessageRequest,
  workspaceId: string,
  createdByUserId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { db } = await connectDB();

    // Verify the line exists and belongs to the workspace
    const line = await db
      .collection<ILine>(LineCollection)
      .findOne({ _id: new ObjectId(request.fromLineId), workspaceId });

    if (!line) {
      // Create line error activity record
      await createActivityRecord({
        type: 'line_error',
        action: 'send_message',
        description: 'Line not found or access denied',
        status: 'error',
        errorCode: 'LINE_NOT_FOUND',
        errorMessage: 'Line not found or access denied',
        workspaceId,
        createdByUserId,
      });
      return { success: false, error: 'Line not found or access denied' };
    }

    if (!line.isActive || line.provisioningStatus !== 'active') {
      // Create line error activity record
      await createActivityRecord({
        type: 'line_error',
        action: 'send_message',
        description: 'Line is not active or ready for sending messages',
        status: 'error',
        errorCode: 'LINE_NOT_ACTIVE',
        errorMessage: 'Line is not active or ready for sending messages',
        fromLineId: new ObjectId(request.fromLineId),
        fromLinePhone: line.phone,
        fromLineEmail: line.email,
        workspaceId,
        createdByUserId,
      });
      return { 
        success: false, 
        error: 'Line is not active or ready for sending messages' 
      };
    }

    const now = new Date();
    const scheduledDate = request.scheduledDate;
    const shouldSendNow = !scheduledDate || scheduledDate <= now;
    
    const newMessage: IMessage = {
      message: request.message,
      messageType: request.messageType,
      recipientEmail: request.recipientEmail,
      recipientPhone: request.recipientPhone,
      recipientName: request.recipientName,
      fromLineId: new ObjectId(request.fromLineId),
      fromLinePhone: line.phone,
      fromLineEmail: line.email,
      leadId: request.leadId ? new ObjectId(request.leadId) : undefined,
      workspaceId,
      createdByUserId,
      status: shouldSendNow ? 'pending' : 'scheduled',
      scheduledDate,
      batchId: request.batchId,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection<IMessage>(MessageCollection).insertOne(newMessage);

    // If message should be sent now, attempt to send it
    if (shouldSendNow) {
      const sendResult = await processPendingMessage(result.insertedId);
      return {
        success: sendResult.success,
        messageId: result.insertedId.toString(),
        error: sendResult.error,
      };
    }

    return {
      success: true,
      messageId: result.insertedId.toString(),
    };
  } catch (error) {
    console.error('Error creating message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Processes a pending message by sending it via the external API
 */
export async function processPendingMessage(messageId: ObjectId): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await connectDB();

    const message = await db
      .collection<IMessage>(MessageCollection)
      .findOne({ _id: messageId });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    if (message.status !== 'pending') {
      return { success: false, error: 'Message is not in pending status' };
    }

    // Get the line to get the serverUrl
    const line = await db
      .collection<ILine>(LineCollection)
      .findOne({ _id: message.fromLineId });

    if (!line) {
      return { success: false, error: 'Line not found' };
    }

    // Prepare addresses for the API
    let addresses: string[] = [];
    
    // If we have a leadId, get prioritized addresses
    if (message.leadId) {
      const prioritizedResult = await getPrioritizedAddressesForLead(
        message.leadId.toString(),
        message.messageType
      );
      addresses = prioritizedResult.addresses;
    } else {
      // Fallback to manual addresses
      if (message.recipientPhone) {
        addresses.push(message.recipientPhone);
      }
      if (message.recipientEmail && message.messageType === 'email') {
        addresses.push(message.recipientEmail);
      }
    }

    if (addresses.length === 0) {
      return { success: false, error: 'No valid recipient addresses found' };
    }

    // Send the message via external API
    const sendResult = await sendMessageViaAPI(
      message.message, 
      addresses, 
      line.serverUrl,
      line.guid,
      {
        workspaceId: message.workspaceId,
        createdByUserId: message.createdByUserId,
        messageId: message._id!,
        recipientEmail: message.recipientEmail,
        recipientPhone: message.recipientPhone,
        recipientName: message.recipientName,
        fromLineId: message.fromLineId,
        messageType: message.messageType,
        batchId: message.batchId,
        scheduledDate: message.scheduledDate,
      }
    );

    if (sendResult.success) {
      // Update message status to sent
      await db.collection<IMessage>(MessageCollection).updateOne(
        { _id: messageId },
        {
          $set: {
            status: 'sent',
            externalMessageId: sendResult.externalMessageId,
            sentAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );
      return { success: true };
    } else {
      // Update message status to failed
      await db.collection<IMessage>(MessageCollection).updateOne(
        { _id: messageId },
        {
          $set: {
            status: 'failed',
            errorMessage: sendResult.error,
            updatedAt: new Date(),
          },
        }
      );
      return { success: false, error: sendResult.error };
    }
  } catch (error) {
    console.error('Error processing pending message:', error);
    
    // Update message status to failed
    try {
      const { db } = await connectDB();
      await db.collection<IMessage>(MessageCollection).updateOne(
        { _id: messageId },
        {
          $set: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date(),
          },
        }
      );
    } catch (updateError) {
      console.error('Error updating message status:', updateError);
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Processes all pending messages that are due to be sent
 */
export async function processScheduledMessages(): Promise<{ processed: number; errors: number }> {
  try {
    const { db } = await connectDB();
    
    const now = new Date();
    
    // Find all scheduled messages that are due to be sent
    const scheduledMessages = await db
      .collection<IMessage>(MessageCollection)
      .find({
        status: 'scheduled',
        scheduledDate: { $lte: now },
      })
      .toArray();

    let processed = 0;
    let errors = 0;

    for (const message of scheduledMessages) {
      // Update status to pending before processing
      await db.collection<IMessage>(MessageCollection).updateOne(
        { _id: message._id },
        {
          $set: {
            status: 'pending',
            updatedAt: new Date(),
          },
        }
      );

      // Process the message
      const result = await processPendingMessage(message._id!);
      
      if (result.success) {
        processed++;
      } else {
        errors++;
        console.error(`Failed to process scheduled message ${message._id}:`, result.error);
      }
    }

    return { processed, errors };
  } catch (error) {
    console.error('Error processing scheduled messages:', error);
    return { processed: 0, errors: 1 };
  }
}

/**
 * Creates a batch of messages for a sequence
 */
export async function createBatchMessages(
  messages: Omit<SendMessageRequest, 'batchId'>[],
  workspaceId: string,
  createdByUserId: string
): Promise<{ success: boolean; batchId?: string; messageIds?: string[]; errors?: string[] }> {
  try {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = [];
    const errors = [];

    for (const messageRequest of messages) {
      const result = await createMessage(
        { ...messageRequest, batchId },
        workspaceId,
        createdByUserId
      );
      
      if (result.success && result.messageId) {
        results.push(result.messageId);
      } else {
        errors.push(result.error || 'Unknown error');
      }
    }

    return {
      success: results.length > 0,
      batchId,
      messageIds: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('Error creating batch messages:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
    };
  }
}
