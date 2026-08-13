const test = require('node:test');
const assert = require('node:assert/strict');

const { User } = require('../models/Schemas');
const {
  getAlertRecipientResolution,
  normalizeEmail
} = require('../services/userNotificationService');

test('normalizes valid profile emails and rejects invalid addresses', () => {
  assert.equal(normalizeEmail(' Owner@Example.COM '), 'owner@example.com');
  assert.throws(() => normalizeEmail('not-an-email'), /valid profile email/i);
});

test('selects unique profile emails only for users with alerts enabled', async () => {
  const originalFind = User.find;
  const captured = {};
  User.find = (query) => {
    captured.query = query;
    return {
      select(fields) {
        captured.fields = fields;
        return this;
      },
      async lean() {
        return [
          { email: 'Owner@Example.com', settings: { emailEnabled: true } },
          { email: 'disabled@example.com', settings: { emailEnabled: false } },
          { email: 'owner@example.com', settings: {} },
          { email: 'second@example.com' }
        ];
      }
    };
  };

  try {
    const resolution = await getAlertRecipientResolution();
    assert.deepEqual(captured.query, {});
    assert.equal(captured.fields, 'email settings.emailEnabled');
    assert.equal(resolution.hasUsers, true);
    assert.deepEqual(resolution.recipients, ['owner@example.com', 'second@example.com']);
  } finally {
    User.find = originalFind;
  }
});

test('distinguishes no users from users who disabled every email alert', async () => {
  const originalFind = User.find;
  User.find = () => ({
    select() { return this; },
    async lean() {
      return [{ email: 'owner@example.com', settings: { emailEnabled: false } }];
    }
  });

  try {
    const resolution = await getAlertRecipientResolution();
    assert.equal(resolution.hasUsers, true);
    assert.deepEqual(resolution.recipients, []);
  } finally {
    User.find = originalFind;
  }
});
