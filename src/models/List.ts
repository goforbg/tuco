import { ObjectId } from 'mongodb';

export interface IList {
  _id?: ObjectId;
  
  // Basic Information
  name: string;
  description?: string;
  
  // Metadata
  userId: string; // Clerk user ID
  leadCount: number; // Cached count for performance
  createdAt: Date;
  updatedAt: Date;
}

export const ListCollection = 'lists';
