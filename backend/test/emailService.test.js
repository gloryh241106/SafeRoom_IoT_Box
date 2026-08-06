const test = require('node:test');
const assert = require('node:assert/strict');

const {
  THROTTLE_WINDOW_MS,
  buildAlertMessage,
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
