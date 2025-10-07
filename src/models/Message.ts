import { ObjectId } from 'mongodb';

export interface IMessage {
  _id?: ObjectId;

  // Message content
  message: string; // The actual message body
  messageType: 'email' | 'sms' | 'imessage'; // Type of message sent
  
  // Recipient information
  recipientEmail?: string; // Apple email address for email/iMessage
  recipientPhone?: string; // Phone number for SMS/iMessage
  recipientName?: string; // Optional recipient name for reference
  
  // Sender information (from line)
  fromLineId: ObjectId; // Reference to the Line used to send the message
  fromLinePhone?: string; // Phone number of the sending line
  fromLineEmail?: string; // Email of the sending line
  
  // Lead reference (if sent to a lead)
  leadId?: ObjectId; // Reference to the Lead if this was sent to a lead
  
  // Tenant / Ownership
  workspaceId: string; // Clerk Organization ID (workspace)
  createdByUserId: string; // Clerk user ID who sent the message
  
  // Message status and metadata
  status: 'pending' | 'sent' | 'failed' | 'delivered' | 'scheduled';
  externalMessageId?: string; // ID from external service (serverUrl)
  errorMessage?: string; // Error details if status is 'failed'
  
  // Scheduling
  scheduledDate?: Date; // When the message should be sent (for future scheduling)
  batchId?: string; // ID for grouping messages in a sequence
  
  // Delivery tracking
  sentAt?: Date; // When the message was actually sent
  deliveredAt?: Date; // When the message was delivered (if available)
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export const MessageCollection = 'messages';
