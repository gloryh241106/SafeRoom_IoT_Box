#include "wifi_manager.h"
#include <WiFi.h>
#include "../config/settings.h"

void SafeboxWifiManager::begin(const char* apName, uint16_t connectTimeoutS,
                               uint16_t portalTimeoutS, ApCallback callback) {
    _apName = apName;
    _manager.setDebugOutput(SAFEBOX_DEBUG != 0);
    _manager.setConnectTimeout(connectTimeoutS);
    _manager.setConfigPortalTimeout(portalTimeoutS);
    _manager.setAPCallback(callback);
}

bool SafeboxWifiManager::connect() {
    return _manager.autoConnect(_apName);
}

void SafeboxWifiManager::update(uint32_t nowMs, uint32_t reconnectIntervalMs) {
    if (connected()) return;
    if (_lastReconnectMs && nowMs - _lastReconnectMs < reconnectIntervalMs) return;
    _lastReconnectMs = nowMs;
    WiFi.reconnect();
}

bool SafeboxWifiManager::connected() const {
    return WiFi.status() == WL_CONNECTED;
}

String SafeboxWifiManager::ipAddress() const {
    return WiFi.localIP().toString();
}
