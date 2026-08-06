#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class FanController {
 public:
  explicit FanController(uint8_t relayPin);

  void begin();
  bool handleControlPayload(const uint8_t* payload, size_t length);
  void appendActuatorState(JsonObject actuatorStates) const;
  bool isOn() const;

 private:
  void setState(bool enabled);

  uint8_t relayPin_;
  bool fanOn_;
};
