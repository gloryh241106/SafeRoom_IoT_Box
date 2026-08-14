/** Guards profile-setting updates against nested-document replacement and bad types. */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.MOCK_HARDWARE = 'true';
process.env.JWT_SECRET = 'user-routes-test-secret';

const { User } = require('../models/Schemas');
const { app } = require('../server');

let server;
let baseUrl;
let token;

test.before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = jwt.sign({ id: 'profile-test-user', username: 'profile-test' }, process.env.JWT_SECRET);
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('persists the email-enabled preference without replacing other user settings', async () => {
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  const captured = {};
  User.findByIdAndUpdate = (id, updates, options) => {
    captured.id = id;
    captured.updates = updates;
    captured.options = options;
    return {
      async select(fields) {
        captured.fields = fields;
        return {
          _id: id,
          email: 'owner@example.com',
          settings: { emailEnabled: false }
        };
      }
    };
  };

  try {
    const response = await fetch(`${baseUrl}/api/v1/users/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ settings: { emailEnabled: false } })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(captured.id, 'profile-test-user');
    assert.deepEqual(captured.updates, { 'settings.emailEnabled': false });
    assert.deepEqual(captured.options, { new: true, runValidators: true });
    assert.equal(captured.fields, '-passwordHash');
  } finally {
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('rejects a non-boolean email preference before writing to MongoDB', async () => {
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  let calls = 0;
  User.findByIdAndUpdate = () => {
    calls += 1;
    throw new Error('should not be called');
  };

  try {
    const response = await fetch(`${baseUrl}/api/v1/users/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ settings: { emailEnabled: 'false' } })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /boolean/i);
    assert.equal(calls, 0);
  } finally {
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});
