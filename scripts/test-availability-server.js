const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection string - update this with your actual connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tuco-ai';

async function testAvailabilityServer() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('tuco-ai');
    const linesCollection = db.collection('lines');
    
    // Find the availability server
    const availabilityServer = await linesCollection.findOne({
      workspaceId: 'GLOBAL',
      guid: 'AVAIL001'
    });
    
    if (!availabilityServer) {
      console.log('❌ Availability server not found in database');
      console.log('Run add-availability-server.js first');
      return;
    }
    
    console.log('✅ Availability server found:');
    console.log('  Object ID:', availabilityServer._id);
    console.log('  Server URL:', availabilityServer.serverUrl);
    console.log('  GUID:', availabilityServer.guid);
    console.log('  Is Active:', availabilityServer.isActive);
    console.log('  Status:', availabilityServer.provisioningStatus);
    
    // Test the server URL
    if (availabilityServer.serverUrl && availabilityServer.serverUrl !== 'https://your-availability-server.com') {
      console.log('\n🧪 Testing server URL...');
      
      try {
        const testUrl = `${availabilityServer.serverUrl}/api/v1/handle/availability/imessage?address=test@example.com&guid=${availabilityServer.guid}`;
        console.log('Test URL:', testUrl);
        
        const response = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Response data:', data);
          console.log('✅ Server is responding correctly');
        } else {
          console.log('⚠️  Server responded with error status:', response.status);
        }
      } catch (error) {
        console.log('❌ Error testing server URL:', error.message);
      }
    } else {
      console.log('⚠️  Server URL not configured or still using placeholder');
      console.log('Update the serverUrl in the database with your actual server URL');
    }
    
  } catch (error) {
    console.error('Error testing availability server:', error);
  } finally {
    await client.close();
  }
}

// Run the test
if (require.main === module) {
  testAvailabilityServer()
    .then(() => {
      console.log('\n✅ Test completed');
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testAvailabilityServer };
