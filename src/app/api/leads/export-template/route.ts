import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Create CSV template with mandatory fields, alternate contact fields, and sample custom fields
    const csvTemplate = [
      'firstName,lastName,email,phone,altPhone1,altPhone2,altPhone3,altEmail1,altEmail2,altEmail3,companyName,jobTitle,linkedinUrl,notes,customField1,customField2',
      'Bharadwaj,Giridhar,goforbg@gmail.com,+919042956129,+15550124,+15550125,,john.alt@example.com,john.work@example.com,,Acme Corp,Software Engineer,https://linkedin.com/in/johndoe,Interested in our product,Value1,Value2',
      'Jane,Smith,jane.smith@example.com,+15550124,+15550125,,,jane.alt@example.com,,,Tech Solutions,Product Manager,https://linkedin.com/in/janesmith,Referred by John,Value3,Value4'
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
