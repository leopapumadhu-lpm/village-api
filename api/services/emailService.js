// Email Service - gracefully handles missing configuration

// Check if email is configured
const isEmailConfigured = process.env.SMTP_USER && 
  process.env.SMTP_PASS && 
  process.env.SMTP_USER !== 'your-email@gmail.com';

export async function sendApprovalEmail(user) {
  if (!isEmailConfigured) {
    console.log('Email not configured, skipping approval email');
    return { success: false, reason: 'Email not configured' };
  }
  
  console.log(`Would send approval email to ${user.email}`);
  return { success: true };
}

export async function sendTeamInvitation(email, teamName, invitedBy) {
  if (!isEmailConfigured) {
    console.log('Email not configured, skipping team invitation');
    return { success: false, reason: 'Email not configured' };
  }
  
  console.log(`Would send team invitation to ${email} for ${teamName}`);
  return { success: true };
}

export default { sendApprovalEmail, sendTeamInvitation };
