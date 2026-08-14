/**
 * Rule-based chatbot endpoint. Intent detection deliberately stays deterministic
 * and reads the same persisted telemetry/runtime thresholds used by the dashboard;
 * it does not call an external LLM.
 */
const express = require('express');
const router = express.Router();
const { SensorReading, AnomalyLog } = require('../models/Schemas');
const { getThresholds } = require('../services/anomalyEngine');

// Order matters: sensor-specific terms must win before broad words such as "status".
function detectIntent(message) {
  const text = message.toLowerCase().trim();

  if (/gas|smoke|leak|ppm/i.test(text)) return 'gas';
  if (/motion|movement|pir|intruder|presence/i.test(text)) return 'motion';
  if (/temp|temperature|heat|hot|cold|degree/i.test(text)) return 'temp';
  if (/humid|humidity|moisture/i.test(text)) return 'humidity';
  if (/anomal|alert|alarm|issue|warning|breach|error|problem/i.test(text)) return 'anomalies';
  if (/status|state|overview|condition|system|fan|buzzer|how is/i.test(text)) return 'status';
  if (/help|command|what can|guide|option|menu/i.test(text)) return 'help';

  return 'unknown';
}

// POST /api/v1/chatbot/query — Sentence-based intent router
router.post('/query', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Query message string is required' });
    }

    const intent = detectIntent(message);
    const deviceId = req.body.deviceId || 'safebox-01';

    let reply = '';
    let dataPayload = null;

    switch (intent) {
      case 'status': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });
        if (!latest) {
          reply = `System status: Device '${deviceId}' has no sensor readings recorded yet.`;
        } else {
          const { metrics, actuatorStates } = latest;
          reply = `🌐 **System Status Summary**:\n• Temp: ${metrics.temperature}°C | Humidity: ${metrics.humidity}%\n• MQ-2 Gas Index: ${metrics.gasValid === false ? 'invalid reading' : metrics.gasLevel}\n• Motion: ${metrics.motionDetected ? '🔴 Motion Detected!' : '🟢 Clear'}\n• Actuators: Fan (${actuatorStates.fanOn ? 'ON' : 'OFF'}), Buzzer (${actuatorStates.buzzerActive ? 'ACTIVE' : 'OFF'}), Alert LED (${actuatorStates.alertLedActive ? 'ON' : 'OFF'})`;
          dataPayload = latest;
        }
        break;
      }

      case 'gas': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });
        const lastGasAnomaly = await AnomalyLog.findOne({ deviceId, sensorType: 'gasLevel' }).sort({ timestamp: -1 });
        const gasThreshold = getThresholds().gasMax;

        if (!latest) {
          reply = `💨 **Gas & Smoke Status**:\n• No MQ-2 telemetry has been recorded for device '${deviceId}' yet.`;
          dataPayload = { currentGasLevel: null, lastAnomaly: lastGasAnomaly };
          break;
        }

        const gasVal = latest.metrics.gasLevel;
        
        reply = `💨 **Gas & Smoke Status**:\n• Current MQ-2 gas index: ${latest?.metrics?.gasValid === false ? 'invalid reading' : gasVal} (ADC threshold: ${gasThreshold}).\n` +
          (lastGasAnomaly 
            ? `• Last Gas Alert: Observed index ${lastGasAnomaly.observedValue} on ${new Date(lastGasAnomaly.timestamp).toLocaleString()} (Severity: ${lastGasAnomaly.severity}).`
            : `• No historical gas anomalies detected.`);
        dataPayload = { currentGasLevel: gasVal, lastAnomaly: lastGasAnomaly };
        break;
      }

      case 'motion': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });
        const lastMotionAnomaly = await AnomalyLog.findOne({ deviceId, sensorType: 'motionDetected' }).sort({ timestamp: -1 });

        if (!latest) {
          reply = `🏃 **Motion Detection Status**:\n• No PIR telemetry has been recorded for device '${deviceId}' yet.`;
          dataPayload = { currentMotion: null, lastAnomaly: lastMotionAnomaly };
          break;
        }

        const isMotion = latest.metrics.motionDetected;

        reply = `🏃 **Motion Detection Status**:\n• Current PIR Sensor State: ${isMotion ? '🔴 Active Motion Detected' : '🟢 Idle / No Motion'}.\n` +
          (lastMotionAnomaly
            ? `• Last Motion Alert: Recorded on ${new Date(lastMotionAnomaly.timestamp).toLocaleString()}.`
            : `• No motion security breaches logged.`);
        dataPayload = { currentMotion: isMotion, lastAnomaly: lastMotionAnomaly };
        break;
      }

      case 'temp': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });

        if (!latest) {
          reply = `🌡️ **Temperature Reading**:\n• No temperature telemetry has been recorded for device '${deviceId}' yet.`;
          dataPayload = { temperature: null };
          break;
        }

        const tempVal = latest.metrics.temperature;
        const { tempMin, tempMax } = getThresholds();

        reply = `🌡️ **Temperature Reading**:\n• Current Temperature: ${tempVal}°C.\n• Configured Range: ${tempMin}°C – ${tempMax}°C. High temperature threshold auto-triggers the DC Fan relay.`;
        dataPayload = { temperature: tempVal };
        break;
      }

      case 'humidity': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });

        if (!latest) {
          reply = `💧 **Humidity Reading**:\n• No humidity telemetry has been recorded for device '${deviceId}' yet.`;
          dataPayload = { humidity: null };
          break;
        }

        const humVal = latest.metrics.humidity;
        const { humidityMin, humidityMax } = getThresholds();

        reply = `💧 **Humidity Reading**:\n• Current Relative Humidity: ${humVal}%.\n• Configured Range: ${humidityMin}% – ${humidityMax}%.`;
        dataPayload = { humidity: humVal };
        break;
      }

      case 'anomalies': {
        const unresolvedCount = await AnomalyLog.countDocuments({ deviceId, resolved: false });
        const recentAnomalies = await AnomalyLog.find({ deviceId }).sort({ timestamp: -1 }).limit(3);

        reply = `🚨 **Anomaly Logs Summary**:\n• Unresolved Anomalies Count: ${unresolvedCount}\n` +
          (recentAnomalies.length > 0
            ? `• Recent Events:\n` + recentAnomalies.map(a => `  - [${a.severity}] ${a.sensorType}: observed ${a.observedValue} (${new Date(a.timestamp).toLocaleTimeString()})`).join('\n')
            : `• No recent anomalies registered.`);
        dataPayload = { unresolvedCount, recentAnomalies };
        break;
      }

      case 'help':
      default: {
        if (intent === 'unknown') {
          reply = `🤖 I parsed your message, but I wasn't completely sure of your intent.\n\nHere are some questions you can ask me:\n• *"What is the current system status?"*\n• *"Is there any gas leak or smoke?"*\n• *"Has any motion been detected?"*\n• *"How hot is the temperature right now?"*\n• *"What is the humidity level?"*\n• *"Show me all unresolved anomalies."*`;
        } else {
          reply = `💡 **Safebox Assistant Commands & Intent Guide**:\nYou can ask me full natural sentences! Supported topics:\n• **Status**: Ask about overall room condition, actuators, or system state.\n• **Gas / Smoke**: Inquire about the MQ-2 ADC gas index and smoke alarms.\n• **Motion**: Check PIR sensor motion triggers.\n• **Temperature / Humidity**: Inquire about environmental climate levels.\n• **Anomalies**: Ask for active security alarms or threshold breaches.`;
        }
        break;
      }
    }

    res.json({
      success: true,
      query: message,
      detectedIntent: intent,
      reply,
      data: dataPayload,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
