const express = require('express');
const router = express.Router();
const { SensorReading, AnomalyLog } = require('../models/Schemas');

/**
 * Natural Language Sentence Intent Detection
 */
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
          reply = "System status: Device 'safebox-01' is initializing. No sensor readings recorded yet.";
        } else {
          const { metrics, actuatorStates } = latest;
          const gasReady = latest.sensorStatus?.gas?.ready !== false && Number.isFinite(metrics.gasLevel);
          const gasText = gasReady
            ? `${metrics.gasLevel} PPM (LPG estimate)`
            : `Unavailable (${latest.sensorStatus?.gas?.state || 'sensor preparing'})`;
          reply = `🌐 **System Status Summary**:\n• Temp: ${metrics.temperature}°C | Humidity: ${metrics.humidity}%\n• Gas Level: ${gasText}\n• Motion: ${metrics.motionDetected ? '🔴 Motion Detected!' : '🟢 Clear'}\n• Actuators: Fan (${actuatorStates.fanOn ? 'ON' : 'OFF'}), Buzzer (${actuatorStates.buzzerActive ? 'ACTIVE' : 'OFF'}), Alert LED (${actuatorStates.alertLedActive ? 'ON' : 'OFF'})`;
          dataPayload = latest;
        }
        break;
      }

      case 'gas': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });
        const lastGasAnomaly = await AnomalyLog.findOne({ deviceId, sensorType: 'gasLevel' }).sort({ timestamp: -1 });
        const gasVal = latest?.metrics?.gasLevel;
        const gasReady = latest?.sensorStatus?.gas?.ready !== false && Number.isFinite(gasVal);
        
        reply = `💨 **Gas & Smoke Status**:\n• Current Gas Level: ${gasReady ? `${gasVal} PPM LPG estimate (threshold: 600 PPM)` : `Unavailable (${latest?.sensorStatus?.gas?.state || 'no ready sensor'})`}.\n` +
          (lastGasAnomaly 
            ? `• Last Gas Alert: Observed ${lastGasAnomaly.observedValue} PPM on ${new Date(lastGasAnomaly.timestamp).toLocaleString()} (Severity: ${lastGasAnomaly.severity}).`
            : `• No historical gas anomalies detected.`);
        dataPayload = { currentGasLevel: gasReady ? gasVal : null, gasSensor: latest?.sensorStatus?.gas, lastAnomaly: lastGasAnomaly };
        break;
      }

      case 'motion': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });
        const lastMotionAnomaly = await AnomalyLog.findOne({ deviceId, sensorType: 'motionDetected' }).sort({ timestamp: -1 });
        const isMotion = latest ? latest.metrics.motionDetected : false;

        reply = `🏃 **Motion Detection Status**:\n• Current PIR Sensor State: ${isMotion ? '🔴 Active Motion Detected' : '🟢 Idle / No Motion'}.\n` +
          (lastMotionAnomaly
            ? `• Last Motion Alert: Recorded on ${new Date(lastMotionAnomaly.timestamp).toLocaleString()}.`
            : `• No motion security breaches logged.`);
        dataPayload = { currentMotion: isMotion, lastAnomaly: lastMotionAnomaly };
        break;
      }

      case 'temp': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });
        const tempVal = latest ? latest.metrics.temperature : 0;

        reply = `🌡️ **Temperature Reading**:\n• Current Temperature: ${tempVal}°C.\n• Normal Range: 10°C – 45°C. High temperature threshold auto-triggers the DC Fan relay.`;
        dataPayload = { temperature: tempVal };
        break;
      }

      case 'humidity': {
        const latest = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });
        const humVal = latest ? latest.metrics.humidity : 0;

        reply = `💧 **Humidity Reading**:\n• Current Relative Humidity: ${humVal}%.\n• Normal Comfort Range: 30% – 80%.`;
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
          reply = `💡 **Safebox Assistant Commands & Intent Guide**:\nYou can ask me full natural sentences! Supported topics:\n• **Status**: Ask about overall room condition, actuators, or system state.\n• **Gas / Smoke**: Inquire about gas PPM levels and smoke alarms.\n• **Motion**: Check PIR sensor motion triggers.\n• **Temperature / Humidity**: Inquire about environmental climate levels.\n• **Anomalies**: Ask for active security alarms or threshold breaches.`;
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
