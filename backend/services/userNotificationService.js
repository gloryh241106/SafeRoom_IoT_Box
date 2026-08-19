/**
 * Resolves persisted user notification preferences into a de-duplicated SMTP
 * recipient list. Device ownership is not modelled, so enabled users currently
 * subscribe to system-wide alerts.
 *
 * Study map (NC-05): User.email is the destination; settings.emailEnabled is
 * only an opt-in switch. SMTP_USER remains the sender account, not a recipient.
 */
const { User } = require('../models/Schemas');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  // Profile data is still treated as untrusted at the notification boundary.
  if (typeof value !== 'string') throw new TypeError('Profile email must be a string');
  // Canonical lowercase form makes de-duplication deterministic.
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    throw new TypeError('A valid profile email is required');
  }
  return normalized;
}

async function getAlertRecipientResolution() {
  // Select only fields needed for delivery and return plain objects with lean().
  const users = await User.find({})
    .select('email settings.emailEnabled')
    .lean();

  // Undefined means enabled for backward compatibility; only explicit false opts out.
  const recipients = users
    .filter((user) => user.settings?.emailEnabled !== false)
    .map((user) => normalizeEmail(user.email));

  return {
    // The caller uses this distinction to allow an env fallback only before any account exists.
    hasUsers: users.length > 0,
    // Multiple accounts with the same normalized address receive only one copy.
    recipients: [...new Set(recipients)]
  };
}

async function getEnabledAlertRecipients() {
  const resolution = await getAlertRecipientResolution();
  return resolution.recipients;
}

module.exports = {
  getAlertRecipientResolution,
  getEnabledAlertRecipients,
  normalizeEmail
};
