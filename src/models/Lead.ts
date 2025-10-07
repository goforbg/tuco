import { ObjectId } from 'mongodb';

export interface ILead {
  _id?: ObjectId;
  
  // Basic Information (Required)
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // Made mandatory as per requirements
  
  // Alternate Contact Information
  altPhone1?: string;
  altPhone2?: string;
  altPhone3?: string;
  altEmail1?: string;
  altEmail2?: string;
  altEmail3?: string;
  
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
  
  // iMessage Availability Status
  availabilityStatus?: 'checking' | 'available' | 'unavailable' | 'error' | 'no_active_line';
  availabilityCheckedAt?: Date;
  
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
