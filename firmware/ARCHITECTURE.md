# Firmware Architecture

The firmware intentionally uses a small, report-friendly structure. `main.cpp`
shows the whole runtime order; modules contain only one hardware or networking
responsibility.

## Source layout

```text
src/
├── main.cpp                 setup(), loop(), control callback
├── config.h                 pinout, timing, thresholds, AP password
├── device_state.h           sensor and actuator value structures
├── sensors/
│   ├── dht22_sensor.*       temperature and humidity
│   ├── mq2_sensor.*         one direct GPIO34 ADC read
│   └── pir_sensor.*         one direct digital motion read
├── actuators/
│   └── actuators.*          relay, buzzer, green LED, red LED
├── display/
│   └── oled.*               normal status and gas warning screens
├── network/
│   ├── wifi_setup.*         standard non-blocking WiFiManager flow
│   └── mqtt_service.*       MQTTS connect, publish and control subscribe
└── features/
    ├── gas_safety.*         independent 100 ms local safety task
    └── telemetry.*          backend-compatible JSON packaging
```

## Main runtime flow

```text
setup
  -> force all output GPIOs to safe OFF state
  -> start DHT22, MQ2, PIR and OLED
  -> start local gas-safety task
  -> try saved WiFi; otherwise open Safebox-AP / 12345678
  -> configure MQTTS

loop
  -> process WiFiManager
  -> maintain MQTT connection and receive control messages
  -> retry pending gas alert
  -> every 2 seconds read DHT22/PIR, copy MQ2 and actuator state
  -> publish one complete telemetry document
```

## Safety path

`GasSafety` is the only code that reads the MQ2. Its priority-4 FreeRTOS task
runs every 50 ms and performs this sequence:

```text
analogRead(GPIO34)
  -> raw > active alarm threshold: buzzer ON + red LED ON, then OLED warning
  -> raw < active clear threshold: buzzer/LED safety override OFF
  -> hand one pending alert value to main.cpp for MQTT delivery
```

The task never calls WiFi or MQTT. The fan remains remote-only. The buzzer
and red LED are edge-only outputs: they follow exclusively the local gas
alarm and cannot be commanded from the backend or the web dashboard.

## Telemetry contract

The backend requires one complete atomic object. To keep the code readable,
`Telemetry` packages the sensor, fan, buzzer and alert-LED sections in separate
functions, then publishes the combined JSON on
`safebox/{deviceId}/telemetry`. Separate MQTT topics are not used because they
would create partial database snapshots and break the current backend contract.

## Debug map

| Symptom | First file to inspect |
|---|---|
| Wrong DHT22, MQ2 or PIR value | `sensors/<name>_sensor.cpp` |
| Fan/buzzer/LED polarity wrong | `config.h`, then `actuators/actuators.cpp` |
| Local gas warning wrong | `features/gas_safety.cpp` |
| Cannot join setup AP | `network/wifi_setup.cpp` |
| ESP32 cannot connect to EMQX | `include/secrets.h`, then `network/mqtt_service.cpp` |
| Website receives wrong JSON | `features/telemetry.cpp` |
| Overall order is unclear | `main.cpp` |
