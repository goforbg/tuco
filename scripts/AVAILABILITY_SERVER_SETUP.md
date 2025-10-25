# Availability Server Setup

This document explains how to set up the availability check server for the Tuco AI application.

## Overview

The availability check functionality has been modified to use a dedicated server instead of the sender's server URL. This change allows for centralized availability checking while keeping the code structure intact for future reversion.

## Setup Instructions

### 1. Add Availability Server to Database

Run the script to add the availability server line to the database:

```bash
cd scripts
node add-availability-server.js
```

### 2. Update Server URL

After running the script, you'll need to update the server URL in the database with your actual server URL:

1. Find the Object ID returned by the script
2. Update the `serverUrl` field in the `lines` collection for the line with:
   - `workspaceId: 'GLOBAL'`
   - `guid: 'AVAIL001'`

You can update it using MongoDB Compass, MongoDB shell, or by running:

```javascript
db.lines.updateOne(
  { workspaceId: 'GLOBAL', guid: 'AVAIL001' },
  { $set: { serverUrl: 'https://your-actual-server-url.com' } }
)
```

### 3. Verify Configuration

The availability server line should have these properties:
- `workspaceId: 'GLOBAL'`
- `guid: 'AVAIL001'`
- `isActive: true`
- `provisioningStatus: 'active'`
- `serverUrl: 'https://your-actual-server-url.com'`

## Code Changes Made

### Files Modified

1. **`src/app/api/leads/check-availability/route.ts`**
   - Added `getAvailabilityServerUrl()` function to fetch the availability server from database
   - Modified GET endpoint to use availability server instead of active line
   - Modified POST endpoint to use availability server instead of active line
   - Updated individual address checking to use availability server
   - Updated bulk availability checking to use availability server

2. **`scripts/add-availability-server.js`** (new file)
   - Script to add the availability server line to the database
   - Configurable server URL and GUID

### Key Changes

- **Server URL Source**: Changed from `activeLine.serverUrl` to `availabilityServer.serverUrl`
- **GUID Source**: Changed from `activeLine.guid` to `availabilityServer.guid`
- **Database Query**: Now looks for line with `workspaceId: 'GLOBAL'` and `guid: 'AVAIL001'`
- **Error Handling**: Updated error messages to reflect availability server configuration

### Code Structure Preserved

The existing code structure has been preserved for easy reversion:
- All function signatures remain the same
- Variable names and logic flow unchanged
- Only the source of `serverUrl` and `guid` has changed
- The `checkSingleAvailability` function remains unchanged
- **Old code is commented out** instead of removed for easy reversion

## Reverting Changes

To revert back to using the sender's server URL:

1. In `src/app/api/leads/check-availability/route.ts`:
   - Comment out the new `getAvailabilityServerUrl()` function and related code
   - Uncomment the old code blocks marked with "OLD CODE - COMMENTED OUT FOR FUTURE REVERSION"
   - Change `availabilityServer` back to `activeLine` in the uncommented sections
   - Update error messages back to original

2. Remove the availability server line from the database (optional)

### Quick Reversion Steps

1. Find all sections marked with `// OLD CODE - COMMENTED OUT FOR FUTURE REVERSION`
2. Uncomment those sections
3. Comment out the corresponding new code sections
4. Test the functionality

## Testing

After setup, test the availability check functionality:

1. Go to the Leads page
2. Try checking availability for a lead
3. Verify that the API calls are made to your availability server URL
4. Check the browser network tab to confirm the correct server is being used

## Troubleshooting

### Common Issues

1. **"Availability check server not configured"**
   - Ensure the availability server line exists in the database
   - Check that `workspaceId: 'GLOBAL'` and `guid: 'AVAIL001'`
   - Verify the line is active and has a valid serverUrl

2. **API calls failing**
   - Verify the serverUrl in the database is correct and accessible
   - Check that the server responds to the availability check endpoint
   - Ensure the GUID is correct

3. **Database connection issues**
   - Verify MongoDB connection string in the script
   - Check database permissions for the lines collection

### Debugging

Enable debug logging by checking the console output:
- The availability server URL should be logged
- API calls should show the correct server URL
- Error messages will indicate configuration issues
