#ifndef __TIME_UTILS_H__
#define __TIME_UTILS_H__

#pragma once

#include <Arduino.h>
#include <time.h>

/*
 * Lightweight NTP-backed clock for telemetry timestamps.
 *
 * The ESP32 has no battery-backed RTC, so on every boot we sync the epoch via
 * NTP. poll() is called every main-loop iteration and only flips _synced once
 * the local time is actually valid (year > 2020); epochMs() returns the real
 * epoch until then, which avoids stamping bogus pre-1970 timestamps.
 */
class SystemClock {
public:
    void begin();
    void poll();
    bool synced() const;
    unsigned long long epochMs() const;

private:
    bool _synced = false;
};

#endif // __TIME_UTILS_H__