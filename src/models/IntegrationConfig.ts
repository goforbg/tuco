import { ObjectId } from 'mongodb';

export interface IIntegrationConfig {
  _id?: ObjectId;
  
  // Integration Type
  type: 'hubspot' | 'salesforce' | 'google_sheets';
  
  // Credentials (encrypted)
  credentials: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    accountId?: string;
    workspaceId?: string;
    // Add other platform-specific fields as needed
  };
  
  // Settings
  settings: {
    autoSync: boolean;
    syncInterval: number; // in minutes
    lastSyncAt?: Date;
    fieldMappings?: {
      [localField: string]: string; // Maps local fields to external fields
    };
  };
  
  // Status
  isActive: boolean;
  lastError?: string;
  
  // Metadata
  userId: string; // Clerk user ID
  createdAt: Date;
  updatedAt: Date;
}

export const IntegrationConfigCollection = 'integration_configs';
