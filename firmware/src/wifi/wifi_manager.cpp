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
    _instance = this;

    _wm.setDebugOutput(SAFEBOX_DEBUG != 0);
    _wm.setConnectTimeout(connectTimeoutS);     // saved-NVS credential attempt
    _wm.setConfigPortalTimeout(portalTimeoutS);   // SoftAP captive portal window
    _wm.setAPCallback(onApModeStarted);
}

bool SafeboxWifi::provision() {
    // Try saved credentials first; on failure WiFiManager falls back to the
    // captive portal (blocking). Returns false only if the portal timed out.
    return _wm.autoConnect(_apName);
}

bool SafeboxWifi::isConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

bool SafeboxWifi::handleConnectionLoss() {
    if (isConnected()) {
        _lostSinceMs = 0;
        return false;
    }

    // Start the outage timer on first sight and open the portal only after a
    // sustained loss, so brief WiFi blips do not force a re-provisioning.
    if (_lostSinceMs == 0) _lostSinceMs = millis();
    if (millis() - _lostSinceMs < _lostFallbackMs) return false;

    _lostSinceMs = 0;
    DBGLN("[WiFi] Connection lost; opening provisioning portal...");
    _wm.startConfigPortal(_apName); // blocking until the user re-provisions
    return true;                    // caller should reboot afterwards
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