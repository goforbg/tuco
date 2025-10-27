#!/usr/bin/env node

/**
 * Cron job script to run health checks every 5 minutes
 * 
 * Usage:
 * 1. Set up a cron job to run this script every 5 minutes:
 *    Every 5 minutes: node scripts/run-health-check.js
 *    Or run manually for testing:
 *    node scripts/run-health-check.js
 */

const https = require('https');
const http = require('http');

// Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_ENDPOINT = '/api/health-check';

function makeRequest() {
  return new Promise((resolve, reject) => {
    const url = new URL(API_ENDPOINT, API_BASE_URL);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Health-Check-Runner/1.0',
      },
      timeout: 60000, // 60 second timeout
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
        //   console.log("Response:", JSON.stringify(response));
        //   console.log("Status code:", res.statusCode);
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

async function runHealthCheck() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] Starting health check...`);
  console.log(`[Health Check Client] Making request to: ${API_BASE_URL}${API_ENDPOINT}`);
  console.log(`[Health Check Client] Note: Server-side logs (API route console.log) will appear in the Next.js server terminal, not here.\n`);

  try {
    const response = await makeRequest();
    
    if (response.statusCode === 200 && response.data.success) {
      const { summary, results } = response.data;
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      console.log(`[${endTime.toISOString()}] Health check completed in ${duration}ms`);
      console.log(`  Summary: Healthy: ${summary.healthy}, Down: ${summary.down}`);
      
      // Log any issues
      const issues = results.filter(r => r.status !== 'healthy');
      if (issues.length > 0) {
        console.log(`  ⚠️  Issues detected:`);
        issues.forEach(issue => {
          console.log(`    - ${issue.linePhone} (${issue.status}): ${issue.failures.join(', ')}`);
        });
      } else {
        console.log(`  ✅ All lines healthy`);
      }
      
      if (summary.down > 0) {
        console.log(`  🔴 ${summary.down} line(s) down`);
      } else {
        console.log(`  🟢 All lines healthy`);
      }
    } else {
      console.error(`❌ API request failed with status ${response.statusCode}`);
      console.error(`Response:`, response.data);
      process.exit(1);
    }
  } catch (error) {
    const endTime = new Date();
    console.error(`[${endTime.toISOString()}] ❌ Error running health check:`, error.message);
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

// Run the health check
if (require.main === module) {
  runHealthCheck();
}

module.exports = { runHealthCheck };

