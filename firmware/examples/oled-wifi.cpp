// /*********
//   Rui Santos
//   Complete project details at https://randomnerdtutorials.com  
// *********/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 32 // OLED display height, in pixels

// Declaration for an SSD1306 display connected to I2C (SDA, SCL pins)
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// #include <WiFiManager.h>

void setup() {
//   WiFi.mode(WIFI_STA);

  Serial.begin(115200);

//   WiFiManager wm;

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // Address 0x3D for 128x64
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  delay(2000);
  display.clearDisplay();

  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  // Display static text
//   display.println("012345678901234567890");
//   display.println("012345678901234567890");
//   display.println("012345678901234567890");
//   display.println("012345678901234567890");
//   display.display(); 

//   bool res;
//   res = wm.autoConnect("AutoConnectAP", "password1");
//   if(!res){
//     Serial.println("Failed to connect");
//   } else {
//     Serial.println("connected...yeey :)");
//   }
}

int ascii_code = 0;

void loop() {
  display.clearDisplay();
  display.setCursor(0,0);
  display.print(ascii_code);
  display.print(": ");
  display.write((char)ascii_code);
  display.display();
  ascii_code = (ascii_code + 1) % 256;
  delay(1000);
}

// #include <WiFi.h>
// #include <WiFiClientSecure.h>
// #include <PubSubClient.h>

// // WiFi
// const char *ssid = "Bao Khang"; // Enter your Wi-Fi name
// const char *password = "xinlacho";  // Enter Wi-Fi password

// // MQTT Broker
// const char *mqtt_broker = "r2a7b121.ala.asia-southeast1.emqxsl.com";
// const char *topic = "emqx/esp32";
// const char *mqtt_username = "esp32";
// const char *mqtt_password = "123456789";
// const int mqtt_port = 8883; // 1883 plain, 8883 TLS/SSL

// // Certificate
// const char *emqx_ca = \
// "-----BEGIN CERTIFICATE-----\n"\
// "MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh\n" \
// "MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3\n" \
// "d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH\n" \
// "MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT\n" \
// "MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j\n" \
// "b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG\n" \
// "9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI\n" \
// "2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx\n" \
// "1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ\n" \
// "q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz\n" \
// "tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ\n" \
// "vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP\n" \
// "BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV\n" \
// "5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY\n" \
// "1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4\n" \
// "NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG\n" \
// "Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91\n" \
// "8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe\n" \
// "pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl\n" \
// "MrY=\n" \
// "-----END CERTIFICATE-----\n";

// WiFiClientSecure espClient;
// PubSubClient client(espClient);

// void setup() {
//     // Set software serial baud to 115200;
//     Serial.begin(115200);
//     // Connecting to a WiFi network
//     WiFi.begin(ssid, password);
//     while (WiFi.status() != WL_CONNECTED) {
//         delay(500);
//         Serial.println("Connecting to WiFi..");
//     }
//     Serial.println("Connected to the Wi-Fi network");


//     espClient.setCACert(emqx_ca);
//     //connecting to a mqtt broker
//     client.setServer(mqtt_broker, mqtt_port);
//     client.setCallback(callback);
//     while (!client.connected()) {
//         String client_id = "esp32-client-";
//         client_id += String(WiFi.macAddress());
//         Serial.printf("The client %s connects to the public MQTT broker\n", client_id.c_str());
//         if (client.connect(client_id.c_str(), mqtt_username, mqtt_password)) {
//             Serial.println("Public EMQX MQTT broker connected");
//         } else {
//             Serial.print("failed with state ");
//             Serial.print(client.state());
//             delay(2000);
//         }
//     }
//     // Publish and subscribe
//     client.publish(topic, "Hi, I'm ESP32 ^^");
//     client.subscribe(topic);
// }

// void callback(char *topic, byte *payload, unsigned int length) {
//     Serial.print("Message arrived in topic: ");
//     Serial.println(topic);
//     Serial.print("Message:");
//     for (int i = 0; i < length; i++) {
//         Serial.print((char) payload[i]);
//     }
//     Serial.println();
//     Serial.println("-----------------------");
// }

// void loop() {
//     client.loop();
// }