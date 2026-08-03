/**
 * Nodemailer Email Service & Debouncer
 * 
 * Enforces a 15-minute sliding window throttle per (deviceId, sensorType) key.
 */

// In-memory sliding window throttle cache: key = `${deviceId}:${sensorType}`, value = timestamp (ms)
const emailThrottleMap = new Map();
const THROTTLE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Dispatches an email alert for HIGH/CRITICAL anomalies.
 */
async function sendAlertEmail({ deviceId, sensorType, severity, observedValue, thresholdLimit, timestamp }) {
  const throttleKey = `${deviceId}:${sensorType}`;
  const now = Date.now();
  const lastSent = emailThrottleMap.get(throttleKey);

  if (lastSent && (now - lastSent) < THROTTLE_WINDOW_MS) {
    console.log(`[EmailService] Throttle active for ${throttleKey}. Skipped email dispatch.`);
    return { status: 'throttled', lastSentAt: new Date(lastSent) };
  }

  // Record dispatch timestamp
  emailThrottleMap.set(throttleKey, now);

  console.log(`[EmailService MOCK] Alert email sent for ${sensorType} (Severity: ${severity}, Value: ${observedValue}) to admin@safebox.io`);

  /* =========================================================================
   * TEMPLATE: REAL NODEMAILER SMTP CONNECTION (Uncomment to use real email)
   * =========================================================================
   * 
   * const nodemailer = require('nodemailer');
   * 
   * const transporter = nodemailer.createTransport({
   *   host: process.env.SMTP_HOST || 'smtp.gmail.com',
   *   port: parseInt(process.env.SMTP_PORT || '587'),
   *   secure: false, // true for port 465, false for 587
   *   auth: {
   *     user: process.env.SMTP_USER,
   *     pass: process.env.SMTP_PASS
   *   }
   * });
   * 
   * const mailOptions = {
   *   from: '"SafeRoom IoT Box" <alerts@safebox.io>',
   *   to: process.env.ALERT_RECIPIENT_EMAIL || 'user@example.com',
   *   subject: `🚨 [${severity}] SafeRoom Anomaly Detected: ${sensorType}`,
   *   html: `
   *     <h2>SafeRoom IoT Box Alert</h2>
   *     <p><strong>Device ID:</strong> ${deviceId}</p>
   *     <p><strong>Sensor:</strong> ${sensorType}</p>
   *     <p><strong>Severity:</strong> <span style="color:red">${severity}</span></p>
   *     <p><strong>Observed Value:</strong> ${observedValue}</p>
   *     <p><strong>Threshold:</strong> ${thresholdLimit}</p>
   *     <p><strong>Timestamp:</strong> ${new Date(timestamp).toLocaleString()}</p>
   *   `
   * };
   * 
   * await transporter.sendMail(mailOptions);
   * ========================================================================= */

  return { status: 'sent', sentAt: new Date(now) };
}

module.exports = { sendAlertEmail };
