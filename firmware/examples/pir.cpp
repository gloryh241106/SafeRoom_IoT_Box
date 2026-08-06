int ledPin = 25;      // choose the pin for the LED
int inputPin = 13;     // choose the input pin (for PIR sensor)

void setup() {
  pinMode(ledPin, OUTPUT);      // declare LED as output
  pinMode(inputPin, INPUT);     // declare sensor as input
  Serial.begin(115200);
}


int pirState = HIGH;
void loop() {
  int val = digitalRead(inputPin);
  // put your main code here, to run repeatedly:
  if (val == HIGH)  // check if the input is HIGH
  {           
    digitalWrite(ledPin, HIGH);  // turn LED ON
     if (pirState == LOW) {
      Serial.println("Motion detected!"); // print on output change
      pirState = HIGH;
    }
  } else {
    digitalWrite(ledPin, LOW);
    if (pirState == HIGH) {
      Serial.println("Motion Detection ended!"); 
      pirState = LOW;
    }
  }
}
