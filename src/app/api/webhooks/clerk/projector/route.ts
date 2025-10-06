import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 20;
const CLAIM_CONCURRENCY = 4;
//const HEARTBEAT_INTERVAL_MS = 15_000;
const CUTOFF_SEC = 90; // increase if you need longer jobs

let userIndexesEnsured = false as boolean;
async function ensureUserIndexes() {
  if (userIndexesEnsured) return;
  const { db } = await connectDB();
  const users = db.collection('users');
  try {
    await Promise.all([
      users.createIndex({ clerkUserId: 1 }, { unique: true, name: 'uniq_clerk_user_id' }),
      users.createIndex({ last_event_occurred_at: 1 }, { name: 'last_event_idx' }),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.warn('ensureUserIndexes warning', { err: message });
  }
  userIndexesEnsured = true;
}

type AnyRecord = Record<string, unknown>;

function isObjectRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// reclaim stuck jobs older than 90s (prefer heartbeat if present)
async function reclaimStale() {
  const { db } = await connectDB();
  const inbox = db.collection('clerk_events');
  const cutoff = new Date(Date.now() - CUTOFF_SEC * 1000);
  await inbox.updateMany(
    {
      processed: false,
      $or: [
        { processing_last_heartbeat: { $exists: true, $lte: cutoff } },
        { processing: true, processing_started_at: { $lte: cutoff } },
      ],
    },
    { $set: { processing: false }, $inc: { attempts: 1 } }
  );
}

async function processUserDeleted(eventDoc: AnyRecord) {
  const { db } = await connectDB();
  const users = db.collection('users');
  await ensureUserIndexes();

  const occurredAt: Date | null = toDate(eventDoc._occurred_at);
  const event = isObjectRecord(eventDoc.event) ? (eventDoc.event as AnyRecord) : undefined;
  const data = event && isObjectRecord(event.data) ? (event.data as AnyRecord) : undefined;
  const clerkUserId: string | undefined = (data?.id as string) || (isObjectRecord(data?.user) ? ((data?.user as AnyRecord).id as string) : undefined);
  if (!clerkUserId) return; // nothing to do without ID

  const setFields: AnyRecord = {
    deleted: true,
    deletedAt: occurredAt || new Date(),
    piiScrubbed: true,
    // Keep minimal identifiers for audit/joins
    clerkUserId,
  };
  // Scrub common PII fields
  const unsetFields: AnyRecord = { name: '', email: '', firstName: '', lastName: '', imageUrl: '', phone: '' };

  // Out-of-order guard: only apply if incoming event is newer
  const orClauses: AnyRecord[] = [{ last_event_occurred_at: { $exists: false } }];
  if (occurredAt) orClauses.push({ last_event_occurred_at: { $lte: occurredAt } });
  const filter: AnyRecord = { clerkUserId, $or: orClauses };

  const update: AnyRecord = {
    $set: { ...setFields, last_event_occurred_at: occurredAt || new Date(0) },
    $unset: unsetFields,
  };

  await users.updateOne(filter, update, { upsert: true });
}

function extractUserFieldsFromEvent(eventDoc: AnyRecord) {
  const event = isObjectRecord(eventDoc.event) ? (eventDoc.event as AnyRecord) : undefined;
  const data = event && isObjectRecord(event.data) ? (event.data as AnyRecord) : undefined;
  const clerkUserId: string | undefined = (data?.id as string) || (isObjectRecord(data?.user) ? ((data?.user as AnyRecord).id as string) : undefined);
  const email = isObjectRecord(data?.email_addresses)
    ? undefined
    : Array.isArray((data as AnyRecord | undefined)?.email_addresses)
      ? String(((data as AnyRecord).email_addresses as unknown[])[0] && (isObjectRecord(((data as AnyRecord).email_addresses as unknown[])[0]) ? (((data as AnyRecord).email_addresses as unknown[])[0] as AnyRecord)['email_address'] : ''))
      : (data?.email_address as string | undefined);
  const firstName = (data?.first_name as string | undefined) || (data?.firstName as string | undefined);
  const lastName = (data?.last_name as string | undefined) || (data?.lastName as string | undefined);
  const imageUrl = (data?.image_url as string | undefined) || (data?.imageUrl as string | undefined);
  const phone = (data?.phone_number as string | undefined) || (data?.phoneNumber as string | undefined);
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return { clerkUserId, email, firstName, lastName, imageUrl, phone, name };
}

async function processUserCreatedOrUpdated(eventDoc: AnyRecord) {
  const { db } = await connectDB();
  const users = db.collection('users');
  await ensureUserIndexes();

  const occurredAt: Date | null = toDate(eventDoc._occurred_at);
  const { clerkUserId, email, firstName, lastName, imageUrl, phone, name } = extractUserFieldsFromEvent(eventDoc);
  if (!clerkUserId) return;

  const setFields: AnyRecord = {
    clerkUserId,
    email,
    firstName,
    lastName,
    name,
    imageUrl,
    phone,
    deleted: false,
    piiScrubbed: false,
  };

  // Remove undefined keys before update
  Object.keys(setFields).forEach((k) => {
    if (typeof setFields[k] === 'undefined') delete setFields[k];
  });

  const orClauses: AnyRecord[] = [{ last_event_occurred_at: { $exists: false } }];
  if (occurredAt) orClauses.push({ last_event_occurred_at: { $lte: occurredAt } });
  const filter: AnyRecord = { clerkUserId, $or: orClauses };

  const update: AnyRecord = {
    $set: { ...setFields, last_event_occurred_at: occurredAt || new Date(0) },
  };

  await users.updateOne(filter, update, { upsert: true });
}

// // Archival stub (S3+KMS) - replace with real implementation
// async function archiveRawEvent(_eventId: string, _raw: AnyRecord) {
//   // TODO: Upload raw event to encrypted storage (e.g., S3 with KMS) and store reference
//   return; // no-op for now
// }

async function claimNextBatch() {
  const { db } = await connectDB();
  const inbox = db.collection('clerk_events');
  const now = new Date();
  const claimed: AnyRecord[] = [];

  // modest parallel claim attempts to reduce latency
  const attempts = Math.min(BATCH_SIZE, CLAIM_CONCURRENCY);
  const claimOnce = async () => {
    const result = await inbox.findOneAndUpdate(
      { processed: false, $or: [{ processing: { $exists: false } }, { processing: false }] },
      { $set: { processing: true, processing_started_at: now, processing_last_heartbeat: now } },
      { returnDocument: 'after', sort: { _received_at: 1 } }
    );
    if (result && result.value) claimed.push(result.value);
  };

  await Promise.all(new Array(attempts).fill(0).map(() => claimOnce()));

  // If we still need more, finish sequentially
  while (claimed.length < BATCH_SIZE) {
    const result = await inbox.findOneAndUpdate(
      { processed: false, $or: [{ processing: { $exists: false } }, { processing: false }] },
      { $set: { processing: true, processing_started_at: now, processing_last_heartbeat: now } },
      { returnDocument: 'after', sort: { _received_at: 1 } }
    );
    if (!result || !result.value) break;
    claimed.push(result.value);
  }

  return claimed;
}

async function markProcessed(_event_id: string) {
  const { db } = await connectDB();
  const inbox = db.collection('clerk_events');
  await inbox.updateOne(
    { _event_id },
    { $set: { processed: true, processing: false, processed_at: new Date() } }
  );
}

async function markFailed(_event_id: string, errMsg: string) {
  const { db } = await connectDB();
  const inbox = db.collection('clerk_events');
  await inbox.updateOne(
    { _event_id },
    { $set: { processing: false, last_error: errMsg }, $inc: { attempts: 1 } }
  );
  const doc = await inbox.findOne({ _event_id });
  if (((doc as AnyRecord)?.attempts as number | undefined) && ((doc as AnyRecord)?.attempts as number) >= 5) {
    await inbox.updateOne({ _event_id }, { $set: { dlq: true } });
    // Minimal alert (replace with your alerting SDK)
    console.error('clerk-projector-dlq', { eventId: _event_id, attempts: (doc as AnyRecord)?.attempts });
    try {
      await fetch('https://n8n-production-a826.up.railway.app/webhook/error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: `clerk-projector-dlq eventId=${_event_id} attempts=${String((doc as AnyRecord)?.attempts)}` }),
      });
    } catch (notifyErr: unknown) {
      const msg = notifyErr instanceof Error ? notifyErr.message : 'unknown';
      console.error('clerk-projector-dlq-notify-failed', { err: msg, eventId: _event_id });
    }
  }
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CLERK_WEBHOOK_SECRET;
  const header = req.headers.get('x-cron-secret');
  if (!cronSecret || header !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await reclaimStale();

  const claimed = await claimNextBatch();
  console.log('clerk-projector-claimed', { count: claimed.length });
  if (claimed.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let success = 0;
  // Hoist DB handle for inbox to reuse within the loop
  const { db } = await connectDB();
  const inbox = db.collection('clerk_events');
  for (const doc of claimed) {
    try {
      const type: string = String(doc.type);
      // heartbeat before heavy work
      await inbox.updateOne(
        { _event_id: String(doc._event_id) },
        { $set: { processing_last_heartbeat: new Date() } }
      );
      if (type === 'user.deleted') {
        await processUserDeleted(doc as AnyRecord);
      } else if (type === 'user.created' || type === 'user.updated') {
        await processUserCreatedOrUpdated(doc as AnyRecord);
      }
      // heartbeat after processing, before finalize
      await inbox.updateOne(
        { _event_id: String(doc._event_id) },
        { $set: { processing_last_heartbeat: new Date() } }
      );
      // Other event types can be handled here with similar guards
      await markProcessed(String(doc._event_id));
      // Optional archival call (disabled/no-op by default)
      // await archiveRawEvent(String(doc._event_id), doc as AnyRecord);
      success += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('clerk-projector', { err: message, eventId: doc._event_id, type: doc.type });
      await markFailed(doc._event_id as string, message);
    }
  }
  console.log('clerk-projector-processed', { processed: success, claimed: claimed.length });
  return NextResponse.json({ ok: true, processed: success, claimed: claimed.length });
}


