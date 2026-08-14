#include "wifi_setup.h"

#include <WiFi.h>

#include "../config.h"

// Configures non-blocking WiFiManager and starts saved-WiFi/AP setup.
void WifiSetup::begin(const char* apName, const char* apPassword,
                      uint8_t connectTimeoutSeconds) {
    _manager.setDebugOutput(SAFEBOX_DEBUG != 0);
    _manager.setConfigPortalBlocking(false);
    _manager.setConnectTimeout(connectTimeoutSeconds);
    _manager.setSaveConnectTimeout(connectTimeoutSeconds);
    _manager.setWiFiAutoReconnect(true);

    const char* menu[] = {"wifi", "info"};
    _manager.setMenu(menu, 2);

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);

    // Standard WiFiManager flow: try NVS first; open the captive portal only
    // when the saved 2.4 GHz network cannot be reached.
    _manager.autoConnect(apName, apPassword);

    if (_manager.getConfigPortalActive()) {
        SAFEBOX_LOGF("[WiFi] AP=%s password=%s page=http://192.168.4.1\n",
                     apName, apPassword);
    }
    observeConnection();
}

// Processes the portal and detects connection changes.
void WifiSetup::update() {
    _manager.process();
    observeConnection();
}

// Reports whether station mode is connected to a router.
bool WifiSetup::connected() const {
    return WiFi.status() == WL_CONNECTED;
}

// Wraps WiFiManager's non-const portal status getter.
bool WifiSetup::portalActive() {
    return _manager.getConfigPortalActive();
}

// Takes and clears one connection-change event.
bool WifiSetup::takeConnectionChanged() {
    const bool changed = _connectionChanged;
    _connectionChanged = false;
    return changed;
}

// Returns a station IP only while connected.
String WifiSetup::ipAddress() const {
    return connected() ? WiFi.localIP().toString() : String();
}

// Returns a router SSID only while connected.
String WifiSetup::ssid() const {
    return connected() ? WiFi.SSID() : String();
}

// Raises an event only when the connection state changes.
void WifiSetup::observeConnection() {
    const bool nowConnected = connected();
    if (!_observed || nowConnected != _lastConnected) {
        _observed = true;
        _lastConnected = nowConnected;
        _connectionChanged = true;
        if (nowConnected) {
            SAFEBOX_LOGF("[WiFi] Connected to %s, IP %s\n",
                         WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
        } else {
            SAFEBOX_LOG_LN("[WiFi] Router offline; waiting for setup/reconnect");
        }
    }
}
