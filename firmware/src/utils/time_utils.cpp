#include "time_utils.h"

void SystemClock::begin() {
    configTime(0, 0, "pool.ntp.org");
}

void SystemClock::poll() {
    if (_synced) return;
    time_t now = time(nullptr);
    struct tm* tm = localtime(&now);
    if (tm && tm->tm_year > 120) _synced = true; // year > 2020
}

bool SystemClock::synced() const {
    return _synced;
}

unsigned long long SystemClock::epochMs() const {
    if (!_synced) return 0ULL;
    return static_cast<unsigned long long>(time(nullptr)) * 1000ULL;
}