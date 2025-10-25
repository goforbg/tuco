const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection string - update this with your actual connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:JZtyGjSepvIOyVDNCjdpTkJJvOzTRTOj@hopper.proxy.rlwy.net:32523';

// Configuration for the availability check server
const AVAILABILITY_SERVER_CONFIG = {
  // Update these values with your actual server details
  serverUrl: 'https://your-availability-server.com', // Replace with your actual server URL
  guid: 'AVAIL001', // Fixed GUID for availability checks
  phone: 'AVAILABILITY-CHECK', // Placeholder phone
  email: 'availability@tuco.ai', // Placeholder email
  firstName: 'Availability',
  lastName: 'Checker',
  workspaceId: 'GLOBAL', // Global workspace for availability checks
  createdByUserId: 'SYSTEM', // System user
};

async function addAvailabilityServer() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('tuco-ai');
    const linesCollection = db.collection('lines');
    
    // Check if availability server already exists
    const existingServer = await linesCollection.findOne({
      guid: AVAILABILITY_SERVER_CONFIG.guid,
      workspaceId: AVAILABILITY_SERVER_CONFIG.workspaceId
    });
    
    if (existingServer) {
      console.log('Availability server already exists:', existingServer._id);
      console.log('Server URL:', existingServer.serverUrl);
      return existingServer._id;
    }
    
    // Create the availability server line
    const now = new Date();
    const newLine = {
      workspaceId: AVAILABILITY_SERVER_CONFIG.workspaceId,
      createdByUserId: AVAILABILITY_SERVER_CONFIG.createdByUserId,
      serverUrl: AVAILABILITY_SERVER_CONFIG.serverUrl,
      guid: AVAILABILITY_SERVER_CONFIG.guid,
      phone: AVAILABILITY_SERVER_CONFIG.phone,
      email: AVAILABILITY_SERVER_CONFIG.email,
      firstName: AVAILABILITY_SERVER_CONFIG.firstName,
      lastName: AVAILABILITY_SERVER_CONFIG.lastName,
      isActive: true, // Always active for availability checks
      provisioningStatus: 'active',
      provisioningSubmittedAt: now,
      lineType: 'byon', // BYON type for system line
      dailyNewConversationsLimit: 1000, // High limit for availability checks
      dailyTotalMessagesLimit: 10000,
      createdAt: now,
      updatedAt: now,
    };
    
    const result = await linesCollection.insertOne(newLine);
    console.log('Availability server created successfully!');
    console.log('Object ID:', result.insertedId);
    console.log('Server URL:', AVAILABILITY_SERVER_CONFIG.serverUrl);
    console.log('GUID:', AVAILABILITY_SERVER_CONFIG.guid);
    
    return result.insertedId;
    
  } catch (error) {
    console.error('Error adding availability server:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// Run the script
if (require.main === module) {
  addAvailabilityServer()
    .then((objectId) => {
      console.log('\n✅ Success! Availability server Object ID:', objectId);
      console.log('\nNext steps:');
      console.log('1. Update the serverUrl in this script with your actual server URL');
      console.log('2. Run this script again to update the server URL');
      console.log('3. Use this Object ID in the check-availability route');
    })
    .catch((error) => {
      console.error('❌ Failed to add availability server:', error);
      process.exit(1);
    });
}

module.exports = { addAvailabilityServer, AVAILABILITY_SERVER_CONFIG };
