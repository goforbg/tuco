import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';

const HUBSPOT_OAUTH_BASE = 'https://app.hubspot.com/oauth';
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/hubspot/callback`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('HubSpot OAuth error:', error);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?hubspot=error&error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?hubspot=error&error=missing_code_or_state`);
    }

    // Decode state to get userId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId } = stateData;

    // Exchange code for access token
    const tokenResponse = await fetch(`${HUBSPOT_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUBSPOT_CLIENT_ID!,
        client_secret: HUBSPOT_CLIENT_SECRET!,
        redirect_uri: HUBSPOT_REDIRECT_URI,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?hubspot=error&error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, hub_id } = tokenData;

    // Save integration config
    const { db } = await connectDB();
    const integrationConfig: IIntegrationConfig = {
      type: 'hubspot',
      credentials: {
        accessToken: access_token,
        refreshToken: refresh_token,
        accountId: hub_id,
      },
      settings: {
        autoSync: true,
        syncInterval: 15, // 15 minutes
        lastSyncAt: new Date(),
        fieldMappings: {
          firstName: 'firstname',
          lastName: 'lastname',
          email: 'email',
          phone: 'phone',
          companyName: 'company',
          jobTitle: 'jobtitle',
          linkedinUrl: 'linkedin_url',
          notes: 'notes',
        },
      },
      isActive: true,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Check if integration already exists
    const existingConfig = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
      .findOne({ userId, type: 'hubspot' });

    if (existingConfig) {
      await db.collection<IIntegrationConfig>(IntegrationConfigCollection).updateOne(
        { _id: existingConfig._id },
        { $set: integrationConfig }
      );
    } else {
      await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
        .insertOne(integrationConfig);
    }

    // Redirect back to leads page with success
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?hubspot=connected`);

  } catch (error) {
    console.error('HubSpot callback error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?hubspot=error&error=callback_failed`);
  }
}
