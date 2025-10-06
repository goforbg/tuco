import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

// Ensure collection indexes
let indexesEnsured = false as boolean;
async function ensureIndexes() {
  if (indexesEnsured) return;
  const { db } = await connectDB();
  try {
    await Promise.all([
      // Users collection
      db.collection('users').createIndex({ clerkUserId: 1 }, { unique: true, name: 'uniq_clerk_user_id' }),
      // Organizations collection
      db.collection('organizations').createIndex({ clerkOrgId: 1 }, { unique: true, name: 'uniq_clerk_org_id' }),
      // Permissions collection
      db.collection('permissions').createIndex({ clerkPermissionId: 1 }, { unique: true, name: 'uniq_clerk_permission_id' }),
      // Roles collection
      db.collection('roles').createIndex({ clerkRoleId: 1 }, { unique: true, name: 'uniq_clerk_role_id' }),
      // Organization memberships collection
      db.collection('organization_memberships').createIndex({ clerkMembershipId: 1 }, { unique: true, name: 'uniq_clerk_membership_id' }),
      db.collection('organization_memberships').createIndex({ clerkUserId: 1, clerkOrgId: 1 }, { name: 'user_org_idx' }),
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

// Type definitions for event data
type UserEventData = {
  id?: string;
  email_addresses?: Array<{ email_address: string }>;
  email_address?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  image_url?: string;
  imageUrl?: string;
  phone_number?: string;
  phoneNumber?: string;
};

type OrganizationEventData = {
  id?: string;
  name?: string;
  slug?: string;
  image_url?: string;
  max_allowed_memberships?: number;
  admin_delete_enabled?: boolean;
  members_count?: number;
  pending_invitations_count?: number;
};

type PermissionEventData = {
  id?: string;
  name?: string;
  key?: string;
  description?: string;
  type?: string;
};

type RoleEventData = {
  id?: string;
  name?: string;
  key?: string;
  description?: string;
  permissions?: string[];
};

type OrganizationMembershipEventData = {
  id?: string;
  user_id?: string;
  organization_id?: string;
  role?: string;
  public_metadata?: Record<string, unknown>;
  private_metadata?: Record<string, unknown>;
};

// Helper functions to extract data from different event types
function extractUserData(eventData: UserEventData) {
  const clerkUserId = eventData?.id;
  const email = eventData?.email_addresses?.[0]?.email_address || eventData?.email_address;
  const firstName = eventData?.first_name || eventData?.firstName;
  const lastName = eventData?.last_name || eventData?.lastName;
  const imageUrl = eventData?.image_url || eventData?.imageUrl;
  const phone = eventData?.phone_number || eventData?.phoneNumber;
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  
  return {
    clerkUserId,
    email,
    firstName,
    lastName,
    imageUrl,
    phone,
    name
  };
}

function extractOrganizationData(eventData: OrganizationEventData) {
  const clerkOrgId = eventData?.id;
  const name = eventData?.name;
  const slug = eventData?.slug;
  const imageUrl = eventData?.image_url;
  const maxAllowedMemberships = eventData?.max_allowed_memberships;
  const adminDeleteEnabled = eventData?.admin_delete_enabled;
  const membersCount = eventData?.members_count;
  const pendingInvitationsCount = eventData?.pending_invitations_count;
  
  return {
    clerkOrgId,
    name,
    slug,
    imageUrl,
    maxAllowedMemberships,
    adminDeleteEnabled,
    membersCount,
    pendingInvitationsCount
  };
}

function extractPermissionData(eventData: PermissionEventData) {
  const clerkPermissionId = eventData?.id;
  const name = eventData?.name;
  const key = eventData?.key;
  const description = eventData?.description;
  const type = eventData?.type;
  
  return {
    clerkPermissionId,
    name,
    key,
    description,
    type
  };
}

function extractRoleData(eventData: RoleEventData) {
  const clerkRoleId = eventData?.id;
  const name = eventData?.name;
  const key = eventData?.key;
  const description = eventData?.description;
  const permissions = eventData?.permissions || [];
  
  return {
    clerkRoleId,
    name,
    key,
    description,
    permissions
  };
}

function extractOrganizationMembershipData(eventData: OrganizationMembershipEventData) {
  const clerkMembershipId = eventData?.id;
  const clerkUserId = eventData?.user_id;
  const clerkOrgId = eventData?.organization_id;
  const role = eventData?.role;
  const publicMetadata = eventData?.public_metadata;
  const privateMetadata = eventData?.private_metadata;
  
  return {
    clerkMembershipId,
    clerkUserId,
    clerkOrgId,
    role,
    publicMetadata,
    privateMetadata
  };
}

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

  // Get raw payload for signature verification
  const payload = await req.text();
  console.log('clerk-webhook-payload-received', { 
    size: payload.length, 
    sizeKB: Math.round(payload.length / 1024) 
  });
  
  // Basic payload size guard
  if (payload.length > 200 * 1024) {
    console.error('clerk-webhook-payload-too-large', { size: payload.length });
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  
  // Verify webhook signature
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
  const eventData = isObjectRecord(eventObj['data']) ? (eventObj['data'] as Record<string, unknown>) : undefined;

  console.log('clerk-webhook-event-parsed', { 
    eventType, 
    hasData: !!eventData
  });

  if (!eventType) {
    console.error('clerk-webhook-missing-event-type');
    return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
  }

  try {
    await ensureIndexes();
    const { db } = await connectDB();

    if (!eventData) {
      console.error('clerk-webhook-no-event-data');
      return NextResponse.json({ error: 'No event data' }, { status: 400 });
    }

    // Handle user events
    if (eventType === 'user.created' || eventType === 'user.updated') {
      console.log('clerk-webhook-processing-user-event', { eventType });
      
      const { clerkUserId, email, firstName, lastName, imageUrl, phone, name } = extractUserData(eventData);
      
      if (!clerkUserId) {
        console.error('clerk-webhook-no-user-id');
        return NextResponse.json({ error: 'No user ID' }, { status: 400 });
      }

      const users = db.collection('users');
      const userDoc = {
        clerkUserId,
        email,
        firstName,
        lastName,
        name,
        imageUrl,
        phone,
        deleted: false,
        updatedAt: new Date()
      };

      // Remove undefined values
      Object.keys(userDoc).forEach(key => {
        if (userDoc[key as keyof typeof userDoc] === undefined) {
          delete userDoc[key as keyof typeof userDoc];
        }
      });

      await users.updateOne(
        { clerkUserId },
        { 
          $set: userDoc,
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      console.log('clerk-webhook-user-upserted', { clerkUserId, eventType });

    } else if (eventType === 'user.deleted') {
      console.log('clerk-webhook-processing-user-deleted');
      
      const clerkUserId = eventData.id;
      
      if (!clerkUserId) {
        console.error('clerk-webhook-no-user-id');
        return NextResponse.json({ error: 'No user ID' }, { status: 400 });
      }

      const users = db.collection('users');
      await users.updateOne(
        { clerkUserId },
        { 
          $set: { 
            deleted: true,
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      console.log('clerk-webhook-user-deleted', { clerkUserId });

    // Handle organization events
    } else if (eventType === 'organization.created' || eventType === 'organization.updated') {
      console.log('clerk-webhook-processing-organization-event', { eventType });
      
      const { clerkOrgId, name, slug, imageUrl, maxAllowedMemberships, adminDeleteEnabled, membersCount, pendingInvitationsCount } = extractOrganizationData(eventData);
      
      if (!clerkOrgId) {
        console.error('clerk-webhook-no-org-id');
        return NextResponse.json({ error: 'No organization ID' }, { status: 400 });
      }

      const organizations = db.collection('organizations');
      const orgDoc = {
        clerkOrgId,
        name,
        slug,
        imageUrl,
        maxAllowedMemberships,
        adminDeleteEnabled,
        membersCount,
        pendingInvitationsCount,
        deleted: false,
        updatedAt: new Date()
      };

      // Remove undefined values
      Object.keys(orgDoc).forEach(key => {
        if (orgDoc[key as keyof typeof orgDoc] === undefined) {
          delete orgDoc[key as keyof typeof orgDoc];
        }
      });

      await organizations.updateOne(
        { clerkOrgId },
        { 
          $set: orgDoc,
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      console.log('clerk-webhook-organization-upserted', { clerkOrgId, eventType });

    } else if (eventType === 'organization.deleted') {
      console.log('clerk-webhook-processing-organization-deleted');
      
      const clerkOrgId = eventData.id;
      
      if (!clerkOrgId) {
        console.error('clerk-webhook-no-org-id');
        return NextResponse.json({ error: 'No organization ID' }, { status: 400 });
      }

      const organizations = db.collection('organizations');
      await organizations.updateOne(
        { clerkOrgId },
        { 
          $set: { 
            deleted: true,
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      console.log('clerk-webhook-organization-deleted', { clerkOrgId });

    // Handle permission events
    } else if (eventType === 'permission.created' || eventType === 'permission.updated') {
      console.log('clerk-webhook-processing-permission-event', { eventType });
      
      const { clerkPermissionId, name, key, description, type } = extractPermissionData(eventData);
      
      if (!clerkPermissionId) {
        console.error('clerk-webhook-no-permission-id');
        return NextResponse.json({ error: 'No permission ID' }, { status: 400 });
      }

      const permissions = db.collection('permissions');
      const permissionDoc = {
        clerkPermissionId,
        name,
        key,
        description,
        type,
        deleted: false,
        updatedAt: new Date()
      };

      // Remove undefined values
      Object.keys(permissionDoc).forEach(key => {
        if (permissionDoc[key as keyof typeof permissionDoc] === undefined) {
          delete permissionDoc[key as keyof typeof permissionDoc];
        }
      });

      await permissions.updateOne(
        { clerkPermissionId },
        { 
          $set: permissionDoc,
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      console.log('clerk-webhook-permission-upserted', { clerkPermissionId, eventType });

    } else if (eventType === 'permission.deleted') {
      console.log('clerk-webhook-processing-permission-deleted');
      
      const clerkPermissionId = eventData.id;
      
      if (!clerkPermissionId) {
        console.error('clerk-webhook-no-permission-id');
        return NextResponse.json({ error: 'No permission ID' }, { status: 400 });
      }

      const permissions = db.collection('permissions');
      await permissions.updateOne(
        { clerkPermissionId },
        { 
          $set: { 
            deleted: true,
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      console.log('clerk-webhook-permission-deleted', { clerkPermissionId });

    // Handle role events
    } else if (eventType === 'role.created' || eventType === 'role.updated') {
      console.log('clerk-webhook-processing-role-event', { eventType });
      
      const { clerkRoleId, name, key, description, permissions } = extractRoleData(eventData);
      
      if (!clerkRoleId) {
        console.error('clerk-webhook-no-role-id');
        return NextResponse.json({ error: 'No role ID' }, { status: 400 });
      }

      const roles = db.collection('roles');
      const roleDoc = {
        clerkRoleId,
        name,
        key,
        description,
        permissions,
        deleted: false,
        updatedAt: new Date()
      };

      // Remove undefined values
      Object.keys(roleDoc).forEach(key => {
        if (roleDoc[key as keyof typeof roleDoc] === undefined) {
          delete roleDoc[key as keyof typeof roleDoc];
        }
      });

      await roles.updateOne(
        { clerkRoleId },
        { 
          $set: roleDoc,
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      console.log('clerk-webhook-role-upserted', { clerkRoleId, eventType });

    } else if (eventType === 'role.deleted') {
      console.log('clerk-webhook-processing-role-deleted');
      
      const clerkRoleId = eventData.id;
      
      if (!clerkRoleId) {
        console.error('clerk-webhook-no-role-id');
        return NextResponse.json({ error: 'No role ID' }, { status: 400 });
      }

      const roles = db.collection('roles');
      await roles.updateOne(
        { clerkRoleId },
        { 
          $set: { 
            deleted: true,
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      console.log('clerk-webhook-role-deleted', { clerkRoleId });

    // Handle organization membership events
    } else if (eventType === 'organizationMembership.created' || eventType === 'organizationMembership.updated') {
      console.log('clerk-webhook-processing-membership-event', { eventType });
      
      const { clerkMembershipId, clerkUserId, clerkOrgId, role, publicMetadata, privateMetadata } = extractOrganizationMembershipData(eventData);
      
      if (!clerkMembershipId || !clerkUserId || !clerkOrgId) {
        console.error('clerk-webhook-incomplete-membership-data', { clerkMembershipId, clerkUserId, clerkOrgId });
        return NextResponse.json({ error: 'Incomplete membership data' }, { status: 400 });
      }

      const memberships = db.collection('organization_memberships');
      const membershipDoc = {
        clerkMembershipId,
        clerkUserId,
        clerkOrgId,
        role,
        publicMetadata,
        privateMetadata,
        deleted: false,
        updatedAt: new Date()
      };

      // Remove undefined values
      Object.keys(membershipDoc).forEach(key => {
        if (membershipDoc[key as keyof typeof membershipDoc] === undefined) {
          delete membershipDoc[key as keyof typeof membershipDoc];
        }
      });

      await memberships.updateOne(
        { clerkMembershipId },
        { 
          $set: membershipDoc,
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      console.log('clerk-webhook-membership-upserted', { clerkMembershipId, eventType });

    } else if (eventType === 'organizationMembership.deleted') {
      console.log('clerk-webhook-processing-membership-deleted');
      
      const clerkMembershipId = eventData.id;
      
      if (!clerkMembershipId) {
        console.error('clerk-webhook-no-membership-id');
        return NextResponse.json({ error: 'No membership ID' }, { status: 400 });
      }

      const memberships = db.collection('organization_memberships');
      await memberships.updateOne(
        { clerkMembershipId },
        { 
          $set: { 
            deleted: true,
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      console.log('clerk-webhook-membership-deleted', { clerkMembershipId });

    } else {
      console.log('clerk-webhook-unsupported-event-type', { eventType });
    }

    const duration = Date.now() - startTime;
    console.log('clerk-webhook-complete', { 
      eventType, 
      durationMs: duration 
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('clerk-webhook', { err: message });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


