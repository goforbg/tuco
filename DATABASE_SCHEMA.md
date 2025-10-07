# Database Schema Documentation

## Overview
This document outlines the database schema for the leads management system, including support for custom fields, external integrations, and lead organization.

## Collections
### 0. Organizations (existing, updated counters for lines)

Adds counters to track line entitlements and usage. These live in the existing `organizations` collection and are updated when lines are purchased/deleted.

```typescript
// organizations (partial)
{
  clerkOrgId: string,
  // ...existing fields...
  freeLinesIncluded: number,      // how many lines are included by the current plan
  freeLinesUsed: number,          // how many free lines are currently used
  totalLinesPurchased: number,    // additional paid lines purchased
  totalLinesCount: number,        // total = freeLinesUsed + totalLinesPurchased
}
```

Notes:
- Values above will later be reconciled with Stripe entitlements (todo).

### 1. Lines Collection (`lines`)

```typescript
interface ILine {
  _id?: ObjectId;

  // Tenant / Ownership
  workspaceId: string; // Clerk Organization (org) ID
  createdByUserId: string; // Clerk user ID who created/purchased the line
  createdUserId?: string; // Optional Clerk user ID assigned to this line

  // Line Profile
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;

  // Provisioning & Billing
  isActive: boolean; // true only when provisioningStatus === 'active'
  provisioningStatus: 'provisioning' | 'active' | 'failed';
  provisioningSubmittedAt?: Date;
  estimatedReadyAt?: Date; // 24–48 hours typical
  billingType?: 'free' | 'paid';

  // Limits & Usage
  dailyNewConversationsLimit: number; // default 20
  dailyTotalMessagesLimit: number;    // default 150
  usage?: {
    date: string; // YYYY-MM-DD
    newConversationsCount: number;
    totalMessagesCount: number;
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes to consider:
```javascript
{ workspaceId: 1, createdAt: -1 }
{ provisioningStatus: 1, workspaceId: 1 }
```

### 1. Leads Collection (`leads`)

**Purpose**: Stores individual lead/contact information with support for custom fields and integration tracking.

```typescript
interface ILead {
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
```

### 2. Lists Collection (`lists`)

**Purpose**: Organizes leads into named lists for better management and segmentation.

```typescript
interface IList {
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
```

### 3. Integration Configs Collection (`integration_configs`)

**Purpose**: Stores user's integration credentials and settings securely.

```typescript
interface IIntegrationConfig {
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
```

### 4. Import Jobs Collection (`import_jobs`)

**Purpose**: Tracks import operations for monitoring and error handling.

```typescript
interface IImportJob {
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
```

## Field Requirements

### Mandatory Fields for CSV Template
- `firstName` (string)
- `lastName` (string) 
- `email` (string)
- `phone` (string) - **MANDATORY as per requirements**

### Optional Standard Fields
- `companyName` (string)
- `jobTitle` (string)
- `linkedinUrl` (string)
- `notes` (string)

### Custom Fields
- Any additional columns in CSV will be stored as custom fields
- Custom fields support: string, number, boolean, date types
- Field names are preserved as-is from CSV headers

## Integration Requirements

### HubSpot Integration
- Must store `hubspotRecordId` for each imported lead
- Supports bidirectional sync
- Maps HubSpot contact properties to local fields

### Salesforce Integration  
- Must store `salesforceRecordId` for each imported lead
- Supports Lead and Contact objects
- Maps Salesforce fields to local fields

### Google Sheets Integration
- Must store `googleSheetsRowId` for tracking
- Supports real-time sync
- Handles sheet permissions and sharing

## Indexes

### Leads Collection
```javascript
// User-based queries
{ userId: 1, createdAt: -1 }

// List-based queries  
{ listId: 1, createdAt: -1 }

// Email uniqueness per user
{ userId: 1, email: 1 }

// Integration lookups
{ "integrationIds.hubspotRecordId": 1 }
{ "integrationIds.salesforceRecordId": 1 }
```

### Lists Collection
```javascript
// User-based queries
{ userId: 1, createdAt: -1 }

// Name uniqueness per user
{ userId: 1, name: 1 }
```

### Integration Configs Collection
```javascript
// User-based queries
{ userId: 1, type: 1 }

// Active integrations
{ userId: 1, isActive: 1 }
```

## Data Validation Rules

1. **Email Format**: Must be valid email format
2. **Phone Format**: Must be valid phone number (flexible format)
3. **Required Fields**: firstName, lastName, email, phone are mandatory
4. **Custom Fields**: Limited to 50 custom fields per lead
5. **List Names**: Must be unique per user
6. **Integration IDs**: Must be unique within their respective platforms

## Security Considerations

1. **Encryption**: Integration credentials are encrypted at rest
2. **Access Control**: All queries filtered by userId
3. **Rate Limiting**: API calls to external services are rate-limited
4. **Data Retention**: Old import jobs are archived after 90 days
5. **Audit Trail**: All data modifications are logged

## Performance Optimizations

1. **Caching**: Lead counts per list are cached
2. **Pagination**: Large result sets are paginated
3. **Indexes**: Strategic indexes for common query patterns
4. **Bulk Operations**: Batch processing for large imports
5. **Background Jobs**: Heavy operations run asynchronously

## Implementation Status

### ✅ Completed Features

1. **Database Models**
   - ✅ Lead model with custom fields and integration IDs
   - ✅ List model for lead organization
   - ✅ IntegrationConfig model for storing credentials
   - ✅ ImportJob model for tracking import operations

2. **CSV Functionality**
   - ✅ CSV template export with mandatory fields (firstName, lastName, email, phone)
   - ✅ CSV import with field mapping and validation
   - ✅ Custom fields support (any additional columns)
   - ✅ List association during import

3. **External Integrations**
   - ✅ HubSpot integration with real OAuth 2.0 flow and hubspotRecordId storage
   - ✅ Salesforce integration with real OAuth 2.0 flow and salesforceRecordId storage
   - ✅ Google Sheets integration with googleSheetsRowId storage
   - ✅ Background import jobs with progress tracking
   - ✅ Continuous sync capabilities with configurable intervals
   - ✅ Comprehensive error handling and retry logic
   - ✅ Rate limiting and API quota management

4. **Lead Management**
   - ✅ Display existing leads with pagination
   - ✅ Search and filter functionality
   - ✅ List creation and management
   - ✅ Source tracking (csv, hubspot, salesforce, google_sheets, manual)

5. **API Endpoints**
   - ✅ `/api/leads` - CRUD operations for leads
   - ✅ `/api/leads/export-template` - CSV template download
   - ✅ `/api/lists` - List management
   - ✅ `/api/integrations/hubspot` - HubSpot OAuth and import
   - ✅ `/api/integrations/hubspot/callback` - HubSpot OAuth callback
   - ✅ `/api/integrations/salesforce` - Salesforce OAuth and import
   - ✅ `/api/integrations/salesforce/callback` - Salesforce OAuth callback
   - ✅ `/api/integrations/google-sheets` - Google Sheets integration
   - ✅ `/api/sync` - Background sync management and status

### 🔧 Technical Implementation

- **Frontend**: React with TypeScript, Tailwind CSS
- **Backend**: Next.js API routes with MongoDB
- **Authentication**: Clerk integration
- **Data Validation**: Server-side validation with proper error handling
- **UI/UX**: Modern B2B SaaS design with clean interface
- **OAuth Integration**: Real OAuth 2.0 flows for HubSpot and Salesforce
- **Background Processing**: Asynchronous import jobs with progress tracking
- **Rate Limiting**: Proper API rate limiting and retry logic
- **Error Handling**: Comprehensive error handling with detailed logging

### 📋 CSV Template Format

```csv
firstName,lastName,email,phone,companyName,jobTitle,linkedinUrl,notes,customField1,customField2
John,Doe,john.doe@example.com,+1-555-0123,Acme Corp,Software Engineer,https://linkedin.com/in/johndoe,Interested in our product,Value1,Value2
Jane,Smith,jane.smith@example.com,+1-555-0124,Tech Solutions,Product Manager,https://linkedin.com/in/janesmith,Referred by John,Value3,Value4
```

**Mandatory Fields**: firstName, lastName, email, phone
**Optional Fields**: companyName, jobTitle, linkedinUrl, notes
**Custom Fields**: Any additional columns will be stored as custom fields

---

*Last Updated: December 2024*
*Version: 1.0 - Production Ready*
