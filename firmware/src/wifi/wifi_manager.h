#ifndef __WIFI_MANAGER_H__
#define __WIFI_MANAGER_H__

#pragma once

#include <Arduino.h>
#include <WiFiManager.h>

/*
 * WiFi provisioning wrapper around the tzapu/WiFiManager library.
 *
 *   - begin(...): stores the SoftAP callback and applies connect/portal
 *     timeouts to the underlying WiFiManager instance.
 *   - provision(): tries the saved NVS credentials first; if they fail after
 *     the connect timeout it starts the `Safebox-AP` captive portal (blocking,
 *     at http://192.168.4.1) so the user can save new credentials to NVS.
 *   - handleConnectionLoss(): after a sustained WiFi outage reopens the portal
 *     for re-provisioning and returns true so the caller can reboot.
 *
 * Only one WiFiManager can exist per boot; a single global instance is used.
 */
class SafeboxWifi {
public:
    using ApModeCallback = void (*)();

    void begin(const char* apName,
               ApModeCallback apModeCallback,
               uint32_t connectTimeoutS,
               uint32_t portalTimeoutS,
               uint32_t lostFallbackMs);

    bool provision();
    bool isConnected() const;
    bool handleConnectionLoss();
    String ipString() const;

private:
    static void onApModeStarted(WiFiManager* manager); // WM -> instance trampoline

    WiFiManager _wm;
    const char* _apName = nullptr;
    ApModeCallback _apModeCallback = nullptr;
    uint32_t _lostFallbackMs = 0;
    uint32_t _lostSinceMs = 0;

    static SafeboxWifi* _instance;
};

#endif // __WIFI_MANAGER_H__