import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { IIntegrationConfig, IntegrationConfigCollection } from '@/models/IntegrationConfig';

const SALESFORCE_LOGIN_URL = 'https://login.salesforce.com';
const SALESFORCE_CLIENT_ID = process.env.SALESFORCE_CLIENT_ID;
const SALESFORCE_CLIENT_SECRET = process.env.SALESFORCE_CLIENT_SECRET;
const SALESFORCE_REDIRECT_URI = process.env.SALESFORCE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/salesforce/callback`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('Salesforce OAuth error:', error);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?salesforce=error&error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?salesforce=error&error=missing_code_or_state`);
    }

    // Decode state to get userId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId } = stateData;

    // Exchange code for access token
    const tokenResponse = await fetch(`${SALESFORCE_LOGIN_URL}/services/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: SALESFORCE_CLIENT_ID!,
        client_secret: SALESFORCE_CLIENT_SECRET!,
        redirect_uri: SALESFORCE_REDIRECT_URI,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?salesforce=error&error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, instance_url } = tokenData;

    // Save integration config
    const { db } = await connectDB();
    const integrationConfig: IIntegrationConfig = {
      type: 'salesforce',
      credentials: {
        accessToken: access_token,
        refreshToken: refresh_token,
        accountId: instance_url,
      },
      settings: {
        autoSync: true,
        syncInterval: 15, // 15 minutes
        lastSyncAt: new Date(),
        fieldMappings: {
          firstName: 'FirstName',
          lastName: 'LastName',
          email: 'Email',
          phone: 'Phone',
          companyName: 'Company',
          jobTitle: 'Title',
          linkedinUrl: 'LinkedIn_URL__c',
          notes: 'Description',
        },
      },
      isActive: true,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Check if integration already exists
    const existingConfig = await db.collection<IIntegrationConfig>(IntegrationConfigCollection)
      .findOne({ userId, type: 'salesforce' });

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
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?salesforce=connected`);

  } catch (error) {
    console.error('Salesforce callback error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/leads?salesforce=error&error=callback_failed`);
  }
}
