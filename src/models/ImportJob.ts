import { ObjectId } from 'mongodb';

export interface IImportJob {
  _id?: ObjectId;
  
  // Job Information
  type: 'csv' | 'google_sheets' | 'salesforce' | 'hubspot';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  
  // Progress Tracking
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  
  // Results
  errors?: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  
  // File Information (for CSV imports)
  fileName?: string;
  fileSize?: number;
  
  // Integration Information
  integrationConfigId?: ObjectId;
  
  // List Association
  listId?: ObjectId;
  
  // Metadata
  userId: string; // Clerk user ID
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export const ImportJobCollection = 'import_jobs';
