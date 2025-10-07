import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 });

    const { fileName, fileType } = await request.json();
    if (!fileName || !fileType) {
      return NextResponse.json({ error: 'Missing fileName or fileType' }, { status: 400 });
    }

    const bucket = process.env.S3_BUCKET as string;
    const region = process.env.S3_REGION as string;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID as string;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY as string;

    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 });
    }

    const key = `orgs/${orgId}/lines/profile-images/${Date.now()}-${encodeURIComponent(fileName)}`;
    const useAcl = process.env.S3_USE_ACL === 'true';

    const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: fileType, ...(useAcl ? { ACL: 'public-read' } : {}) });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 });

    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    return NextResponse.json({ uploadUrl: url, publicUrl, key, useAcl });
  } catch (err) {
    console.error('s3 presign error', err);
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }
}


