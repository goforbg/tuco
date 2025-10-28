#!/usr/bin/env node

/**
 * Test script for BullMQ bulk availability checking
 * Usage: node test-bullmq-availability.js
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const CLERK_TOKEN = process.env.CLERK_TOKEN || 'your-clerk-token-here';

async function testBullMQAvailability() {
  console.log('🧪 Testing BullMQ Bulk Availability Checking\n');

  try {
    // Test 1: Check BullMQ health
    console.log('1️⃣ Checking BullMQ health...');
    const healthResponse = await fetch(`${BASE_URL}/api/bullmq/health`, {
      headers: {
        'Authorization': `Bearer ${CLERK_TOKEN}`
      }
    });
    
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('✅ BullMQ Health:', health);
    } else {
      console.log('❌ BullMQ Health check failed:', healthResponse.status);
    }

    // Test 2: Get queue statistics
    console.log('\n2️⃣ Getting queue statistics...');
    const statsResponse = await fetch(`${BASE_URL}/api/bullmq/stats`, {
      headers: {
        'Authorization': `Bearer ${CLERK_TOKEN}`
      }
    });
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log('✅ Queue Stats:', JSON.stringify(stats, null, 2));
    } else {
      console.log('❌ Stats check failed:', statsResponse.status);
    }

    // Test 3: Test small batch (synchronous)
    console.log('\n3️⃣ Testing small batch (synchronous processing)...');
    const smallBatchResponse = await fetch(`${BASE_URL}/api/leads/check-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLERK_TOKEN}`
      },
      body: JSON.stringify({
        leadIds: ['test-lead-1', 'test-lead-2', 'test-lead-3']
        // Note: These are just IDs - actual lead data will be fetched from MongoDB
        // In map fields stage: lastName, email, phone might be missing
        // But at least one of email OR phone is required for availability checking
      })
    });

    if (smallBatchResponse.ok) {
      const result = await smallBatchResponse.json();
      console.log('✅ Small batch result:', result);
    } else {
      console.log('❌ Small batch failed:', smallBatchResponse.status);
    }

    // Test 4: Test large batch (BullMQ background)
    console.log('\n4️⃣ Testing large batch (BullMQ background processing)...');
    const largeBatchResponse = await fetch(`${BASE_URL}/api/leads/check-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLERK_TOKEN}`
      },
      body: JSON.stringify({
        leadIds: Array.from({length: 15}, (_, i) => `test-lead-${i + 1}`)
      })
    });

    if (largeBatchResponse.ok) {
      const result = await largeBatchResponse.json();
      console.log('✅ Large batch result:', result);
      
      if (result.jobId) {
        console.log(`📋 Job ID: ${result.jobId}`);
        console.log('⏳ Check worker logs to see job processing...');
      }
    } else {
      console.log('❌ Large batch failed:', largeBatchResponse.status);
    }

    // Test 5: Direct job addition
    console.log('\n5️⃣ Testing direct job addition...');
    const directJobResponse = await fetch(`${BASE_URL}/api/bullmq/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLERK_TOKEN}`
      },
      body: JSON.stringify({
        jobType: 'bulk-availability-check',
        data: {
          leadIds: ['direct-lead-1', 'direct-lead-2', 'direct-lead-3'],
          userId: 'test-user',
          workspaceId: 'test-workspace'
        }
      })
    });

    if (directJobResponse.ok) {
      const result = await directJobResponse.json();
      console.log('✅ Direct job result:', result);
    } else {
      console.log('❌ Direct job failed:', directJobResponse.status);
    }

    // Test 6: Check final queue stats
    console.log('\n6️⃣ Checking final queue statistics...');
    const finalStatsResponse = await fetch(`${BASE_URL}/api/bullmq/stats`, {
      headers: {
        'Authorization': `Bearer ${CLERK_TOKEN}`
      }
    });
    
    if (finalStatsResponse.ok) {
      const stats = await finalStatsResponse.json();
      console.log('✅ Final Queue Stats:', JSON.stringify(stats, null, 2));
    }

    console.log('\n🎉 Testing completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Check your worker server logs for job processing');
    console.log('2. Monitor Redis queues: redis-cli KEYS bull:*');
    console.log('3. Check MongoDB for updated lead availability status');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testBullMQAvailability();
