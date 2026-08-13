#pragma once

#include <Arduino.h>
#include <WiFiManager.h>

class SafeboxWifiManager {
public:
    using ApCallback = void (*)(WiFiManager*);

    void begin(const char* apName, uint16_t connectTimeoutS,
               uint16_t portalTimeoutS, ApCallback callback);
    bool connect();
    void update(uint32_t nowMs, uint32_t reconnectIntervalMs);
    bool connected() const;
    String ipAddress() const;

private:
    WiFiManager _manager;
    const char* _apName = nullptr;
    uint32_t _lastReconnectMs = 0;
};
