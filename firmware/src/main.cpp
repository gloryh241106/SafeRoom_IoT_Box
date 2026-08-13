#include <Arduino.h>
#include "app/safebox_app.h"

SafeboxApp app;

void setup() {
    app.begin();
}

void loop() {
    app.update();
}
