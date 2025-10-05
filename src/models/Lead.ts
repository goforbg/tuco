import { ObjectId } from 'mongodb';

export interface ILead {
  _id?: ObjectId;
  
  // Basic Information (Required)
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // Made mandatory as per requirements
  
  // Optional Standard Fields
  companyName?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  notes?: string;
  
  // Custom Fields (Dynamic)
  customFields?: {
    [key: string]: string | number | boolean | Date;
  };
  
  // Integration Tracking
  integrationIds?: {
    hubspotRecordId?: string;
    salesforceRecordId?: string;
    googleSheetsRowId?: string;
  };
  
  // List Association
  listId?: ObjectId; // Reference to the list this lead belongs to
  
  // Tenant / Ownership
  workspaceId: string; // Clerk Organization ID (workspace)
  contactOwnerId?: string; // Clerk user ID of assignee/owner within workspace
  createdByUserId: string; // Clerk user ID who created the lead

  // Metadata
  source: 'csv' | 'google_sheets' | 'salesforce' | 'hubspot' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

export const LeadCollection = 'leads';
