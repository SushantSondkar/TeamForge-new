/**
 * utils/emailTemplates.js
 * 
 * Reusable HTML and Plain Text Email Templates for TeamForge.
 * Includes TeamForge branding, responsive layout, primary CTA button,
 * and accessible plain-text fallbacks.
 */

/**
 * Retrieve sanitized base application URL from environment.
 * Defaults to http://localhost:8080 if APP_BASE_URL is not set.
 * 
 * @returns {string} Base URL without trailing slash
 */
function getBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
}

/**
 * Common HTML email layout wrapper.
 * 
 * @param {Object} params
 * @param {string} params.title
 * @param {string} params.heading
 * @param {string} params.bodyHtml
 * @param {string} params.buttonText
 * @param {string} params.actionUrl
 * @param {string} [params.disclaimer]
 * @returns {string} Rendered HTML string
 */
function renderEmailLayout({ title, heading, bodyHtml, buttonText, actionUrl, disclaimer }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); text-align: left;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px;">
              <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">TeamForge</span>
              <span style="display: block; font-size: 12px; color: #94a3b8; margin-top: 4px;">KKWIEER Campus Hackathon Platform</span>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #0f172a;">${heading}</h2>
              <div style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                ${bodyHtml}
              </div>
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #2563eb;">
                    <a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">${buttonText}</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 8px 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                If the button above does not work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 13px; word-break: break-all;">
                <a href="${actionUrl}" style="color: #2563eb; text-decoration: underline;">${actionUrl}</a>
              </p>
              ${disclaimer ? `
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                ${disclaimer}
              </p>` : ""}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                TeamForge · K.K. Wagh Institute of Engineering Education & Research (KKWIEER)
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Common Plain Text email wrapper.
 * 
 * @param {Object} params
 * @param {string} params.heading
 * @param {string} params.bodyText
 * @param {string} params.buttonText
 * @param {string} params.actionUrl
 * @param {string} [params.disclaimer]
 * @returns {string} Rendered plain text
 */
function renderPlainTextLayout({ heading, bodyText, buttonText, actionUrl, disclaimer }) {
  let text = `TeamForge — KKWIEER Campus Hackathon Platform\n`;
  text += `==================================================\n\n`;
  text += `${heading}\n\n`;
  text += `${bodyText}\n\n`;
  text += `${buttonText}:\n${actionUrl}\n\n`;
  if (disclaimer) {
    text += `--------------------------------------------------\n`;
    text += `${disclaimer}\n\n`;
  }
  text += `--------------------------------------------------\n`;
  text += `TeamForge · K.K. Wagh Institute of Engineering Education & Research\n`;
  return text;
}

/**
 * Verification Email Template
 * 
 * @param {Object} params
 * @param {string} [params.name] - User's name
 * @param {string} [params.token] - Verification token
 * @param {string} [params.url] - Direct URL override
 * @returns {{ subject: string, text: string, html: string }}
 */
function verifyEmail({ name, token, url }) {
  const baseUrl = getBaseUrl();
  const actionUrl = url || `${baseUrl}/verify-email?token=${encodeURIComponent(token || "")}`;
  const displayName = name ? name.trim() : "Student";
  const subject = "Verify your TeamForge account";
  const heading = "Verify Your Institutional Email";

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello <strong>${displayName}</strong>,</p>
    <p style="margin: 0 0 12px 0;">Thank you for registering on <strong>TeamForge</strong>. Please verify your institutional email address to activate your account and start finding hackathon teammates.</p>
  `;

  const bodyText = `Hello ${displayName},\n\nThank you for registering on TeamForge. Please verify your institutional email address to activate your account and start finding hackathon teammates.`;

  const disclaimer = "If you did not sign up for TeamForge, please ignore this email. No account will be activated without verification.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: "Verify Email Address",
    actionUrl,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: "Verify Email Address",
    actionUrl,
    disclaimer
  });

  return { subject, text, html };
}

/**
 * Password Reset Email Template
 * 
 * @param {Object} params
 * @param {string} [params.name] - User's name
 * @param {string} [params.token] - Password reset token
 * @param {string} [params.url] - Direct URL override
 * @returns {{ subject: string, text: string, html: string }}
 */
function resetPassword({ name, token, url }) {
  const baseUrl = getBaseUrl();
  const actionUrl = url || `${baseUrl}/reset-password?token=${encodeURIComponent(token || "")}`;
  const displayName = name ? name.trim() : "Student";
  const subject = "Reset your TeamForge password";
  const heading = "Reset Your Password";

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello <strong>${displayName}</strong>,</p>
    <p style="margin: 0 0 12px 0;">We received a request to reset the password for your TeamForge account. Click the button below to choose a new password.</p>
    <p style="margin: 0 0 12px 0; color: #dc2626; font-size: 13px;">This password reset link will expire in 30 minutes for your security.</p>
  `;

  const bodyText = `Hello ${displayName},\n\nWe received a request to reset the password for your TeamForge account. Please visit the link below to choose a new password.\n\nNote: This link expires in 30 minutes for security.`;

  const disclaimer = "If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: "Reset Password",
    actionUrl,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: "Reset Password",
    actionUrl,
    disclaimer
  });

  return { subject, text, html };
}

/**
 * Password Changed Confirmation Email Template
 * 
 * @param {Object} params
 * @param {string} [params.name] - User's name
 * @returns {{ subject: string, text: string, html: string }}
 */
function passwordChanged({ name }) {
  const baseUrl = getBaseUrl();
  const loginUrl = `${baseUrl}/login`;
  const displayName = name ? name.trim() : "Student";
  const subject = "Your TeamForge password was changed";
  const heading = "Password Changed Successfully";

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello <strong>${displayName}</strong>,</p>
    <p style="margin: 0 0 12px 0;">This email confirms that the password for your TeamForge account was recently changed.</p>
    <p style="margin: 0 0 12px 0; color: #475569;">For your security, all active sessions on other devices have been invalidated.</p>
  `;

  const bodyText = `Hello ${displayName},\n\nThis email confirms that the password for your TeamForge account was recently changed.\n\nFor your security, all active sessions on other devices have been invalidated.`;

  const disclaimer = "If you did NOT make this change, please contact campus support or request a password reset immediately to secure your account.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: "Log In to TeamForge",
    actionUrl: loginUrl,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: "Log In to TeamForge",
    actionUrl: loginUrl,
    disclaimer
  });

  return { subject, text, html };
}

module.exports = {
  getBaseUrl,
  renderEmailLayout,
  renderPlainTextLayout,
  verifyEmail,
  resetPassword,
  passwordChanged
};

