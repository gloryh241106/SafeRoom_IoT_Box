const { User } = require('../models/Schemas');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new TypeError('Profile email must be a string');
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    throw new TypeError('A valid profile email is required');
  }
  return normalized;
}

async function getAlertRecipientResolution() {
  const users = await User.find({})
    .select('email settings.emailEnabled')
    .lean();

  const recipients = users
    .filter((user) => user.settings?.emailEnabled !== false)
    .map((user) => normalizeEmail(user.email));

  return {
    hasUsers: users.length > 0,
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
