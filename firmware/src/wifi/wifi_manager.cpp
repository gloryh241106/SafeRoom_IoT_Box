#include "wifi_manager.h"
#include "../config/config.h"

SafeboxWifi* SafeboxWifi::_instance = nullptr;

void SafeboxWifi::begin(const char* apName,
                        ApModeCallback apModeCallback,
                        uint32_t connectTimeoutS,
                        uint32_t portalTimeoutS,
                        uint32_t lostFallbackMs) {
    _apName = apName;
    _apModeCallback = apModeCallback;
    _lostFallbackMs = lostFallbackMs;
    _connectTimeoutMs = connectTimeoutS * 1000UL;
    _instance = this;

    _wm.setDebugOutput(SAFEBOX_DEBUG != 0);
    _wm.setConnectTimeout(connectTimeoutS);
    _wm.setSaveConnectTimeout(connectTimeoutS);
    _wm.setConfigPortalTimeout(portalTimeoutS); // SoftAP captive portal window
    _wm.setConfigPortalBlocking(false);
    _wm.setAPCallback(onApModeStarted);
}

bool SafeboxWifi::provision() {
    // ESP32 WiFi.begin() returns immediately and uses credentials saved in NVS.
    // process() starts WiFiManager's non-blocking portal if this attempt times out.
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin();
    _initialConnectStartedMs = millis();
    _initialConnectionPending = true;
    return isConnected();
}

void SafeboxWifi::process() {
    _wm.process();

    if (isConnected()) {
        _initialConnectionPending = false;
        _lostSinceMs = 0;
        _portalRestartedForLoss = false;
        return;
    }
    if (_wm.getConfigPortalActive()) return;

    if (_initialConnectionPending) {
        if (millis() - _initialConnectStartedMs < _connectTimeoutMs) return;
        _initialConnectionPending = false;
        DBGLN("[WiFi] Saved credentials unavailable; opening Safebox-AP...");
        _wm.startConfigPortal(_apName);
        return;
    }

    if (_lostSinceMs == 0) _lostSinceMs = millis();
    if (!_portalRestartedForLoss && millis() - _lostSinceMs >= _lostFallbackMs) {
        _portalRestartedForLoss = true;
        DBGLN("[WiFi] Connection lost; opening non-blocking provisioning portal...");
        _wm.startConfigPortal(_apName);
    }
}

bool SafeboxWifi::isConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

bool SafeboxWifi::isPortalActive() {
    return _wm.getConfigPortalActive();
}

String SafeboxWifi::ipString() const {
    return WiFi.localIP().toString();
}

void SafeboxWifi::onApModeStarted(WiFiManager* manager) {
    (void)manager; // WiFiManager context; unsafe to do heavy work here
    if (_instance && _instance->_apModeCallback) {
        _instance->_apModeCallback();
    }
}
