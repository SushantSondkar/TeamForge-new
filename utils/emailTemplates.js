/**
 * utils/emailTemplates.js
 * 
 * Reusable HTML and Plain Text Email Templates for TeamForge.
 * Includes TeamForge branding, responsive layout, primary CTA button,
 * and accessible plain-text fallbacks.
 */

const { formatDate, formatDateTime, formatTime } = require("./dateUtils");

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
  const baseUrl = getBaseUrl();
  const logoUrl = `${baseUrl}/images/logo-horizontal.png`;

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
              <a href="${baseUrl}" style="text-decoration: none; display: inline-block;">
                <img src="${logoUrl}" alt="TeamForge" width="160" height="38" style="display: block; border: 0; max-height: 38px; width: auto; color: #ffffff; font-size: 20px; font-weight: 700;">
              </a>
              <span style="display: block; font-size: 12px; color: #94a3b8; margin-top: 6px;">KKWIEER Campus Hackathon Platform</span>
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
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
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

/**
 * 24h Action Reminder Email Template
 */
function actionReminder({ name, role, projectName, direction = "INVITE", actionUrl }) {
  const baseUrl = getBaseUrl();
  const url = actionUrl || `${baseUrl}/notifications`;
  const displayName = name ? name.trim() : "Student";
  const actionType = direction === "INVITE" ? "team invite" : "application";
  const subject = `Reminder: Pending ${actionType} for ${role}`;
  const heading = "Reminder: Action Required on TeamForge";

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello <strong>${displayName}</strong>,</p>
    <p style="margin: 0 0 12px 0;">You have a pending ${actionType} for <strong>${role}</strong> in <strong>${projectName || "Team"}</strong>.</p>
    <p style="margin: 0 0 12px 0; color: #475569;">Please review and respond to keep team formations moving forward.</p>
  `;

  const bodyText = `Hello ${displayName},\n\nYou have a pending ${actionType} for ${role} in ${projectName || "Team"}.\n\nPlease review and respond to keep team formations moving forward.`;

  const disclaimer = "You can manage your notification preferences anytime from your profile settings.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: "Review Request",
    actionUrl: url,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: "Review Request",
    actionUrl: url,
    disclaimer
  });

  return { subject, text, html };
}

/**
 * Closing Soon 24h Warning Email Template
 */
function actionClosingSoon({ name, role, projectName, direction = "INVITE", actionUrl }) {
  const baseUrl = getBaseUrl();
  const url = actionUrl || `${baseUrl}/notifications`;
  const displayName = name ? name.trim() : "Student";
  const actionType = direction === "INVITE" ? "team invite" : "application";
  const subject = `Closing Soon: ${actionType} for ${role} expires in 24 hours`;
  const heading = "Closing Soon: 24-Hour Expiry Warning";

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello <strong>${displayName}</strong>,</p>
    <p style="margin: 0 0 12px 0;">Your pending ${actionType} for <strong>${role}</strong> in <strong>${projectName || "Team"}</strong> will expire within <strong>24 hours</strong>.</p>
    <p style="margin: 0 0 12px 0; color: #b45309;">If no action is taken, the request will automatically expire and candidate openings will be released.</p>
  `;

  const bodyText = `Hello ${displayName},\n\nYour pending ${actionType} for ${role} in ${projectName || "Team"} will expire within 24 hours.\n\nIf no action is taken, the request will automatically expire.`;

  const disclaimer = "You can manage your notification preferences anytime from your profile settings.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: "Respond Now",
    actionUrl: url,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: "Respond Now",
    actionUrl: url,
    disclaimer
  });

  return { subject, text, html };
}

/**
 * Action Expired Email Template
 */
function actionExpired({ name, role, projectName, direction = "INVITE", actionUrl }) {
  const baseUrl = getBaseUrl();
  const url = actionUrl || `${baseUrl}/discover`;
  const displayName = name ? name.trim() : "Student";
  const actionType = direction === "INVITE" ? "team invitation" : "application";
  const subject = `Request Expired: ${actionType} for ${role}`;
  const heading = "Request Expired";

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello <strong>${displayName}</strong>,</p>
    <p style="margin: 0 0 12px 0;">The pending ${actionType} for <strong>${role}</strong> in <strong>${projectName || "Team"}</strong> has reached its expiration deadline and is now closed.</p>
    <p style="margin: 0 0 12px 0; color: #475569;">No reputation penalty has been incurred. You are free to explore other open opportunities on TeamForge.</p>
  `;

  const bodyText = `Hello ${displayName},\n\nThe pending ${actionType} for ${role} in ${projectName || "Team"} has expired without penalty.\n\nYou are free to explore other opportunities on TeamForge.`;

  const disclaimer = "You can manage your notification preferences anytime from your profile settings.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: "Discover Opportunities",
    actionUrl: url,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: "Discover Opportunities",
    actionUrl: url,
    disclaimer
  });

  return { subject, text, html };
}

/**
 * Confirmation Timeout Email Template
 */
function confirmationTimeout({ name, role, projectName, actionUrl }) {
  const baseUrl = getBaseUrl();
  const url = actionUrl || `${baseUrl}/notifications`;
  const displayName = name ? name.trim() : "Student";
  const subject = `Confirmation Window Expired: ${role} in ${projectName || "Team"}`;
  const heading = "Confirmation Window Expired";

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">Hello <strong>${displayName}</strong>,</p>
    <p style="margin: 0 0 12px 0;">The 24-hour confirmation window for <strong>${role}</strong> in <strong>${projectName || "Team"}</strong> has expired without final confirmation.</p>
    <p style="margin: 0 0 12px 0; color: #dc2626;">The candidate spot and availability have been released back to the platform.</p>
  `;

  const bodyText = `Hello ${displayName},\n\nThe 24-hour confirmation window for ${role} in ${projectName || "Team"} has expired without confirmation.\n\nCandidate availability has been released.`;

  const disclaimer = "You can manage your notification preferences anytime from your profile settings.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: "View Details",
    actionUrl: url,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: "View Details",
    actionUrl: url,
    disclaimer
  });

  return { subject, text, html };
}

/**
 * Transactional email notification for new platform updates (single or batched).
 * Never exposes contact details; includes direct link.
 * 
 * @param {Object} user 
 * @param {Array<{title: string, subtitle?: string, link?: string}>} notifications 
 * @returns {{subject: string, text: string, html: string}}
 */
function notificationEmail(user, notifications = []) {
  const baseUrl = getBaseUrl();
  const displayName = user?.name || "Student";
  const isMultiple = notifications.length > 1;

  let subject = `[TeamForge] ${notifications[0]?.title || "New Notification"}`;
  let heading = notifications[0]?.title || "New Notification";
  let targetUrl = `${baseUrl}/notifications`;

  if (!isMultiple && notifications[0]?.link && notifications[0].link.startsWith("/")) {
    targetUrl = `${baseUrl}${notifications[0].link}`;
  }

  let bodyHtml = "";
  let bodyText = "";

  if (isMultiple) {
    subject = `[TeamForge] You have ${notifications.length} new updates`;
    heading = `You have ${notifications.length} new notifications`;
    bodyHtml = `<p style="margin: 0 0 16px 0;">Hello ${displayName},</p>
<p style="margin: 0 0 16px 0;">You received multiple new updates on TeamForge:</p>
<ul style="margin: 0 0 18px 0; padding-left: 20px; line-height: 1.6;">
  ${notifications.map(n => `<li><strong>${n.title}</strong>${n.subtitle ? ` — ${n.subtitle}` : ""}</li>`).join("")}
</ul>`;
    bodyText = `Hello ${displayName},\n\nYou received ${notifications.length} new updates on TeamForge:\n\n` +
      notifications.map(n => `* ${n.title}${n.subtitle ? `: ${n.subtitle}` : ""}`).join("\n");
  } else {
    const single = notifications[0] || { title: "New notification", subtitle: "" };
    bodyHtml = `<p style="margin: 0 0 16px 0;">Hello ${displayName},</p>
<p style="margin: 0 0 16px 0;"><strong>${single.title}</strong></p>
${single.subtitle ? `<p style="margin: 0 0 16px 0; color: #475569;">${single.subtitle}</p>` : ""}`;
    bodyText = `Hello ${displayName},\n\n${single.title}\n${single.subtitle || ""}\n`;
  }

  const disclaimer = "You can manage your email preferences anytime from your profile settings.";

  const html = renderEmailLayout({
    title: subject,
    heading,
    bodyHtml,
    buttonText: isMultiple ? "View All Notifications" : "View on TeamForge",
    actionUrl: targetUrl,
    disclaimer
  });

  const text = renderPlainTextLayout({
    heading,
    bodyText,
    buttonText: isMultiple ? "View All Notifications" : "View on TeamForge",
    actionUrl: targetUrl,
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
  passwordChanged,
  actionReminder,
  actionClosingSoon,
  actionExpired,
  confirmationTimeout,
  notificationEmail,
  formatDate,
  formatDateTime,
  formatTime
};



