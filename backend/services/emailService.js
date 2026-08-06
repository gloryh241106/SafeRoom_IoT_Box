const nodemailer = require('nodemailer');

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const ALERT_SEVERITIES = new Set(['HIGH', 'CRITICAL']);
const emailThrottleMap = new Map();

let transporter = null;
let nowProvider = () => Date.now();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function getEmailConfig(env = process.env) {
  const requiredValues = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.ALERT_RECIPIENT_EMAIL];
  const credentialsComplete = requiredValues.every(Boolean);
  const enabled = parseBoolean(env.EMAIL_ENABLED, credentialsComplete);

  if (enabled && !credentialsComplete) {
    throw new Error(
      'Email alerts are enabled but SMTP_HOST, SMTP_USER, SMTP_PASS, or ALERT_RECIPIENT_EMAIL is missing.'
    );
  }

  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }

  return {
    enabled,
    host: env.SMTP_HOST,
    port,
    secure: parseBoolean(env.SMTP_SECURE, port === 465),
    user: env.SMTP_USER,
    password: env.SMTP_PASS,
    recipient: env.ALERT_RECIPIENT_EMAIL,
    from: env.SMTP_FROM || `SafeRoom IoT Box <${env.SMTP_USER || 'alerts@safebox.local'}>`
  };
}

function getTransporter(config = getEmailConfig()) {
  if (!config.enabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password
      }
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildAlertMessage({ deviceId, sensorType, severity, observedValue, thresholdLimit, timestamp }) {
  const eventTime = new Date(timestamp || nowProvider());
  const safeTime = Number.isNaN(eventTime.getTime()) ? new Date(nowProvider()) : eventTime;
  const fields = {
    deviceId: escapeHtml(deviceId),
    sensorType: escapeHtml(sensorType),
    severity: escapeHtml(severity),
    observedValue: escapeHtml(observedValue),
    thresholdLimit: escapeHtml(thresholdLimit),
    timestamp: escapeHtml(safeTime.toISOString())
  };

  return {
    subject: `[${severity}] SafeRoom anomaly: ${sensorType} on ${deviceId}`,
    text: [
      'SafeRoom IoT Box Alert',
      `Device: ${deviceId}`,
      `Sensor: ${sensorType}`,
      `Severity: ${severity}`,
      `Observed value: ${observedValue}`,
      `Threshold: ${thresholdLimit}`,
      `Timestamp: ${safeTime.toISOString()}`
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #d1d5db">
        <div style="background:#991b1b;color:#fff;padding:18px 22px">
          <h1 style="font-size:20px;margin:0">SafeRoom IoT Box Alert</h1>
        </div>
        <div style="padding:22px;color:#111827">
          <p style="margin-top:0">A <strong>${fields.severity}</strong> anomaly was detected.</p>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:7px 0;color:#6b7280">Device</td><td><strong>${fields.deviceId}</strong></td></tr>
            <tr><td style="padding:7px 0;color:#6b7280">Sensor</td><td>${fields.sensorType}</td></tr>
            <tr><td style="padding:7px 0;color:#6b7280">Observed</td><td>${fields.observedValue}</td></tr>
            <tr><td style="padding:7px 0;color:#6b7280">Threshold</td><td>${fields.thresholdLimit}</td></tr>
            <tr><td style="padding:7px 0;color:#6b7280">Time (UTC)</td><td>${fields.timestamp}</td></tr>
          </table>
        </div>
      </div>`
  };
}

async function initializeEmailService({ verify = false } = {}) {
  const config = getEmailConfig();
  const activeTransporter = getTransporter(config);
  if (!activeTransporter) return { enabled: false };
  if (verify) await activeTransporter.verify();
  return { enabled: true, recipient: config.recipient };
}

async function sendAlertEmail(alert) {
  const severity = String(alert.severity || '').toUpperCase();
  if (!ALERT_SEVERITIES.has(severity)) return { status: 'ignored', reason: 'severity' };

  const config = getEmailConfig();
  const activeTransporter = getTransporter(config);
  if (!activeTransporter) return { status: 'disabled' };

  const throttleKey = `${alert.deviceId}:${alert.sensorType}`;
  const now = nowProvider();
  const lastSent = emailThrottleMap.get(throttleKey);
  if (lastSent !== undefined && now - lastSent < THROTTLE_WINDOW_MS) {
    return { status: 'throttled', lastSentAt: new Date(lastSent) };
  }

  const message = buildAlertMessage({ ...alert, severity });
  const result = await activeTransporter.sendMail({
    from: config.from,
    to: config.recipient,
    ...message
  });

  emailThrottleMap.set(throttleKey, now);
  return { status: 'sent', sentAt: new Date(now), messageId: result.messageId };
}

function resetEmailServiceForTests() {
  transporter = null;
  nowProvider = () => Date.now();
  emailThrottleMap.clear();
}

function setEmailServiceTestOverrides({ transport, now }) {
  transporter = transport;
  if (now) nowProvider = now;
}

module.exports = {
  THROTTLE_WINDOW_MS,
  buildAlertMessage,
  getEmailConfig,
  initializeEmailService,
  resetEmailServiceForTests,
  sendAlertEmail,
  setEmailServiceTestOverrides
};
