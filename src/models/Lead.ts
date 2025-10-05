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
  
  // Metadata
  userId: string; // Clerk user ID
  source: 'csv' | 'google_sheets' | 'salesforce' | 'hubspot' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

export const LeadCollection = 'leads';
