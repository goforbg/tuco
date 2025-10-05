import { ObjectId } from 'mongodb';

export interface IList {
  _id?: ObjectId;
  
  // Basic Information
  name: string;
  description?: string;
  
  // Tenant / Ownership
  workspaceId: string; // Clerk Organization ID (workspace)
  createdByUserId: string; // Clerk user ID who created the list

  // Metadata
  leadCount: number; // Cached count for performance
  createdAt: Date;
  updatedAt: Date;
}

export const ListCollection = 'lists';
