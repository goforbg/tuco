#!/usr/bin/env node

/**
 * Cron job script to process scheduled messages
 * 
 * Usage:
 * 1. Set up a cron job to run this script every minute:
 *    * * * * * node scripts/process-scheduled-messages.js
 * 
 * 2. Or run manually for testing:
 *    node scripts/process-scheduled-messages.js
 */

const https = require('https');
const http = require('http');

// Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_ENDPOINT = '/api/messages/process-scheduled';

function makeRequest() {
  return new Promise((resolve, reject) => {
    const url = new URL(API_ENDPOINT, API_BASE_URL);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Scheduled-Message-Processor/1.0',
      },
      timeout: 30000, // 30 second timeout
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: response,
          });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function processScheduledMessages() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Starting scheduled message processing...`);

  try {
    const response = await makeRequest();
    
    if (response.statusCode === 200) {
      const { processed, errors } = response.data;
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      console.log(`[${endTime.toISOString()}] Processing completed in ${duration}ms`);
      console.log(`  - Processed: ${processed} messages`);
      console.log(`  - Errors: ${errors} messages`);
      
      if (processed > 0) {
        console.log(`  ✅ Successfully processed ${processed} scheduled messages`);
      }
      
      if (errors > 0) {
        console.log(`  ⚠️  ${errors} messages failed to process`);
      }
      
      if (processed === 0 && errors === 0) {
        console.log(`  ℹ️  No scheduled messages to process`);
      }
    } else {
      console.error(`❌ API request failed with status ${response.statusCode}`);
      console.error(`Response:`, response.data);
      process.exit(1);
    }
  } catch (error) {
    const endTime = new Date();
    console.error(`[${endTime.toISOString()}] ❌ Error processing scheduled messages:`, error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the processing
if (require.main === module) {
  processScheduledMessages();
}

module.exports = { processScheduledMessages };
