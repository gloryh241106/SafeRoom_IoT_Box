/** Covers SMTP severity filtering, recipient privacy, formatting, and throttling. */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  THROTTLE_WINDOW_MS,
  buildAlertMessage,
  formatVietnamTimestamp,
  resetEmailServiceForTests,
  sendAlertEmail,
  setEmailServiceTestOverrides
} = require('../services/emailService');

const EMAIL_ENV_KEYS = [
  'EMAIL_ENABLED',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'ALERT_RECIPIENT_EMAIL'
];

function withEmailEnvironment() {
  const previous = Object.fromEntries(EMAIL_ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EMAIL_ENABLED: 'true',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'sender@example.test',
    SMTP_PASS: 'test-password',
    SMTP_FROM: 'SafeRoom <sender@example.test>',
    ALERT_RECIPIENT_EMAIL: 'owner@example.test'
  });
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test.afterEach(() => resetEmailServiceForTests());

test('sends HIGH alerts and throttles the same device and sensor for 15 minutes', async () => {
  const restoreEnvironment = withEmailEnvironment();
  let now = Date.parse('2026-08-06T00:00:00.000Z');
  const sentMessages = [];
  setEmailServiceTestOverrides({
    transport: {
      async sendMail(message) {
        sentMessages.push(message);
        return { messageId: `message-${sentMessages.length}` };
      }
    },
    now: () => now
  });

  try {
    const alert = {
      deviceId: 'safebox-01',
      sensorType: 'temperature',
      severity: 'HIGH',
      observedValue: 48,
      thresholdLimit: 45,
      timestamp: new Date(now)
    };

    assert.equal((await sendAlertEmail(alert)).status, 'sent');
    assert.equal((await sendAlertEmail(alert)).status, 'throttled');
    assert.equal(sentMessages.length, 1);

    now += THROTTLE_WINDOW_MS;
    assert.equal((await sendAlertEmail(alert)).status, 'sent');
    assert.equal(sentMessages.length, 2);
  } finally {
    restoreEnvironment();
  }
});

test('keeps throttle windows independent per device and sensor type', async () => {
  const restoreEnvironment = withEmailEnvironment();
  const sentMessages = [];
  setEmailServiceTestOverrides({
    transport: {
      async sendMail(message) {
        sentMessages.push(message);
        return { messageId: `message-${sentMessages.length}` };
      }
    },
    now: () => Date.parse('2026-08-06T00:00:00.000Z')
  });

  try {
    const baseAlert = {
      deviceId: 'safebox-01',
      sensorType: 'temperature',
      severity: 'HIGH',
      observedValue: 48,
      thresholdLimit: 45
    };

    assert.equal((await sendAlertEmail(baseAlert)).status, 'sent');
    assert.equal((await sendAlertEmail({ ...baseAlert, sensorType: 'gasLevel' })).status, 'sent');
    assert.equal((await sendAlertEmail({ ...baseAlert, deviceId: 'safebox-02' })).status, 'sent');
    assert.equal((await sendAlertEmail(baseAlert)).status, 'throttled');
    assert.equal(sentMessages.length, 3);
  } finally {
    restoreEnvironment();
  }
});

test('ignores severities below HIGH without contacting SMTP', async () => {
  const restoreEnvironment = withEmailEnvironment();
  let calls = 0;
  setEmailServiceTestOverrides({
    transport: { async sendMail() { calls += 1; } }
  });

  try {
    const result = await sendAlertEmail({
      deviceId: 'safebox-01',
      sensorType: 'humidity',
      severity: 'MEDIUM',
      observedValue: 90,
      thresholdLimit: 85
    });
    assert.equal(result.status, 'ignored');
    assert.equal(calls, 0);
  } finally {
    restoreEnvironment();
  }
});

test('escapes dynamic values in the HTML alert template', () => {
  const message = buildAlertMessage({
    deviceId: '<device>',
    sensorType: 'temperature',
    severity: 'HIGH',
    observedValue: '<script>alert(1)</script>',
    thresholdLimit: 45,
    timestamp: '2026-08-06T00:00:00.000Z'
  });
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
});

test('renders alert timestamps in Vietnam time (UTC+7)', () => {
  const utcTime = new Date('2026-08-13T01:02:03.000Z');
  assert.equal(formatVietnamTimestamp(utcTime), '2026-08-13 08:02:03 UTC+7');

  const message = buildAlertMessage({
    deviceId: 'safebox-01',
    sensorType: 'temperature',
    severity: 'HIGH',
    observedValue: 48,
    thresholdLimit: 45,
    timestamp: utcTime
  });
  assert.match(message.text, /Timestamp: 2026-08-13 08:02:03 UTC\+7/);
  assert.match(message.html, /Time \(UTC\+7\)/);
});

test('sends to recipients supplied by persisted user preferences', async () => {
  const restoreEnvironment = withEmailEnvironment();
  const sentMessages = [];
  setEmailServiceTestOverrides({
    transport: {
      async sendMail(message) {
        sentMessages.push(message);
        return { messageId: 'profile-recipient-message' };
      }
    },
    recipients: async () => ['profile-owner@example.test']
  });

  try {
    const result = await sendAlertEmail({
      deviceId: 'safebox-01',
      sensorType: 'gasLevel',
      severity: 'CRITICAL',
      observedValue: 700,
      thresholdLimit: 600
    });

    assert.equal(result.status, 'sent');
    assert.equal(result.recipientCount, 1);
    assert.equal(sentMessages[0].to, 'profile-owner@example.test');
  } finally {
    restoreEnvironment();
  }
});

test('deduplicates multiple profile recipients and keeps their addresses in BCC', async () => {
  const restoreEnvironment = withEmailEnvironment();
  const sentMessages = [];
  setEmailServiceTestOverrides({
    transport: {
      async sendMail(message) {
        sentMessages.push(message);
        return { messageId: 'multi-recipient-message' };
      }
    },
    recipients: async () => [
      ' first@example.test ',
      'second@example.test',
      'first@example.test',
      ''
    ]
  });

  try {
    const result = await sendAlertEmail({
      deviceId: 'safebox-01',
      sensorType: 'gasLevel',
      severity: 'CRITICAL',
      observedValue: 700,
      thresholdLimit: 600
    });

    assert.equal(result.recipientCount, 2);
    assert.equal(sentMessages[0].to, 'sender@example.test');
    assert.deepEqual(sentMessages[0].bcc, ['first@example.test', 'second@example.test']);
  } finally {
    restoreEnvironment();
  }
});

test('skips SMTP when every persisted user has disabled email alerts', async () => {
  const restoreEnvironment = withEmailEnvironment();
  let calls = 0;
  setEmailServiceTestOverrides({
    transport: { async sendMail() { calls += 1; } },
    recipients: async () => []
  });

  try {
    const result = await sendAlertEmail({
      deviceId: 'safebox-01',
      sensorType: 'temperature',
      severity: 'HIGH',
      observedValue: 48,
      thresholdLimit: 45
    });
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'no_recipients');
    assert.equal(calls, 0);
  } finally {
    restoreEnvironment();
  }
});
