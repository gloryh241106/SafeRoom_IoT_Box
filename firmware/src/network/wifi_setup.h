#pragma once

#include <Arduino.h>
#include <WiFiManager.h>

/**
 * Small WiFiManager adapter.
 * Tries saved NVS credentials, then opens the captive portal on failure.
 */
class WifiSetup {
public:
    /** Configures WiFiManager and starts automatic provisioning. */
    void begin(const char* apName, const char* apPassword,
               uint8_t connectTimeoutSeconds);

    /** Processes the captive portal and tracks connection changes. */
    void update();

    /** Reports whether station mode has a router connection. */
    bool connected() const;

    /** Reports whether the setup portal is active. */
    bool portalActive();

    /** Takes and clears one connection-change event. */
    bool takeConnectionChanged();

    /** Returns the station IP, or an empty string while offline. */
    String ipAddress() const;

    /** Returns the router SSID, or an empty string while offline. */
    String ssid() const;

private:
    /** Detects connection changes and raises one event for main.cpp. */
    void observeConnection();

    WiFiManager _manager;
    bool _lastConnected = false;       // Previous connection state.
    bool _observed = false;            // True after the first status check.
    bool _connectionChanged = true;    // Event mailbox for main.cpp.
};
