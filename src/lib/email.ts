import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email notification
 * 
 * Usage:
 * - Configure SMTP settings via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error('SMTP configuration missing');
      return { success: false, error: 'SMTP configuration missing' };
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // Send email
    await transporter.sendMail({
      from: `Tuco AI <${smtpUser}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    console.log(`Email sent successfully to ${options.to}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Sends a health check failure notification to the line owner
 */
export async function sendHealthCheckFailureEmail(
  lineEmail: string,
  linePhone: string,
  failureReasons: string[]
): Promise<{ success: boolean; error?: string }> {
  const subject = '⚠️ Tuco AI - Line Health Check Failed';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Line Health Check Failed</h2>
      <p>We've detected that your line is experiencing issues:</p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0;">
        <p style="margin: 0;"><strong>Line Details:</strong></p>
        <p style="margin: 8px 0;"><strong>Phone:</strong> ${linePhone}</p>
        <p style="margin: 8px 0;"><strong>Email:</strong> ${lineEmail}</p>
      </div>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0;">
        <p style="margin: 0;"><strong>Issues Detected:</strong></p>
        <ul>
          ${failureReasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </div>
      
      <p>We're investigating the issue and will keep you updated. In the meantime, please check your device connection.</p>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">
        This is an automated message from Tuco AI.<br>
        If you have questions, please contact support.
      </p>
    </div>
  `;

  return sendEmail({
    to: lineEmail,
    subject,
    html,
  });
}

