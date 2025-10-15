# Campaigns Feature Documentation

## Overview
A comprehensive campaigns feature has been implemented to allow users to send bulk messages to their leads at scale. The feature includes a multi-step UI workflow and mock API endpoints.

## Recent Updates
- ✅ **Google Sheets Integration**: Now accepts full Google Sheets URLs instead of just spreadsheet IDs
  - Users can paste the entire URL: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`
  - Backend automatically extracts the spreadsheet ID from the URL
  - Backwards compatible: still works with just the spreadsheet ID

## What's Been Implemented

### 1. Navigation Integration
- **File**: `src/components/Sidebar.tsx`
- Added "Campaigns" navigation item to the sidebar with a Send icon
- Positioned between "Leads" and "Lines" in the navigation menu

### 2. Campaigns Page (Multi-Step Flow)
- **File**: `src/app/campaigns/page.tsx`
- Implements a 4-step wizard similar to the lead import flow

#### Step 1: Select List
- Choose from existing lists or create a new one
- If creating a new list, redirects to `/leads/import` page
- Displays list name and lead count for each existing list
- Visual selection with checkmarks and hover effects

#### Step 2: Compose Message
- Rich textarea for message composition
- Character counter
- Support for variable substitution: `{firstName}`, `{lastName}`, `{companyName}`, `{email}`
- Informational panel showing available variables

#### Step 3: Choose Senders
- Select one or multiple active lines to send messages from
- Only shows lines with `isActive: true` and `provisioningStatus: 'active'`
- Visual cards with checkmarks for multi-selection
- Message distribution note (messages will be distributed evenly across selected lines)

#### Step 4: Review & Launch
- **Campaign Overview**: Shows target list, number of senders, and message preview
- **Advanced Settings**:
  - **Scheduling**: Send now vs. schedule for later (date/time picker)
  - **Message Gap**: Configurable delay between messages (in seconds, default: 30s)
  - **Randomize Order**: Toggle to send messages in random order
- **Estimated Completion Time**: Calculates based on lead count and message gap
- Launch/Schedule button with loading state

### 3. Mock API Endpoints
- **File**: `src/app/api/campaigns/route.ts`
- Comprehensive TODO comments for future implementation

#### POST /api/campaigns
- Creates and launches/schedules a campaign
- Request body validation
- Returns mock campaign object with stats

#### GET /api/campaigns
- Retrieves all campaigns for authenticated user/org
- Returns mock campaign data with status and stats
- Supports pagination (structure in place)

#### PUT /api/campaigns
- Updates campaign (pause, resume, cancel)
- Action validation structure

#### DELETE /api/campaigns
- Deletes a campaign
- Ownership validation structure

### 4. Lead Import Integration
- **File**: `src/app/leads/import/page.tsx`
- Added "Start Campaign" button to the import completion screen
- Button appears when a list has been successfully imported
- Redirects to campaigns page with `listId` query parameter
- Automatically pre-selects the list in the campaign flow

## UI/UX Features

### Design Consistency
- Follows the modern B2B SaaS Stripe-like enterprise clean UI design pattern
- Uses existing color scheme and component patterns
- Responsive layout with proper spacing and hover states

### Progress Indicator
- Visual step indicator showing current progress
- Completed steps marked with checkmarks (green)
- Current step highlighted in primary color
- Future steps shown in gray

### Validation & Error Handling
- Form validation at each step
- Disabled state for "Continue" buttons until requirements are met
- Toast notifications for success/error states
- Clear error messages for failed operations

### Loading States
- Skeleton loading for lists and lines
- Disabled states with opacity during submissions
- Spinner animation during campaign launch

## URL Parameters

### Campaigns Page
- `?listId=<id>` - Pre-selects a list and skips to message composition step
- Used when coming from lead import completion

## TODO: Future Implementation

The following features have been marked with TODO comments in the codebase and need backend implementation:

### Backend Campaign Logic
1. **Database Models**
   - Campaign model with status tracking
   - Campaign-lead association tracking
   - Message delivery status per lead

2. **Campaign Scheduling**
   - Integrate with job queue (e.g., Bull, BullMQ)
   - Schedule campaigns for future execution
   - Handle timezone conversions

3. **Message Sending Service**
   - Implement message distribution across lines
   - Respect gap between messages
   - Handle randomization if enabled
   - Retry logic for failed messages
   - Rate limiting to prevent carrier blocks

4. **Campaign Status Management**
   - Draft, scheduled, running, paused, completed, cancelled states
   - Pause/resume functionality
   - Real-time progress updates

5. **Analytics & Tracking**
   - Track sent, delivered, failed, pending counts
   - Individual lead delivery status
   - Campaign performance metrics
   - Open rates (if applicable)
   - Response rates

6. **Advanced Features**
   - Campaign templates
   - A/B testing support
   - Contact-level preferences (opt-outs, unsubscribes)
   - Campaign cloning
   - Message scheduling per lead based on timezone

## API Authentication
All API endpoints use Clerk authentication via `auth()` from `@clerk/nextjs/server`
- Validates `userId` and `orgId`
- Returns 401 for unauthorized requests

## Testing Checklist

### UI Testing
- [ ] Navigation item appears in sidebar
- [ ] Step 1: List selection works
- [ ] Step 1: Create new list redirects to import page
- [ ] Step 2: Message composition with character counter
- [ ] Step 3: Line selection (single and multiple)
- [ ] Step 4: Settings toggles work (scheduling, randomize)
- [ ] Step 4: Date/time pickers function correctly
- [ ] Progress indicator updates correctly
- [ ] Back buttons navigate properly
- [ ] Form validation prevents invalid submissions
- [ ] Campaign launch shows loading state

### Integration Testing
- [ ] Lead import completion shows "Start Campaign" button
- [ ] Campaign page receives listId from URL
- [ ] Pre-selected list appears in Step 1
- [ ] Only active lines appear in Step 3

### API Testing (Once Implemented)
- [ ] POST /api/campaigns creates campaign
- [ ] POST /api/campaigns validates all required fields
- [ ] GET /api/campaigns returns user's campaigns
- [ ] Campaign scheduling works correctly
- [ ] Message gap is respected
- [ ] Messages distributed across lines
- [ ] Campaign status updates properly

## File Structure
```
src/
├── app/
│   ├── campaigns/
│   │   └── page.tsx                 # Main campaigns page
│   ├── api/
│   │   └── campaigns/
│   │       └── route.ts             # Campaigns API endpoints
│   └── leads/
│       └── import/
│           └── page.tsx             # Updated with campaign integration
├── components/
│   └── Sidebar.tsx                  # Updated with Campaigns nav
└── models/                          # TODO: Add Campaign.ts model
```

## Dependencies
No new dependencies were added. The feature uses existing packages:
- `lucide-react` - Icons
- `next/navigation` - Routing
- `sonner` - Toast notifications
- `@clerk/nextjs` - Authentication

## Known Limitations
1. Campaign execution is not implemented (returns mock response)
2. No actual message sending integration
3. Campaign list/dashboard view not implemented
4. No campaign editing after creation
5. No progress tracking during campaign execution
6. No webhook support for delivery status

## Next Steps
1. Create Campaign database model
2. Implement campaign scheduling service
3. Build message distribution logic
4. Create campaign list/dashboard page
5. Add real-time progress tracking (WebSockets or polling)
6. Implement analytics dashboard
7. Add campaign templates
8. Build campaign reporting features

