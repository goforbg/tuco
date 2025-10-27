import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { ILine, LineCollection } from '@/models/Line';
import { sendHealthCheckFailureEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

interface HealthCheckResult {
  lineId: string;
  linePhone: string;
  lineEmail: string;
  status: 'healthy' | 'unknown' | 'down';
  failures: string[];
  checkedAt: Date;
}

/**
 * GET /api/health-check - Check health of all active lines
 * 
 * This endpoint is called by the cron job every 5 minutes.
 * For each line with a sender, it checks:
 * 1. Server health: GET {serverUrl}/api/v1/ping?guid={guid}
 * 2. iMessage availability: GET {serverUrl}/api/v1/handle/availability/imessage?address=...&guid={guid}
 * 
 * If health check fails, sends an email (only once per incident).
 * After 2 days of being healthy, if it goes down again, sends another email.
 */
export async function GET() {
  try {
    console.log('[Health Check] Starting health check for all lines...');
    
    const { db } = await connectDB();
    
    // Get all active lines with senders (lines that have serverUrl and guid)
    const lines = await db
      .collection<ILine>(LineCollection)
      .find({
        isActive: true,
        provisioningStatus: 'active',
        serverUrl: { $exists: true, $ne: '' },
        guid: { $exists: true, $ne: '' }
      })
      .toArray();

    console.log(`[Health Check] Found ${lines.length} active lines to check`);

    const results: HealthCheckResult[] = [];
    const checkedAt = new Date();
    
    // Check each line
    for (const line of lines) {
      console.log(`[Health Check] Checking line ${line.phone} (${line._id})`);
      
      const failures: string[] = [];
      let shouldSendEmail = false;
      
      try {
        // Check 1: Server health ping
        console.log(`[Health Check Debug] Starting server health check for line ${line.phone} (serverUrl: ${line.serverUrl}, guid: ${line.guid})`);
        const serverHealthResult = await checkServerHealth(line.serverUrl, line.guid);
        if (!serverHealthResult.success) {
          failures.push('Server health check failed');
          console.warn(`[Health Check] Line ${line.phone} - Server health failed: ${serverHealthResult.error}`);
        } else {
          console.log(`[Health Check] Line ${line.phone} - Server health OK`);
        }

        // Check 2: iMessage availability
        console.log(`[Health Check Debug] Starting iMessage availability check for line`);
        const availabilityResult = await checkIMessageAvailability(line.serverUrl, line.guid, "+919042956129");
        if (!availabilityResult.success) {
          failures.push('iMessage availability check failed');
          console.warn(`[Health Check] Line ${line.phone} - Availability failed: ${availabilityResult.error}`);
        } else {
          console.log(`[Health Check] Line ${line.phone} - Availability OK`);
        }

        // Determine status - only healthy or down
        let status: 'healthy' | 'down';
        if (failures.length === 0) {
          status = 'healthy';
        } else {
          status = 'down';
        }

        // Get current health check state
        const currentHealth = line.healthCheck || {};
        const currentStatus = currentHealth.status || 'healthy';
        const lastHealthyAt = currentHealth.lastHealthyAt;
        const sendEmailOnNextDown = currentHealth.sendEmailOnNextDown ?? true;
        
        // Check if line has been healthy for 2 days (re-enable email notifications)
        let enableEmailNotification = false;
        if (status === 'healthy' && lastHealthyAt) {
          const twoDaysAgo = new Date(checkedAt.getTime() - 2 * 24 * 60 * 60 * 1000);
          if (new Date(lastHealthyAt) <= twoDaysAgo) {
            // Line has been healthy for 2+ days, re-enable email notifications
            enableEmailNotification = true;
            console.log(`[Health Check] Line ${line.phone} - Re-enabling email notifications (healthy for 2+ days)`);
          }
        } else if (status === 'healthy' && !lastHealthyAt) {
          // First time marking as healthy, record the timestamp
          enableEmailNotification = false;
        }
        
        // Check if we should send an email
        if (status === 'down') {
          // If this is a new failure (was healthy before) and we should send email
          if (currentStatus === 'healthy' && sendEmailOnNextDown) {
            shouldSendEmail = true;
            console.log(`[Health Check] Line ${line.phone} - Need to send notification email`);
          }
        }

        // Update database with health check results
        const updateData: Partial<ILine> = {
          healthCheck: {
            ...currentHealth,
            lastCheckedAt: checkedAt,
            status,
            consecutiveFailures: status !== 'healthy' ? (currentHealth.consecutiveFailures || 0) + 1 : 0,
            lastHealthyAt: status === 'healthy' ? (lastHealthyAt || checkedAt) : undefined,
            sendEmailOnNextDown: enableEmailNotification ? true : currentHealth.sendEmailOnNextDown,
          },
          updatedAt: checkedAt
        };

        await db.collection<ILine>(LineCollection).updateOne(
          { _id: line._id },
          { $set: updateData }
        );

        // Send email if needed
        if (shouldSendEmail) {
          console.log(`[Health Check] Sending notification email to ${line.email}`);
          
          // Mark that we're attempting to send (so we don't send again for this incident)
          await db.collection<ILine>(LineCollection).updateOne(
            { _id: line._id },
            { $set: { 
              'healthCheck.sendEmailOnNextDown': false,
              updatedAt: checkedAt
            }}
          );
          
          const emailResult = await sendHealthCheckFailureEmail(
            line.email,
            line.phone,
            failures
          );
          
          if (emailResult.success) {
            // Update lastEmailSentAt only if email was successfully sent
            await db.collection<ILine>(LineCollection).updateOne(
              { _id: line._id },
              { $set: { 
                'healthCheck.lastEmailSentAt': checkedAt,
                updatedAt: checkedAt
              }}
            );
          } else {
            console.error(`[Health Check] Failed to send email: ${emailResult.error}`);
          }
        }

        results.push({
          lineId: line._id!.toString(),
          linePhone: line.phone,
          lineEmail: line.email,
          status,
          failures,
          checkedAt
        });

      } catch (error) {
        console.error(`[Health Check] Error checking line ${line.phone}:`, error);
        results.push({
          lineId: line._id!.toString(),
          linePhone: line.phone,
          lineEmail: line.email,
          status: 'down',
          failures: [`Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`],
          checkedAt
        });
      }
    }

    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const downCount = results.filter(r => r.status === 'down').length;

    console.log(`[Health Check] Completed - Healthy: ${healthyCount}, Down: ${downCount}`);

    return NextResponse.json({
      success: true,
      checkedAt: checkedAt.toISOString(),
      summary: {
        total: results.length,
        healthy: healthyCount,
        down: downCount
      },
      results,
      // Include debug logs in response for troubleshooting
      debug: {
        totalLinesChecked: results.length,
        serverLogs: 'Check the Next.js server terminal for detailed [Health Check Debug] logs'
      }
    });

  } catch (error) {
    console.error('[Health Check] Fatal error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

/**
 * Check server health by pinging the server
 */
async function checkServerHealth(serverUrl: string, guid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${serverUrl}/api/v1/ping?guid=${guid}`;
    console.log(`[Health Check Debug] Ping URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    console.log(`[Health Check Debug] Ping response status: ${response.status}`);

    if (!response.ok) {
      console.log(`[Health Check Debug] Ping failed with status ${response.status}`);
      const errorText = await response.text();
      console.log(`[Health Check Debug] Ping error response: ${errorText}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Health Check Debug] Ping response data:`, JSON.stringify(data));
    
    // Check if response matches expected format
    if (data.status === 200 && data.message === 'Ping received!' && data.data === 'pong') {
      console.log(`[Health Check Debug] Ping check passed`);
      return { success: true };
    }

    console.log(`[Health Check Debug] Ping check failed - invalid format. Expected: {status: 200, message: 'Ping received!', data: 'pong'}. Got:`, data);
    return { success: false, error: 'Invalid response format' };

  } catch (error) {
    console.log(`[Health Check Debug] Ping check exception:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Check iMessage availability
 */
async function checkIMessageAvailability(
  serverUrl: string, 
  guid: string, 
  phone: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // URL encode the phone number
    const encodedPhone = encodeURIComponent(phone);
    const url = `${serverUrl}/api/v1/handle/availability/imessage?address=${encodedPhone}&guid=${guid}`;
    console.log(`[Health Check Debug] iMessage availability URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    console.log(`[Health Check Debug] iMessage availability response status: ${response.status}`);

    if (!response.ok) {
      console.log(`[Health Check Debug] iMessage availability failed with status ${response.status}`);
      const errorText = await response.text();
      console.log(`[Health Check Debug] iMessage availability error response: ${errorText}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log(`[Health Check Debug] iMessage availability response data:`, JSON.stringify(data));
    
    // Check if response matches expected format
    if (data.status === 200 && data.message === 'Success' && data.data?.available === true) {
      console.log(`[Health Check Debug] iMessage availability check passed`);
      return { success: true };
    }

    console.log(`[Health Check Debug] iMessage availability check failed - invalid format. Expected: {status: 200, message: 'Success', data: {available: true}}. Got:`, data);
    return { success: false, error: 'iMessage not available' };

  } catch (error) {
    console.log(`[Health Check Debug] iMessage availability check exception:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

