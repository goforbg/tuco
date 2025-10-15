import { ObjectId } from 'mongodb';

export interface ILine {
  _id?: ObjectId;

  // Tenant / Ownership
  workspaceId: string; // Clerk Organization (org) ID
  createdByUserId: string; // Clerk user ID who created/purchased the line

  // Critical server-only properties (NEVER expose to frontend)
  serverUrl: string; // Internal server URL for this line
  guid: string; // Unique identifier for the line server

  // Line Profile (purchased identity)
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;

  // Status & Limits
  isActive: boolean; // Active/inactive toggle for the line
  provisioningStatus: 'provisioning' | 'active' | 'failed';
  provisioningSubmittedAt?: Date;
  estimatedReadyAt?: string; // Approx ETA for going active (DD-MMM-YYYY format)
  lineType: 'byon' | 'purchased'; // whether user brought their own number or purchased new
  dailyNewConversationsLimit: number; // default 20
  dailyTotalMessagesLimit: number; // default 150


  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export const LineCollection = 'lines';


