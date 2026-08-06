#include "FanController.h"

#include <cstring>

FanController::FanController(uint8_t relayPin) : relayPin_(relayPin), fanOn_(false) {}

void FanController::begin() {
  pinMode(relayPin_, OUTPUT);
  setState(false);
}

bool FanController::handleControlPayload(const uint8_t* payload, size_t length) {
  JsonDocument command;
  const DeserializationError error = deserializeJson(command, payload, length);
  if (error) return false;

  const char* actuator = command["actuator"] | "";
  const char* state = command["state"] | "";
  if (std::strcmp(actuator, "fan") != 0) return false;

  if (std::strcmp(state, "on") == 0) {
    setState(true);
    return true;
  }
  if (std::strcmp(state, "off") == 0) {
    setState(false);
    return true;
  }
  return false;
}

void FanController::appendActuatorState(JsonObject actuatorStates) const {
  actuatorStates["fanOn"] = fanOn_;
}

bool FanController::isOn() const {
  return fanOn_;
}

void FanController::setState(bool enabled) {
  fanOn_ = enabled;
  digitalWrite(relayPin_, fanOn_ ? HIGH : LOW);
}
