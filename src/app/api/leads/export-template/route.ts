import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Create CSV template with mandatory fields and sample custom fields
    const csvTemplate = [
      'firstName,lastName,email,phone,companyName,jobTitle,linkedinUrl,notes,customField1,customField2',
      'John,Doe,john.doe@example.com,+1-555-0123,Acme Corp,Software Engineer,https://linkedin.com/in/johndoe,Interested in our product,Value1,Value2',
      'Jane,Smith,jane.smith@example.com,+1-555-0124,Tech Solutions,Product Manager,https://linkedin.com/in/janesmith,Referred by John,Value3,Value4'
    ].join('\n');

    // Set headers for CSV download
    const headers = new Headers();
    headers.set('Content-Type', 'text/csv');
    headers.set('Content-Disposition', 'attachment; filename="leads_template.csv"');
    headers.set('Cache-Control', 'no-cache');

    return new NextResponse(csvTemplate, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('Error generating CSV template:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSV template' },
      { status: 500 }
    );
  }
}
