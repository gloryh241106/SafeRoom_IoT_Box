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
 *   - provision(): starts saved-credential connection or `Safebox-AP` without
 *     blocking the application loop.
 *   - process(): services the captive portal and reopens it after sustained
 *     connection loss. Gas edge safety therefore keeps its 100 ms cadence.
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
    void process();
    bool isConnected() const;
    bool isPortalActive();
    String ipString() const;

private:
    static void onApModeStarted(WiFiManager* manager); // WM -> instance trampoline

    WiFiManager _wm;
    const char* _apName = nullptr;
    ApModeCallback _apModeCallback = nullptr;
    uint32_t _lostFallbackMs = 0;
    uint32_t _lostSinceMs = 0;
    uint32_t _connectTimeoutMs = 0;
    uint32_t _initialConnectStartedMs = 0;
    bool _initialConnectionPending = false;
    bool _portalRestartedForLoss = false;

    static SafeboxWifi* _instance;
};

#endif // __WIFI_MANAGER_H__
