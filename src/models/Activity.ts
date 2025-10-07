import { ObjectId } from 'mongodb';

export interface IActivity {
  _id?: ObjectId;

  // Activity type and details
  type: 'message_sent' | 'message_failed' | 'line_error' | 'api_error';
  action: 'send_message' | 'schedule_message' | 'batch_send';
  description: string;
  
  // Message details (if applicable)
  messageId?: ObjectId; // Reference to the Message
  messageContent?: string; // Snapshot of message content
  messageType?: 'email' | 'sms' | 'imessage';
  
  // Recipient information
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  
  // Sender information
  fromLineId?: ObjectId; // Reference to the Line used
  fromLinePhone?: string;
  fromLineEmail?: string;
  
  // Lead reference (if applicable)
  leadId?: ObjectId;
  
  // API details
  externalMessageId?: string; // ID from external service
  apiEndpoint?: string; // The API endpoint that was called
  apiResponse?: Record<string, unknown>; // Raw API response for debugging
  
  // Status and error details
  status: 'success' | 'error' | 'warning';
  errorCode?: string;
  errorMessage?: string;
  
  // Scheduling details
  scheduledDate?: Date;
  batchId?: string;
  
  // Tenant / Ownership
  workspaceId: string; // Clerk Organization ID (workspace)
  createdByUserId: string; // Clerk user ID who initiated the action
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export const ActivityCollection = 'activities';
