import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || process.env.VITE_API_URL || 'https://app.villageapi.com').replace(/\/+$/, '');

// Cache for email templates
const templateCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Validate required email configuration
function validateEmailConfig() {
  const required = ['SMTP_USER', 'SMTP_PASS', 'SENDER_EMAIL'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing email configuration: ${missing.join(', ')}`);
  }

  return missing.length === 0;
}

// Configure SMTP transporter with better error handling
let transporter = null;
let isEmailConfigured = false;

function getTransporter() {
  if (transporter) return transporter;

  const hasConfig = validateEmailConfig();
  if (!hasConfig) {
    console.warn('⚠️ Email not configured. Email features will be disabled.');
    isEmailConfigured = false;
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      pool: true, // Use connection pooling
      maxConnections: 5,
      maxMessages: 100,
      rateLimit: 10, // Max 10 messages per second
      logger: process.env.NODE_ENV === 'development',
    });

    // Verify connection
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email transporter verification failed:', error.message);
        isEmailConfigured = false;
        transporter = null;
      } else {
        console.log('✅ Email transporter ready');
        isEmailConfigured = true;
      }
    });

    return transporter;
  } catch (error) {
    console.error('❌ Failed to create email transporter:', error.message);
    isEmailConfigured = false;
    return null;
  }
}

// Helper to load email templates with caching
async function loadTemplate(templateName) {
  try {
    // Check cache first
    const cached = templateCache.get(templateName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.content;
    }

    const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);

    try {
      const content = await fs.readFile(templatePath, 'utf-8');

      // Update cache
      templateCache.set(templateName, {
        content,
        timestamp: Date.now(),
      });

      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`Template not found: ${templateName}.html`);
        // Return fallback HTML template
        return getFallbackTemplate(templateName);
      }
      throw error;
    }
  } catch (error) {
    console.error(`Failed to load template ${templateName}:`, error.message);
    return getFallbackTemplate(templateName);
  }
}

// Fallback HTML templates
function getFallbackTemplate(templateName) {
  const templates = {
    approval: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Village API!</h2>
        <p>Dear {{businessName}},</p>
        <p>Your account has been approved! You can now start using the Village API.</p>
        <p><a href="{{loginUrl}}" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Your Account</a></p>
        <p>Need help? Contact us at {{supportEmail}}</p>
        <p>Best regards,<br/>Village API Team</p>
      </div>
    `,
    'payment-received': `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Payment Received</h2>
        <p>Dear {{businessName}},</p>
        <p>Thank you for your payment!</p>
        <p><strong>Invoice #{{invoiceNumber}}</strong><br/>
        Amount: {{amount}}<br/>
        Plan: {{planType}}<br/>
        Date: {{date}}</p>
        <p><a href="{{invoiceUrl}}" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Invoice</a></p>
        <p>Best regards,<br/>Village API Team</p>
      </div>
    `,
  };

  return templates[templateName] || `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Village API Notification</h2>
      <p>Dear {{businessName}},</p>
      <p>This is an automated notification from Village API.</p>
      <p>Need help? Contact us at {{supportEmail}}</p>
      <p>Best regards,<br/>Village API Team</p>
    </div>
  `;
}

// Replace variables in template with HTML escaping
function replaceVariables(template, variables) {
  let html = template;
  Object.entries(variables).forEach(([key, value]) => {
    // Escape HTML special characters for security
    const escapedValue = String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    html = html.replace(new RegExp(`{{${key}}}`, 'g'), escapedValue);
  });
  return html;
}

// Retry logic for email sending
async function sendWithRetry(mailOptions, maxRetries = 3, delay = 1000) {
  const transport = getTransporter();
  if (!transport || !isEmailConfigured) {
    console.warn('Email not configured, skipping send');
    return { success: false, error: 'Email not configured', skipped: true };
  }

  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const info = await transport.sendMail(mailOptions);
      console.log(`✓ Email sent: ${mailOptions.subject} to ${mailOptions.to} (${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      lastError = error;
      console.error(`Email send attempt ${i + 1} failed:`, error.message);

      // Don't retry on certain errors
      if (error.code === 'EAUTH' || error.code === 'EENVELOPE') {
        break;
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * 2 ** i));
      }
    }
  }

  console.error(`✗ Failed to send email after ${maxRetries} attempts:`, lastError?.message);
  return { success: false, error: lastError?.message };
}

/**
 * Send approval email (spec 8.2)
 * Sent when admin approves a pending user registration
 */
export async function sendApprovalEmail(user) {
  if (!user?.email || !user?.businessName) {
    console.error('Invalid user data for approval email');
    return { success: false, error: 'Invalid user data' };
  }

  try {
    const template = await loadTemplate('approval');
    const loginUrl = `${FRONTEND_BASE_URL}/login`;

    const html = replaceVariables(template, {
      businessName: user.businessName,
      email: user.email,
      loginUrl,
      supportEmail: process.env.SENDER_EMAIL || 'support@villageapi.com',
      currentYear: new Date().getFullYear().toString(),
    });

    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: 'Your Village API Account Has Been Approved! 🎉',
      html,
      text: `Hello ${user.businessName},\n\nYour Village API account has been approved!\n\nLogin here: ${loginUrl}\n\nBest regards,\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Approval email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send payment confirmation email (spec 11.3)
 * Sent after payment is successfully processed
 */
export async function sendPaymentConfirmation(user, invoice) {
  if (!user?.email || !invoice) {
    console.error('Invalid data for payment confirmation email');
    return { success: false, error: 'Invalid user or invoice data' };
  }

  try {
    const template = await loadTemplate('payment-received');
    const amountFormatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(invoice.total);

    const html = replaceVariables(template, {
      businessName: user.businessName,
      invoiceNumber: invoice.invoiceNumber,
      amount: amountFormatted,
      planType: invoice.subscription?.planType || 'MONTHLY',
      date: new Date(invoice.issuedAt).toLocaleDateString('en-IN'),
      nextBillingDate: invoice.subscription?.currentPeriodEnd
        ? new Date(invoice.subscription.currentPeriodEnd).toLocaleDateString('en-IN')
        : 'Not available',
      supportEmail: process.env.SENDER_EMAIL || 'support@villageapi.com',
      invoiceUrl: invoice.pdfUrl || '#',
      currentYear: new Date().getFullYear().toString(),
    });

    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: `✅ Payment Received - Invoice #${invoice.invoiceNumber}`,
      html,
      text: `Dear ${user.businessName},\n\nPayment received: ${amountFormatted}\nInvoice #${invoice.invoiceNumber}\n\nThank you for your payment!\n\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Payment confirmation email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send quota usage alert (spec 11.3)
 * Sent when user reaches 80% or 95% of daily quota
 */
export async function sendUsageAlert(user, usagePercentage, currentUsage, dailyLimit) {
  if (!user?.email) {
    console.error('Invalid user data for usage alert');
    return { success: false, error: 'Invalid user data' };
  }

  if (usagePercentage < 80) {
    console.log(`Usage ${usagePercentage}% below threshold, skipping alert`);
    return { success: true, skipped: true };
  }

  try {
    const templateName = usagePercentage >= 95 ? 'usage-alert-95' : 'usage-alert-80';
    const template = await loadTemplate(templateName);

    const html = replaceVariables(template, {
      businessName: user.businessName,
      usagePercentage: usagePercentage.toFixed(0),
      currentUsage: currentUsage?.toLocaleString() || 'N/A',
      dailyLimit: dailyLimit?.toLocaleString() || 'N/A',
      planType: user.planType || 'FREE',
      resetTime: `${new Date().toISOString().slice(0, 10)}T23:59:59Z`,
      supportEmail: process.env.SENDER_EMAIL || 'support@villageapi.com',
      dashboardUrl: `${FRONTEND_BASE_URL}/b2b/dashboard`,
      currentYear: new Date().getFullYear().toString(),
    });

    const subject = usagePercentage >= 95
      ? '⚠️ Critical: Your API quota is at 95%!'
      : '📊 Heads up: Your API quota is at 80%';

    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject,
      html,
      text: `Dear ${user.businessName},\n\nYou have used ${usagePercentage}% of your daily API quota.\n\nCurrent usage: ${currentUsage?.toLocaleString() || 'N/A'} / ${dailyLimit?.toLocaleString() || 'N/A'}\n\nConsider upgrading your plan for higher limits.\n\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Usage alert email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send quota exceeded email (spec 11.3)
 * Sent when user's daily quota is exhausted
 */
export async function sendUsageExceededEmail(user, plan, resetTime) {
  if (!user?.email) {
    console.error('Invalid user data for usage exceeded email');
    return { success: false, error: 'Invalid user data' };
  }

  try {
    const template = await loadTemplate('usage-exceeded');

    const html = replaceVariables(template, {
      businessName: user.businessName,
      planType: user.planType || 'FREE',
      dailyLimit: plan?.dailyLimit?.toLocaleString() || '5,000',
      upgradeUrl: `${FRONTEND_BASE_URL}/b2b/billing`,
      supportEmail: process.env.SENDER_EMAIL || 'support@villageapi.com',
      resetTime: resetTime || `${new Date().toISOString().slice(0, 10)}T23:59:59Z`,
      currentYear: new Date().getFullYear().toString(),
    });

    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: '⚠️ Your API quota has been exceeded',
      html,
      text: `Dear ${user.businessName},\n\nYou have exceeded your daily API quota of ${plan?.dailyLimit?.toLocaleString() || '5,000'} requests.\n\nYour quota will reset at ${resetTime}.\n\nUpgrade your plan for higher limits: ${FRONTEND_BASE_URL}/b2b/billing\n\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Usage exceeded email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send monthly invoice email (spec 11.3)
 * Sent at the end of billing period with attached or linked invoice PDF
 */
export async function sendInvoiceEmail(user, invoice) {
  if (!user?.email || !invoice) {
    console.error('Invalid data for invoice email');
    return { success: false, error: 'Invalid user or invoice data' };
  }

  try {
    const template = await loadTemplate('invoice');
    const amountFormatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(invoice.amount);
    const taxFormatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(invoice.tax);
    const totalFormatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(invoice.total);

    const html = replaceVariables(template, {
      businessName: user.businessName,
      invoiceNumber: invoice.invoiceNumber,
      amount: amountFormatted,
      tax: taxFormatted,
      total: totalFormatted,
      issuedDate: new Date(invoice.issuedAt).toLocaleDateString('en-IN'),
      dueDate: new Date(invoice.dueDate).toLocaleDateString('en-IN'),
      planType: invoice.subscription?.planType || 'MONTHLY',
      supportEmail: process.env.SENDER_EMAIL || 'support@villageapi.com',
      invoiceUrl: invoice.pdfUrl || '#',
      currentYear: new Date().getFullYear().toString(),
    });

    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: `📄 Monthly Invoice #${invoice.invoiceNumber}`,
      html,
      text: `Dear ${user.businessName},\n\nYour monthly invoice #${invoice.invoiceNumber} is ready.\n\nAmount: ${totalFormatted}\nDue date: ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}\n\nView invoice: ${invoice.pdfUrl || '#'}\n\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Invoice email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send test email (for development)
 */
export async function sendTestEmail(toEmail) {
  if (!toEmail) {
    return { success: false, error: 'Recipient email required' };
  }

  try {
    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: toEmail,
      subject: 'Test Email from Village API',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>✅ Email Configuration Test</h2>
          <p>If you received this, your email is properly configured!</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
          <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
          <hr/>
          <p>Best regards,<br/>Village API Team</p>
        </div>
      `,
      text: `Email Configuration Test\n\nIf you received this, your email is properly configured!\n\nTimestamp: ${new Date().toISOString()}\n\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Test email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send team invitation email (spec 9.2)
 * Sent when owner/admin invites member to team
 */
export async function sendTeamInvitation(user, inviteeEmail, invitationUrl, teamName) {
  if (!user?.email || !inviteeEmail || !invitationUrl) {
    console.error('Invalid data for team invitation email');
    return { success: false, error: 'Missing required invitation data' };
  }

  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You're invited to join a team! 🎉</h2>
        <p>Hi there,</p>
        <p><strong>${user.businessName}</strong> has invited you to collaborate on their Village API account${teamName ? ` (${teamName})` : ''}.</p>
        <p>As a team member, you'll be able to:</p>
        <ul>
          <li>Access API keys and usage analytics</li>
          <li>View team dashboard and metrics</li>
          <li>Collaborate on API integrations</li>
        </ul>
        <p><a href="${invitationUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation →</a></p>
        <p>This invitation will expire in 7 days.</p>
        <hr/>
        <p style="color: #666; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
        <p>Best regards,<br/>Village API Team</p>
      </div>
    `;

    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: inviteeEmail,
      subject: `Join ${user.businessName} on Village API`,
      html,
      text: `You're invited to join ${user.businessName} on Village API!\n\nAccept invitation: ${invitationUrl}\n\nThis invitation expires in 7 days.\n\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Team invitation email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(user, resetToken, resetUrl) {
  if (!user?.email || !resetToken) {
    console.error('Invalid data for password reset email');
    return { success: false, error: 'Invalid reset data' };
  }

  try {
    const resetLink = resetUrl || `${FRONTEND_BASE_URL}/reset-password?token=${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request 🔐</h2>
        <p>Dear ${user.businessName},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <p><a href="${resetLink}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password →</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <hr/>
        <p style="color: #666; font-size: 12px;">For security, never share this link with anyone.</p>
        <p>Best regards,<br/>Village API Team</p>
      </div>
    `;

    const result = await sendWithRetry({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: 'Reset Your Village API Password',
      html,
      text: `Password Reset Request\n\nClick this link to reset your password: ${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.\n\nVillage API Team`,
    });

    return result;
  } catch (error) {
    console.error('Password reset email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check email configuration status
 */
export function getEmailStatus() {
  return {
    configured: isEmailConfigured && getTransporter() !== null,
    smtpHost: process.env.SMTP_HOST || 'not configured',
    smtpPort: process.env.SMTP_PORT || 'not configured',
    senderEmail: process.env.SENDER_EMAIL || 'not configured',
    templatesLoaded: templateCache.size,
  };
}

/**
 * Warm up email templates (preload common templates)
 */
export async function warmupEmailTemplates() {
  const templates = ['approval', 'payment-received', 'usage-alert-80', 'usage-alert-95', 'usage-exceeded', 'invoice'];

  await Promise.allSettled(templates.map(async (template) => {
    try {
      await loadTemplate(template);
      console.log(`✓ Template loaded: ${template}`);
    } catch (error) {
      console.warn(`Failed to load template ${template}:`, error.message);
    }
  }));
}
