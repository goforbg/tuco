import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

// We keep raw payload for verification and store parsed event for querying

export const dynamic = 'force-dynamic';

// Ensure indexes once per process
let indexesEnsured = false as boolean;
async function ensureIndexes() {
  if (indexesEnsured) return;
  const { db } = await connectDB();
  const collection = db.collection('clerk_events');
  try {
    await Promise.all([
      collection.createIndex({ _event_id: 1 }, { unique: true, name: 'uniq_event_id' }),
      collection.createIndex({ type: 1, _occurred_at: 1 }, { name: 'type_occurred_idx' }),
      collection.createIndex({ _received_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90, name: 'ttl_received_90d' }),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.warn('ensureIndexes warning', { err: message });
  }
  indexesEnsured = true;
}

type SvixHeaders = {
  'svix-id': string;
  'svix-timestamp': string;
  'svix-signature': string;
};

type VerifiedWebhook = {
  verify: (payload: string, headers: SvixHeaders) => unknown;
};

type SvixModule = {
  Webhook: new (secret: string) => VerifiedWebhook;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ALLOWED_EVENT_TYPES = new Set([
  'user.created','user.updated','user.deleted',
  'organization.created','organization.updated','organization.deleted',
  'organizationMembership.created','organizationMembership.updated','organizationMembership.deleted',
  'role.created','role.updated','role.deleted',
  'permission.created','permission.updated','permission.deleted',
]);

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('clerk-webhook-start', { timestamp: new Date().toISOString() });
  
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('clerk-webhook-missing-secret');
    return NextResponse.json({ error: 'Missing CLERK_WEBHOOK_SECRET' }, { status: 500 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('clerk-webhook-missing-headers', { 
      hasId: !!svixId, 
      hasTimestamp: !!svixTimestamp, 
      hasSignature: !!svixSignature 
    });
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  console.log('clerk-webhook-headers-received', { svixId, svixTimestamp });

  // IMPORTANT: use raw text exactly as received for signature verification.
  // Do NOT parse the body earlier in middleware.
  const payload = await req.text();
  console.log('clerk-webhook-payload-received', { 
    size: payload.length, 
    sizeKB: Math.round(payload.length / 1024) 
  });
  
  // Basic payload size guard (200KB). Tune based on your needs.
  if (payload.length > 200 * 1024) {
    console.error('clerk-webhook-payload-too-large', { size: payload.length });
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  
  // Dynamic import to avoid type resolution issues if svix isn't installed locally yet
  const svixModule = (await import('svix')) as unknown as SvixModule;
  const wh = new svixModule.Webhook(secret);

  let eventUnknown: unknown;
  try {
    eventUnknown = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    } as SvixHeaders);
    console.log('clerk-webhook-signature-verified');
  } catch (err) {
    console.error('clerk-webhook-signature-invalid', { error: err instanceof Error ? err.message : 'unknown' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!isObjectRecord(eventUnknown)) {
    console.error('clerk-webhook-invalid-payload');
    return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 });
  }
  const eventObj = eventUnknown as Record<string, unknown>;
  const eventType: string | undefined = typeof eventObj['type'] === 'string' ? (eventObj['type'] as string) : undefined;
  const eventId: string | undefined = typeof eventObj['id'] === 'string' ? (eventObj['id'] as string) : undefined;
  const dataObj = isObjectRecord(eventObj['data']) ? (eventObj['data'] as Record<string, unknown>) : undefined;
  const updatedAt = dataObj && typeof dataObj['updated_at'] === 'string' ? (dataObj['updated_at'] as string) : undefined;
  const createdAt = dataObj && typeof dataObj['created_at'] === 'string' ? (dataObj['created_at'] as string) : undefined;
  const occuredTop = typeof eventObj['occurred_at'] === 'string' ? (eventObj['occurred_at'] as string) : undefined;
  const occurredAt: string | undefined = updatedAt || createdAt || occuredTop;

  console.log('clerk-webhook-event-parsed', { 
    eventType, 
    eventId, 
    hasData: !!dataObj,
    occurredAt 
  });

  if (!eventType) {
    console.error('clerk-webhook-missing-event-type');
    return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
  }

  try {
    // Replay window: reject if svix-timestamp older/newer than 5 minutes (allow skew)
    const nowMs = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;
    const svixTsSec = Number(svixTimestamp);
    if (!Number.isFinite(svixTsSec)) {
      console.error('clerk-webhook-invalid-timestamp', { svixTimestamp });
      return NextResponse.json({ error: 'Invalid svix timestamp' }, { status: 400 });
    }
    const svixTsMs = svixTsSec * 1000; // header is seconds per Svix
    const timeDiff = Math.abs(nowMs - svixTsMs);
    if (timeDiff > fiveMinutesMs) {
      console.error('clerk-webhook-stale', { 
        timeDiffMs: timeDiff, 
        svixTimestamp, 
        serverTime: new Date(nowMs).toISOString() 
      });
      return NextResponse.json({ error: 'Stale webhook' }, { status: 400 });
    }

    console.log('clerk-webhook-timestamp-valid', { timeDiffMs: timeDiff });

    await ensureIndexes();

    const { db } = await connectDB();
    const collection = db.collection('clerk_events');

    // Idempotent upsert by Clerk event id when available; fallback to svix-id
    const uniqueId = eventId || svixId;

    const safeType = eventType && ALLOWED_EVENT_TYPES.has(eventType) ? eventType : 'other.unknown';

    const docBase: Record<string, unknown> = {
      _event_id: uniqueId,
      type: safeType,
      _received_at: new Date(),
      // TODO: raw payload contains PII (emails, names). Consider encrypting
      // or archiving to S3 + KMS and keeping only parsed fields here.
      event: eventObj,
      processed: false,
      last_error: null,
    };
    if (svixId) {
      docBase._svix = { id: svixId, timestamp: svixTimestamp, signature: svixSignature };
    }
    let occurredDate: Date | undefined = undefined;
    if (occurredAt) {
      const parsed = new Date(occurredAt);
      if (!Number.isNaN(parsed.getTime())) {
        occurredDate = parsed;
      }
    }
    if (occurredDate) {
      docBase._occurred_at = occurredDate;
    }

    const update: Record<string, unknown> = {
      $setOnInsert: docBase,
      $set: { last_received_at: new Date() },
      $inc: { attempts: 1 },
    };
    // Maintain monotonic _occurred_at to help with out-of-order detection later
    if (docBase._occurred_at) {
      (update as Record<string, unknown>)['$max'] = { _occurred_at: docBase._occurred_at };
    }

    // Simple retry to tolerate transient Mongo errors
    async function safeUpsert() {
      for (let i = 0; i < 2; i++) {
        try {
          // First, try to update existing document
          const result = await collection.updateOne({ _event_id: uniqueId }, update);
          
          // If no document was updated, insert a new one with attempts: 1
          if (result.matchedCount === 0) {
            const insertDoc = { ...docBase, attempts: 1, last_received_at: new Date() };
            await collection.insertOne(insertDoc);
          }
          
          return result;
        } catch (e) {
          if (i === 1) throw e;
          await new Promise((r) => setTimeout(r, 100 * (i + 1)));
        }
      }
    }

    await safeUpsert();
    console.log('clerk-webhook-event-stored', { eventId: uniqueId, eventType: safeType });

    // Trigger projector immediately after storing the event
    try {
      const projectorUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.tuco.ai'}/api/webhooks/clerk/projector`;
      const cronSecret = process.env.CLERK_WEBHOOK_SECRET;
      
      if (cronSecret) {
        console.log('clerk-webhook-triggering-projector', { projectorUrl });
        // Fire and forget - don't wait for response to avoid blocking webhook
        fetch(projectorUrl, {
          method: 'POST',
          headers: {
            'x-cron-secret': cronSecret,
            'content-type': 'application/json',
          },
        })
        .then(async (response) => {
          const result = await response.json();
          console.log('clerk-webhook-projector-response', { 
            status: response.status, 
            result,
            eventId: uniqueId 
          });
        })
        .catch((err) => {
          console.error('clerk-webhook-projector-failed', { 
            error: err instanceof Error ? err.message : 'unknown',
            eventId: uniqueId 
          });
        });
      } else {
        console.warn('clerk-webhook-no-cron-secret', { eventId: uniqueId });
      }
    } catch (err) {
      console.error('clerk-webhook-projector-trigger-error', { 
        error: err instanceof Error ? err.message : 'unknown',
        eventId: uniqueId 
      });
    }

    const duration = Date.now() - startTime;
    console.log('clerk-webhook-complete', { 
      eventId: uniqueId, 
      eventType: safeType, 
      durationMs: duration 
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('clerk-webhook', { err: message });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


