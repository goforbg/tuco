import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { auth } from '@clerk/nextjs/server';
import { ILine, LineCollection } from '@/models/Line';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health-check/status - Get health status for active workspace
 * 
 * Returns the overall health status of all lines in the workspace.
 * Used by the frontend to display the health indicator.
 */
export async function GET() {
  try {
    console.log("Getting health status");
    const { userId, orgId } = await auth();
    
    if (!userId) {
      console.log("Unauthorized");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = orgId || userId;
    const { db } = await connectDB();

    // Get all active lines for this workspace
    const lines = await db
      .collection<ILine>(LineCollection)
      .find({
        workspaceId,
        isActive: true,
        provisioningStatus: 'active'
      })
      .toArray();

    if (lines.length === 0) {
      // No lines - return unknown status and don't show indicator
      return NextResponse.json({
        status: 'unknown',
        hasLines: false,
        healthyCount: 0,
        totalCount: 0,
        lines: []
      });
    }

    // Count health statuses
    // Filter out lines that don't have health check capability (missing serverUrl/guid)
    const linesWithHealthCheck = lines.filter(line => line.serverUrl && line.guid);
    
    if (linesWithHealthCheck.length === 0) {
      console.log("No lines with health check capability");
      // Lines exist but none have health check capability
      return NextResponse.json({
        status: 'unknown',
        hasLines: true, // Lines exist
        canCheckHealth: false, // But can't check health
        healthyCount: 0,
        downCount: 0,
        totalCount: lines.length,
        lines: []
      });
    }

    const healthStatuses = linesWithHealthCheck.map(line => ({
      lineId: line._id!.toString(),
      phone: line.phone,
      status: line.healthCheck?.status || 'never-checked',
      lastCheckedAt: line.healthCheck?.lastCheckedAt,
      consecutiveFailures: line.healthCheck?.consecutiveFailures || 0
    }));

    const healthyCount = healthStatuses.filter(h => h.status === 'healthy').length;
    const downCount = healthStatuses.filter(h => h.status === 'down').length;
    const neverCheckedCount = healthStatuses.filter(h => h.status === 'never-checked').length;

    // Determine overall status
    // - All healthy -> green
    // - Any down -> red
    // - All never-checked -> hide indicator
    let overallStatus: 'healthy' | 'down' | 'unknown';
    if (downCount > 0) {
      overallStatus = 'down';
    } else if (healthyCount > 0) {
      overallStatus = 'healthy';
    } else if (neverCheckedCount === healthStatuses.length) {
      // All lines are never checked - show as 'unknown' (will hide indicator)
      overallStatus = 'unknown';
    } else {
      overallStatus = 'unknown';
    }

    return NextResponse.json({
      status: overallStatus,
      hasLines: true,
      canCheckHealth: true,
      healthyCount,
      downCount,
      neverCheckedCount,
      totalCount: lines.length,
      lines: healthStatuses
    });

  } catch (error) {
    console.error('[Health Check Status] Error:', error);
    return NextResponse.json(
      { 
        status: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

