/*
 * SmartCityNet - Vehiculo ADAS administrado desde Eclipse Leshan
 *
 * Hardware de referencia: Heltec WiFi LoRa 32 V3
 * Modo predeterminado: conexion a TTN por LoRaWAN Clase A.
 *
 * Conserva los movimientos documentados en "TIC - Jessica Bracero_Final.pdf"
 * y utiliza la distribucion de pines de la nueva PCB. Añade un bloqueo remoto:
 * al activar Remote Alert desde Leshan, detiene los motores, ignora todos los
 * comandos de movimiento Bluetooth y hace sonar una alarma intermitente.
 * Desactivar la alerta no reanuda el movimiento anterior: hace falta un nuevo
 * comando Bluetooth.
 */

#include "LoRaWan_APP.h"
#include "HT_SSD1306Wire.h"
#include <HardwareSerial.h>
#include "DHT.h"
#include <Preferences.h>
#include <Wire.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "credentials.h"

struct MedicionBateria;

// true: conexion a TTN. false: prueba local por USB y Bluetooth, sin radio.
const bool usarTTN = true;

// Tipo de DHT
#define DHTTYPE DHT11


/* =========================================================
   DISTRIBUCION DE PINES DE LA NUEVA PCB
   ========================================================= */

// Puente H L298N.
const uint8_t PIN_IN1 = 6;
const uint8_t PIN_IN2 = 5;
const uint8_t PIN_IN3 = 4;
const uint8_t PIN_IN4 = 3;
const uint8_t PIN_ENA = 7;
const uint8_t PIN_ENB = 2;

// HC-SR04 frontal y trasero.
const uint8_t PIN_TRIG_FRONTAL = 46;
const uint8_t PIN_ECHO_FRONTAL = 45;
const uint8_t PIN_TRIG_TRASERO = 26;
const uint8_t PIN_ECHO_TRASERO = 48;

// MPU6050 en un bus I2C distinto al OLED integrado.
const uint8_t PIN_MPU_SDA = 41;
const uint8_t PIN_MPU_SCL = 42;


/* =========================================================
   ACTUADORES, BOTON Y PUERTOS SERIE
   ========================================================= */

const uint8_t PIN_BUZZER = 47;
const uint8_t PIN_LUZ_FRONTAL = 39;
const uint8_t PIN_LUZ_TRASERA = 40;
const uint8_t PIN_PARQUEO_IZQUIERDO = 1;
const uint8_t PIN_PARQUEO_DERECHO = 38;

const uint8_t PIN_DHT11 = 34;
const uint8_t PIN_BOTON_PANICO = 33;

// UART1 para HC-06. Conectar HC-06 TX -> GPIO20 y HC-06 RX -> GPIO21.
const uint8_t PIN_BT_RX = 20;
const uint8_t PIN_BT_TX = 21;

// UART2 para GY-GPS6MV2 en modo de solo lectura.
const uint8_t PIN_GPS_RX = 35; // GPS TX -> Heltec GPIO35.

// Divisor para el paquete 3S Li-ion: R1 = 330 kΩ, R2 = 100 kΩ.
// El nodo medio del divisor se conecta a GPIO19. A 12,6 V el ADC recibe
// aproximadamente 2,93 V, dentro del rango configurado con ADC_11db.
const uint8_t PIN_BATERIA = 19;
const float RESISTENCIA_SUPERIOR_BATERIA = 330000.0f;
const float RESISTENCIA_INFERIOR_BATERIA = 100000.0f;
const float FACTOR_DIVISOR_BATERIA =
  (RESISTENCIA_SUPERIOR_BATERIA + RESISTENCIA_INFERIOR_BATERIA) /
  RESISTENCIA_INFERIOR_BATERIA;
const uint8_t CELDAS_BATERIA = 3;
const uint8_t MUESTRAS_BATERIA = 20;


/* =========================================================
   LIMITES DE SEGURIDAD
   Distancias en centimetros e inclinaciones en grados.
   ========================================================= */

// 999 es el indicador del firmware para una distancia sin lectura valida.
const uint16_t SIN_LECTURA = 999;
const uint16_t LIMITE_COLISION = 30;
const uint16_t LIMITE_OBSTACULO = 100;
const uint16_t PARADA_PARQUEO = 10;
const uint16_t PRECAUCION_PARQUEO = 40;

const float LIMITE_VOLCAMIENTO = 40.0f;
const float REARME_VOLCAMIENTO = 30.0f;
const float LIMITE_CURVA = 25.0f;
const uint8_t MUESTRAS_VOLCAMIENTO = 5;


/* =========================================================
   OLED, I2C DEL MPU Y BLUETOOTH
   ========================================================= */

SSD1306Wire pantalla(
  0x3C,
  500000,
  SDA_OLED,
  SCL_OLED,
  GEOMETRY_128_64,
  RST_OLED
);

TwoWire busMpu(1);
HardwareSerial bluetooth(1);
HardwareSerial gps(2);


/* =========================================================
   VARIABLES OBLIGATORIAS DE LA LIBRERIA LORAWAN
   ========================================================= */

// La libreria Heltec requiere estos nombres y tipos. Las claves ABP quedan
// vacias porque el dispositivo se une por OTAA con credentials.h.
uint8_t nwkSKey[16] = {0};
uint8_t appSKey[16] = {0};
uint32_t devAddr = 0x00000000;

uint16_t userChannelsMask[6] = {
  0xFF00,
  0x0000,
  0x0000,
  0x0000,
  0x0000,
  0x0000
};

LoRaMacRegion_t loraWanRegion = ACTIVE_REGION;
DeviceClass_t loraWanClass = CLASS_A;
uint32_t appTxDutyCycle = 30000; // Intervalo de telemetria en milisegundos.
bool overTheAirActivation = true;
bool loraWanAdr = true;
bool isTxConfirmed = false;
uint8_t appPort = 10;
uint8_t confirmedNbTrials = 4;


/* =========================================================
   PROTOCOLO SMARTCITYNET

   Uplink FPort 10:
     tipo 0x02: ACK administrativo existente (8 bytes)
     tipo 0x03: telemetria vehicular con GPS, DHT11 y bateria 3S (42 bytes)

   Downlink FPort 11:
     01 10 txId intervalo_s(4)  -> cambiar intervalo
     01 11 txId estado          -> alerta remota, 0=OFF, 1=ON
     01 12 txId luz estado      -> luz 0=frontal, 1=trasera, 2=parqueo,
                                    3=direccional izquierda, 4=derecha
   ========================================================= */

const uint8_t VERSION_PROTOCOLO = 0x01;
const uint8_t MSG_ACK = 0x02;
const uint8_t MSG_TELEMETRIA = 0x03;
const uint8_t CMD_INTERVALO = 0x10;
const uint8_t CMD_ALERTA = 0x11;
const uint8_t CMD_LUZ = 0x12;
const uint8_t PUERTO_COMANDOS = 11;

const uint8_t LUZ_FRONTAL = 0;
const uint8_t LUZ_TRASERA = 1;
const uint8_t LUZ_PARQUEO = 2;
const uint8_t LUZ_DIRECCIONAL_IZQUIERDA = 3;
const uint8_t LUZ_DIRECCIONAL_DERECHA = 4;

const uint32_t INTERVALO_INICIAL = 30;
const uint32_t INTERVALO_MINIMO = 15;
const uint32_t INTERVALO_MAXIMO = 86400;

const uint8_t CMD_OK = 0;
const uint8_t CMD_FORMATO_INVALIDO = 1;
const uint8_t CMD_NO_SOPORTADO = 2;
const uint8_t CMD_FUERA_DE_RANGO = 3;
const uint8_t REPETICIONES_ACK = 2;
const uint32_t ESPERA_ACK = 3000;

// Estado compartido entre el callback de radio y loop(). La escritura en NVS
// se aplaza hasta loop() para no realizarla dentro del callback.
volatile uint8_t ackPendientes = 0;
volatile bool guardarPendiente = false;
volatile bool alertaRemota = false;
volatile uint8_t ultimaTransaccion = 0;
volatile uint8_t ultimoEstadoComando = CMD_OK;

DHT dht(PIN_DHT11, DHTTYPE);


/* =========================================================
   ESTADO DEL VEHICULO
   ========================================================= */

enum Movimiento : uint8_t
{
  MOV_DETENIDO = 0,
  MOV_ADELANTE = 1,
  MOV_ATRAS = 2,
  MOV_IZQUIERDA = 3,
  MOV_DERECHA = 4,
  MOV_ADELANTE_DERECHA = 5,
  MOV_ATRAS_DERECHA = 6,
  MOV_ADELANTE_IZQUIERDA = 7,
  MOV_ATRAS_IZQUIERDA = 8
};

// Movimiento pedido por Bluetooth frente a la salida aplicada a los motores.
Movimiento movimientoSolicitado = MOV_DETENIDO;
Movimiento movimientoActual = MOV_DETENIDO;
// El firmware recuperado arranca a velocidad maxima y los comandos 0..9 la
// cambian en pasos de 25 (q/Q restaura 255).
uint8_t velocidad = 255;
uint8_t velocidadActual = 0;
uint8_t velocidadIzquierda = 0;
uint8_t velocidadDerecha = 0;

// Distancias en cm. Angulos en grados respecto a la posicion de arranque.
uint16_t distanciaFrontal = SIN_LECTURA;
uint16_t distanciaTrasera = SIN_LECTURA;
float pitch = 0.0f;
float roll = 0.0f;
float inclinacion = 0.0f;
float temperaturaC = 0.0f;
bool mpuDisponible = false;
bool mpuCalibrado = false;

struct Vector3f
{
  float x;
  float y;
  float z;
};

Vector3f gravedadReferencia = {0.0f, 0.0f, 1.0f};
Vector3f ejePitch = {0.0f, 1.0f, 0.0f};
Vector3f ejeRoll = {-1.0f, 0.0f, 0.0f};
Vector3f aceleracionFiltrada = {0.0f, 0.0f, 1.0f};
bool filtroMpuInicializado = false;
uint8_t muestrasVolcamiento = 0;

// Eventos detectados; evaluarEventos() decide cuales estan activos.
bool colision = false;
bool obstaculo = false;
bool volcamiento = false;
bool curvaDerecha = false;
bool curvaIzquierda = false;
bool subida = false;
bool bajada = false;

// Estado solicitado de actuadores. En reversa, la señal automatica de la luz
// trasera tiene prioridad sobre luzTrasera.
bool luzFrontal = false;
bool luzTrasera = false;
bool lucesParqueo = false;
bool direccionalIzquierda = false;
bool direccionalDerecha = false;
bool bocina = false;
bool panicoActivo = false;
bool telemetriaPanicoPendiente = false;

// Mediciones ambientales y posicion que también viajan por telemetria.
float temperaturaAmbiente = 0.0f;
float humedadAmbiente = 0.0f;
bool dhtDisponible = false;

double latitudGps = 0.0;
double longitudGps = 0.0;
bool gpsConPosicion = false;
char lineaGps[100] = {0};
uint8_t posicionLineaGps = 0;

// Fases instantaneas de parpadeo y salida fisica del buzzer.
bool faseIntermitentes = false;
bool faseAlarma = false;
bool faseAvisoReversa = false;
bool faseLuzReversa = false;
bool buzzerSonando = false;

uint32_t contadorEnvios = 0;

// Marcas de millis() para ejecutar cada tarea sin bloquear el resto.
uint32_t ultimoSensor = 0;
uint32_t ultimoMotor = 0;
uint32_t ultimoIntermitente = 0;
uint32_t ultimaAlarma = 0;
uint32_t ultimoAvisoReversa = 0;
uint32_t ultimaLuzReversa = 0;
uint32_t ultimoOLED = 0;
uint32_t ultimoDiagnostico = 0;
uint32_t ultimoDht = 0;
uint32_t ultimaPosicionGps = 0;
uint32_t ultimoCambioPanico = 0;
bool ultimaLecturaPanico = false;
bool botonPanicoPresionado = false;


/* =========================================================
   UTILIDADES BINARIAS Y CONFIGURACION
   ========================================================= */

void programarAck()
{
  // El ACK se repite con el mismo txId. El Bridge lo procesa de forma
  // idempotente y una perdida de radio no deja el estado físico sin confirmar.
  ackPendientes = REPETICIONES_ACK;
  if (usarTTN)
  {
    // Adelanta el siguiente envio para confirmar el comando recibido.
    LoRaWAN.cycle(ESPERA_ACK);
  }
}

void escribirUint16BE(uint8_t *destino, uint16_t valor)
{
  destino[0] = (uint8_t)(valor >> 8);
  destino[1] = (uint8_t)valor;
}

void escribirInt16BE(uint8_t *destino, int16_t valor)
{
  escribirUint16BE(destino, (uint16_t)valor);
}

void escribirUint32BE(uint8_t *destino, uint32_t valor)
{
  destino[0] = (uint8_t)(valor >> 24);
  destino[1] = (uint8_t)(valor >> 16);
  destino[2] = (uint8_t)(valor >> 8);
  destino[3] = (uint8_t)valor;
}

void escribirInt32BE(uint8_t *destino, int32_t valor)
{
  escribirUint32BE(destino, (uint32_t)valor);
}

uint32_t leerUint32BE(const uint8_t *origen)
{
  return ((uint32_t)origen[0] << 24) |
         ((uint32_t)origen[1] << 16) |
         ((uint32_t)origen[2] << 8) |
         (uint32_t)origen[3];
}

int16_t escalarADecimas(float valor)
{
  long escalado = lroundf(valor * 10.0f);
  if (escalado > INT16_MAX)
  {
    escalado = INT16_MAX;
  }
  if (escalado < INT16_MIN)
  {
    escalado = INT16_MIN;
  }
  return (int16_t)escalado;
}

bool esIntervaloValido(uint32_t intervaloSegundos)
{
  return intervaloSegundos >= INTERVALO_MINIMO &&
         intervaloSegundos <= INTERVALO_MAXIMO;
}

struct MedicionBateria
{
  uint16_t milivoltios;
  uint8_t porcentaje;
};

uint8_t calcularPorcentajeCelda(float voltajeCelda)
{
  if (voltajeCelda >= 4.20f)
  {
    return 100;
  }
  if (voltajeCelda <= 3.30f)
  {
    return 0;
  }
  if (voltajeCelda >= 4.00f)
  {
    return (uint8_t)(80.0f + (voltajeCelda - 4.00f) * 100.0f);
  }
  if (voltajeCelda >= 3.85f)
  {
    return (uint8_t)(60.0f + (voltajeCelda - 3.85f) * 133.33f);
  }
  if (voltajeCelda >= 3.70f)
  {
    return (uint8_t)(40.0f + (voltajeCelda - 3.70f) * 133.33f);
  }
  if (voltajeCelda >= 3.50f)
  {
    return (uint8_t)(20.0f + (voltajeCelda - 3.50f) * 100.0f);
  }
  return (uint8_t)((voltajeCelda - 3.30f) * 100.0f);
}

MedicionBateria leerBateria()
{
  uint32_t sumaMilivoltios = 0;
  for (uint8_t muestra = 0; muestra < MUESTRAS_BATERIA; muestra++)
  {
    sumaMilivoltios += analogReadMilliVolts(PIN_BATERIA);
    delay(5);
  }

  const float voltajeAdc =
    (sumaMilivoltios / (float)MUESTRAS_BATERIA) / 1000.0f;
  const float voltajePaquete = voltajeAdc * FACTOR_DIVISOR_BATERIA;
  const float voltajeCelda = voltajePaquete / CELDAS_BATERIA;
  const long milivoltios = lroundf(voltajePaquete * 1000.0f);

  MedicionBateria medicion;
  medicion.milivoltios = (uint16_t)constrain(milivoltios, 0L, 65535L);
  medicion.porcentaje = calcularPorcentajeCelda(voltajeCelda);
  return medicion;
}

void cargarConfiguracion()
{
  Preferences preferencias;
  preferencias.begin("smartcitynet", true);
  uint32_t intervaloS = preferencias.getUInt(
    "tx_seconds",
    INTERVALO_INICIAL
  );
  alertaRemota = preferencias.getBool("remote_alert", false);
  preferencias.end();

  if (!esIntervaloValido(intervaloS))
  {
    intervaloS = INTERVALO_INICIAL;
  }

  appTxDutyCycle = intervaloS * 1000UL;
}

void guardarConfiguracion()
{
  if (!guardarPendiente)
  {
    return;
  }

  Preferences preferencias;
  preferencias.begin("smartcitynet", false);
  preferencias.putUInt("tx_seconds", appTxDutyCycle / 1000UL);
  preferencias.putBool("remote_alert", alertaRemota);
  preferencias.end();
  guardarPendiente = false;
}


/* =========================================================
   SENSORES DHT11 Y GPS
   ========================================================= */

void actualizarDht11()
{
  const uint32_t ahora = millis();
  if (ahora - ultimoDht < 2000UL)
  {
    return;
  }
  ultimoDht = ahora;

  const float temperatura = dht.readTemperature();
  const float humedad = dht.readHumidity();
  dhtDisponible = !isnan(temperatura) && !isnan(humedad);

  if (dhtDisponible)
  {
    temperaturaAmbiente = temperatura;
    humedadAmbiente = humedad;
    // Telemetria de texto para la app Android por el enlace HC-06.
    // Formato: @DHT,disponible,temperatura_C,humedad_porcentaje
    bluetooth.printf(
      "@DHT,1,%.1f,%.1f\n",
      temperaturaAmbiente,
      humedadAmbiente
    );
  }
  else
  {
    bluetooth.print("@DHT,0,0,0\n");
  }
}

uint8_t valorHexadecimal(char caracter)
{
  if (caracter >= '0' && caracter <= '9')
  {
    return caracter - '0';
  }
  if (caracter >= 'A' && caracter <= 'F')
  {
    return caracter - 'A' + 10;
  }
  if (caracter >= 'a' && caracter <= 'f')
  {
    return caracter - 'a' + 10;
  }
  return 0xFF;
}

bool checksumNmeaValido(char *linea)
{
  if (linea[0] != '$')
  {
    return false;
  }

  char *asterisco = strchr(linea, '*');
  if (asterisco == nullptr || asterisco[1] == '\0' || asterisco[2] == '\0')
  {
    return false;
  }

  uint8_t calculado = 0;
  for (char *caracter = linea + 1; caracter < asterisco; caracter++)
  {
    calculado ^= (uint8_t)*caracter;
  }

  const uint8_t alto = valorHexadecimal(asterisco[1]);
  const uint8_t bajo = valorHexadecimal(asterisco[2]);
  if (alto == 0xFF || bajo == 0xFF)
  {
    return false;
  }

  *asterisco = '\0';
  return calculado == (uint8_t)((alto << 4) | bajo);
}

double convertirCoordenadaGps(const char *valor, char hemisferio)
{
  const double coordenadaNmea = atof(valor);
  const int grados = (int)(coordenadaNmea / 100.0);
  const double minutos = coordenadaNmea - grados * 100.0;
  double coordenada = grados + minutos / 60.0;
  if (hemisferio == 'S' || hemisferio == 'W')
  {
    coordenada = -coordenada;
  }
  return coordenada;
}

void procesarLineaGps(char *linea)
{
  if (!checksumNmeaValido(linea))
  {
    return;
  }

  char *campos[7] = {nullptr};
  uint8_t cantidad = 0;
  char *contexto = nullptr;
  char *campo = strtok_r(linea, ",", &contexto);
  while (campo != nullptr && cantidad < 7)
  {
    campos[cantidad++] = campo;
    campo = strtok_r(nullptr, ",", &contexto);
  }

  if (cantidad < 7 ||
      (strcmp(campos[0], "$GPRMC") != 0 && strcmp(campos[0], "$GNRMC") != 0) ||
      campos[2][0] != 'A' || campos[3][0] == '\0' || campos[5][0] == '\0')
  {
    return;
  }

  latitudGps = convertirCoordenadaGps(campos[3], campos[4][0]);
  longitudGps = convertirCoordenadaGps(campos[5], campos[6][0]);
  gpsConPosicion = true;
  ultimaPosicionGps = millis();
}

void actualizarGps()
{
  while (gps.available() > 0)
  {
    const char caracter = (char)gps.read();
    if (caracter == '\n')
    {
      lineaGps[posicionLineaGps] = '\0';
      procesarLineaGps(lineaGps);
      posicionLineaGps = 0;
    }
    else if (caracter != '\r')
    {
      if (posicionLineaGps < sizeof(lineaGps) - 1)
      {
        lineaGps[posicionLineaGps++] = caracter;
      }
      else
      {
        posicionLineaGps = 0;
      }
    }
  }

  if (gpsConPosicion && millis() - ultimaPosicionGps > 5000UL)
  {
    gpsConPosicion = false;
  }
}


/* =========================================================
   OLED
   ========================================================= */

void mostrarOLED(
  const String &linea1,
  const String &linea2 = "",
  const String &linea3 = "",
  const String &linea4 = ""
)
{
  pantalla.clear();
  pantalla.setFont(ArialMT_Plain_10);
  pantalla.setTextAlignment(TEXT_ALIGN_LEFT);
  pantalla.drawString(0, 0, linea1);
  pantalla.drawString(0, 15, linea2);
  pantalla.drawString(0, 30, linea3);
  pantalla.drawString(0, 45, linea4);
  pantalla.display();
}

const char *nombreMovimiento(Movimiento movimiento)
{
  switch (movimiento)
  {
    case MOV_ADELANTE:
      return "ADELANTE";
    case MOV_ATRAS:
      return "ATRAS";
    case MOV_IZQUIERDA:
      return "IZQUIERDA";
    case MOV_DERECHA:
      return "DERECHA";
    case MOV_ADELANTE_DERECHA:
      return "ADEL-DER";
    case MOV_ATRAS_DERECHA:
      return "ATRAS-DER";
    case MOV_ADELANTE_IZQUIERDA:
      return "ADEL-IZQ";
    case MOV_ATRAS_IZQUIERDA:
      return "ATRAS-IZQ";
    default:
      return "DETENIDO";
  }
}

const char *eventoPrincipal()
{
  if (panicoActivo)
  {
    return "PANICO LOCAL";
  }
  if (alertaRemota)
  {
    return "ALERTA REMOTA";
  }
  if (colision)
  {
    return "COLISION";
  }
  if (volcamiento)
  {
    return "VOLCAMIENTO";
  }
  if (obstaculo)
  {
    return "OBSTACULO";
  }
  if (curvaDerecha)
  {
    return "CURVA DERECHA";
  }
  if (curvaIzquierda)
  {
    return "CURVA IZQ";
  }
  if (subida)
  {
    return "SUBIDA";
  }
  if (bajada)
  {
    return "BAJADA";
  }
  return "NORMAL";
}

void actualizarOLED()
{
  const uint32_t ahora = millis();
  if (ahora - ultimoOLED < 500UL)
  {
    return;
  }
  ultimoOLED = ahora;

  if (alertaRemota || panicoActivo)
  {
    const char *alarma = "ALARMA: OFF";
    if (faseAlarma)
    {
      alarma = "ALARMA: ON";
    }
    mostrarOLED(
      panicoActivo ? "PANICO LOCAL" : "ALERTA REMOTA",
      "MOTORES BLOQUEADOS",
      alarma,
      panicoActivo ? "Pulse para liberar" : "Esperando desbloqueo"
    );
    return;
  }

  // Alterna la vista de conduccion con los sensores agregados a la nueva PCB.
  if ((ahora / 3000UL) % 2 == 1)
  {
    String posicion = "GPS: SIN POSICION";
    String coordenada1 = "Esperando satelites";
    String coordenada2 = "";
    if (gpsConPosicion)
    {
      posicion = "GPS: POSICION VALIDA";
      coordenada1 = "Lat: " + String(latitudGps, 6);
      coordenada2 = "Lon: " + String(longitudGps, 6);
    }

    String ambiente = "DHT11: SIN LECTURA";
    if (dhtDisponible)
    {
      ambiente = "T:" + String(temperaturaAmbiente, 1) +
                  "C H:" + String(humedadAmbiente, 0) + "%";
    }
    mostrarOLED(posicion, coordenada1, coordenada2, ambiente);
    return;
  }

  mostrarOLED(
    String(nombreMovimiento(movimientoActual)) + " " +
      String((velocidadActual * 100U) / 255) + "%",
    "F:" + String(distanciaFrontal) + " T:" + String(distanciaTrasera) + " cm",
    "P:" + String(pitch, 1) + " R:" + String(roll, 1),
    eventoPrincipal()
  );
}


/* =========================================================
   MPU6050
   ========================================================= */

bool escribirRegistroMpu(uint8_t registro, uint8_t valor)
{
  busMpu.beginTransmission(0x68);
  busMpu.write(registro);
  busMpu.write(valor);
  return busMpu.endTransmission() == 0;
}

bool iniciarMpu6050()
{
  busMpu.begin(PIN_MPU_SDA, PIN_MPU_SCL, 400000);
  delay(20);
  return escribirRegistroMpu(0x6B, 0x00); // Salir de reposo.
}

float productoPunto(const Vector3f &a, const Vector3f &b)
{
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

Vector3f productoCruz(const Vector3f &a, const Vector3f &b)
{
  return {
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  };
}

bool normalizarVector(Vector3f &vector)
{
  float norma = sqrtf(productoPunto(vector, vector));
  if (norma < 0.001f)
  {
    return false;
  }

  vector.x /= norma;
  vector.y /= norma;
  vector.z /= norma;
  return true;
}

float magnitudVector(const Vector3f &vector)
{
  return sqrtf(productoPunto(vector, vector));
}

Vector3f proyectarSobrePlano(
  const Vector3f &vector,
  const Vector3f &normal
)
{
  float componenteNormal = productoPunto(vector, normal);
  return {
    vector.x - componenteNormal * normal.x,
    vector.y - componenteNormal * normal.y,
    vector.z - componenteNormal * normal.z
  };
}

int16_t leerEnteroMpu()
{
  // El sensor envia primero el byte alto de cada entero de 16 bits.
  const uint8_t byteAlto = busMpu.read();
  const uint8_t byteBajo = busMpu.read();
  return (int16_t)(((uint16_t)byteAlto << 8) | byteBajo);
}

bool leerMuestraMpu(Vector3f &aceleracion, float &temperatura)
{
  busMpu.beginTransmission(0x68);
  busMpu.write(0x3B);
  if (busMpu.endTransmission(false) != 0)
  {
    return false;
  }

  // Leer acelerometro, temperatura y giroscopio desde el registro 0x3B.
  const uint8_t bytesRecibidos = busMpu.requestFrom((uint8_t)0x68, (uint8_t)14, true);
  if (bytesRecibidos != 14)
  {
    return false;
  }

  const int16_t aceleracionCrudaX = leerEnteroMpu();
  const int16_t aceleracionCrudaY = leerEnteroMpu();
  const int16_t aceleracionCrudaZ = leerEnteroMpu();
  const int16_t temperaturaCruda = leerEnteroMpu();

  // Consumir giroscopio X/Y/Z; en esta fase los ángulos usan acelerómetro.
  for (uint8_t i = 0; i < 6; i++)
  {
    busMpu.read();
  }

  // Escalas del MPU6050: aceleracion en g y temperatura en grados Celsius.
  aceleracion.x = aceleracionCrudaX / 16384.0f;
  aceleracion.y = aceleracionCrudaY / 16384.0f;
  aceleracion.z = aceleracionCrudaZ / 16384.0f;
  temperatura = temperaturaCruda / 340.0f + 36.53f;
  return true;
}

bool calibrarMpuVertical()
{
  const uint8_t muestrasNecesarias = 40;
  const uint8_t intentosMaximos = 80;
  Vector3f suma = {0.0f, 0.0f, 0.0f};
  uint8_t muestrasValidas = 0;

  Serial.println("[MPU6050] Calibrando posicion vertical; mantenga el vehiculo inmovil...");

  for (uint8_t intento = 0;
       intento < intentosMaximos && muestrasValidas < muestrasNecesarias;
       intento++)
  {
    Vector3f muestra;
    float temperatura;

    if (leerMuestraMpu(muestra, temperatura))
    {
      const float magnitudGravedad = magnitudVector(muestra);
      const bool muestraEstable = magnitudGravedad >= 0.80f && magnitudGravedad <= 1.20f;
      if (muestraEstable)
      {
        suma.x += muestra.x;
        suma.y += muestra.y;
        suma.z += muestra.z;
        temperaturaC = temperatura;
        muestrasValidas++;
      }
    }
    delay(20);
  }

  if (muestrasValidas < muestrasNecesarias)
  {
    Serial.println("[MPU6050] No fue posible obtener una referencia estable");
    return false;
  }

  gravedadReferencia = {
    suma.x / muestrasValidas,
    suma.y / muestrasValidas,
    suma.z / muestrasValidas
  };
  if (!normalizarVector(gravedadReferencia))
  {
    return false;
  }

  // Proyectar los ejes del sensor sobre el plano horizontal relativo. Se
  // prefiere Y (coincide con la formula original cuando Z es vertical), pero
  // se elige otro eje si el montaje vertical deja Y paralelo a la gravedad.
  const Vector3f sensorY = {0.0f, 1.0f, 0.0f};
  const Vector3f sensorZ = {0.0f, 0.0f, 1.0f};
  const Vector3f sensorX = {1.0f, 0.0f, 0.0f};
  ejePitch = proyectarSobrePlano(sensorY, gravedadReferencia);
  float mejorMagnitud = magnitudVector(ejePitch);

  Vector3f candidato = proyectarSobrePlano(sensorZ, gravedadReferencia);
  float magnitudCandidato = magnitudVector(candidato);
  if (magnitudCandidato > mejorMagnitud + 0.05f)
  {
    ejePitch = candidato;
    mejorMagnitud = magnitudCandidato;
  }

  candidato = proyectarSobrePlano(sensorX, gravedadReferencia);
  magnitudCandidato = magnitudVector(candidato);
  if (magnitudCandidato > mejorMagnitud + 0.05f)
  {
    ejePitch = candidato;
  }
  if (!normalizarVector(ejePitch))
  {
    return false;
  }

  ejeRoll = productoCruz(gravedadReferencia, ejePitch);
  if (!normalizarVector(ejeRoll))
  {
    return false;
  }

  aceleracionFiltrada = gravedadReferencia;
  filtroMpuInicializado = true;
  mpuCalibrado = true;

  Serial.printf(
    "[MPU6050] Referencia OK: X=%.3f Y=%.3f Z=%.3f\r\n",
    gravedadReferencia.x,
    gravedadReferencia.y,
    gravedadReferencia.z
  );
  return true;
}

bool leerMpu6050()
{
  Vector3f muestra;
  float temperatura;
  if (!mpuCalibrado)
  {
    return false;
  }
  if (!leerMuestraMpu(muestra, temperatura))
  {
    return false;
  }

  if (!filtroMpuInicializado)
  {
    aceleracionFiltrada = muestra;
    filtroMpuInicializado = true;
  }
  else
  {
    aceleracionFiltrada.x += 0.20f * (muestra.x - aceleracionFiltrada.x);
    aceleracionFiltrada.y += 0.20f * (muestra.y - aceleracionFiltrada.y);
    aceleracionFiltrada.z += 0.20f * (muestra.z - aceleracionFiltrada.z);
  }

  Vector3f gravedadActual = aceleracionFiltrada;
  if (!normalizarVector(gravedadActual))
  {
    return false;
  }

  float vertical = productoPunto(gravedadActual, gravedadReferencia);
  float componentePitch = productoPunto(gravedadActual, ejePitch);
  float componenteRoll = productoPunto(gravedadActual, ejeRoll);
  vertical = constrain(vertical, -1.0f, 1.0f);

  pitch = atan2f(componentePitch, vertical) * 180.0f / PI;
  roll = atan2f(componenteRoll, vertical) * 180.0f / PI;
  inclinacion = atan2f(
    sqrtf(componentePitch * componentePitch + componenteRoll * componenteRoll),
    vertical
  ) * 180.0f / PI;
  temperaturaC = temperatura;
  return true;
}


/* =========================================================
   SENSORES ULTRASONICOS Y EVENTOS
   ========================================================= */

uint16_t leerDistanciaCm(uint8_t pinTrigger, uint8_t pinEco)
{
  digitalWrite(pinTrigger, LOW);
  delayMicroseconds(2);
  digitalWrite(pinTrigger, HIGH);
  delayMicroseconds(10);
  digitalWrite(pinTrigger, LOW);

  const uint32_t duracionEcoUs = pulseIn(pinEco, HIGH, 30000UL);
  // 0,034 cm/us y division entre 2 por el recorrido de ida y vuelta.
  const uint32_t distanciaCm = duracionEcoUs * 34UL / 2000UL;
  const bool lecturaInvalida = duracionEcoUs == 0 || distanciaCm == 0;
  if (lecturaInvalida || distanciaCm > 400)
  {
    return SIN_LECTURA;
  }
  return (uint16_t)distanciaCm;
}

void evaluarEventos()
{
  colision = distanciaFrontal > 0 && distanciaFrontal < LIMITE_COLISION;
  obstaculo = distanciaFrontal >= LIMITE_COLISION && distanciaFrontal < LIMITE_OBSTACULO;

  if (!mpuDisponible || !mpuCalibrado)
  {
    muestrasVolcamiento = 0;
    volcamiento = false;
    curvaDerecha = false;
    curvaIzquierda = false;
    subida = false;
    bajada = false;
    return;
  }

  // Confirmar durante aproximadamente un segundo y rearmar por debajo de
  // 30 grados. Esto evita disparos por vibracion o aceleraciones breves.
  if (inclinacion >= LIMITE_VOLCAMIENTO)
  {
    if (muestrasVolcamiento < MUESTRAS_VOLCAMIENTO)
    {
      muestrasVolcamiento++;
    }
    if (muestrasVolcamiento >= MUESTRAS_VOLCAMIENTO)
    {
      volcamiento = true;
    }
  }
  else if (inclinacion <= REARME_VOLCAMIENTO)
  {
    muestrasVolcamiento = 0;
    volcamiento = false;
  }
  else if (!volcamiento && muestrasVolcamiento > 0)
  {
    muestrasVolcamiento--;
  }

  curvaDerecha = roll > LIMITE_CURVA;
  curvaIzquierda = roll < -LIMITE_CURVA;
  subida = pitch > LIMITE_CURVA;
  bajada = pitch < -LIMITE_CURVA;
}

void actualizarSensores()
{
  const uint32_t ahora = millis();
  if (ahora - ultimoSensor < 200UL)
  {
    return;
  }
  ultimoSensor = ahora;

  distanciaFrontal = leerDistanciaCm(PIN_TRIG_FRONTAL, PIN_ECHO_FRONTAL);
  distanciaTrasera = leerDistanciaCm(PIN_TRIG_TRASERO, PIN_ECHO_TRASERO);
  mpuDisponible = leerMpu6050();
  evaluarEventos();
}


/* =========================================================
   CONTROL DEL PUENTE H L298N
   ========================================================= */

void detenerMotoresInmediato()
{
  analogWrite(PIN_ENA, 0);
  analogWrite(PIN_ENB, 0);
  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, LOW);
  velocidadActual = 0;
  velocidadIzquierda = 0;
  velocidadDerecha = 0;
  movimientoActual = MOV_DETENIDO;
}

void aplicarDireccion(Movimiento movimiento)
{
  // En el montaje real del TIC el motor derecho tiene polaridad electrica
  // inversa. Estos niveles proceden de las rutinas del firmware recuperado.
  switch (movimiento)
  {
    case MOV_ADELANTE:
    case MOV_ADELANTE_DERECHA:
    case MOV_ADELANTE_IZQUIERDA:
      digitalWrite(PIN_IN1, HIGH);
      digitalWrite(PIN_IN2, LOW);
      digitalWrite(PIN_IN3, LOW);
      digitalWrite(PIN_IN4, HIGH);
      break;
    case MOV_ATRAS:
    case MOV_ATRAS_DERECHA:
    case MOV_ATRAS_IZQUIERDA:
      digitalWrite(PIN_IN1, LOW);
      digitalWrite(PIN_IN2, HIGH);
      digitalWrite(PIN_IN3, HIGH);
      digitalWrite(PIN_IN4, LOW);
      break;
    case MOV_IZQUIERDA:
      digitalWrite(PIN_IN1, LOW);
      digitalWrite(PIN_IN2, HIGH);
      digitalWrite(PIN_IN3, LOW);
      digitalWrite(PIN_IN4, HIGH);
      break;
    case MOV_DERECHA:
      digitalWrite(PIN_IN1, HIGH);
      digitalWrite(PIN_IN2, LOW);
      digitalWrite(PIN_IN3, HIGH);
      digitalWrite(PIN_IN4, LOW);
      break;
    default:
      digitalWrite(PIN_IN1, LOW);
      digitalWrite(PIN_IN2, LOW);
      digitalWrite(PIN_IN3, LOW);
      digitalWrite(PIN_IN4, LOW);
      break;
  }
}

void calcularVelocidadesRuedas(
  Movimiento movimiento,
  uint8_t velocidadBase,
  uint8_t &velocidadIzquierda,
  uint8_t &velocidadDerecha
)
{
  velocidadIzquierda = velocidadBase;
  velocidadDerecha = velocidadBase;

  // Las diagonales del TIC no detienen una rueda: reducen al 50 % la rueda
  // del lado hacia el que gira el vehiculo.
  switch (movimiento)
  {
    case MOV_ADELANTE_IZQUIERDA:
    case MOV_ATRAS_IZQUIERDA:
      velocidadIzquierda = velocidadBase / 2;
      break;
    case MOV_ADELANTE_DERECHA:
    case MOV_ATRAS_DERECHA:
      velocidadDerecha = velocidadBase / 2;
      break;
    default:
      break; // Rectas y giros sobre el eje conservan la velocidad base.
  }
}

bool movimientoHaciaAtras(Movimiento movimiento)
{
  return movimiento == MOV_ATRAS ||
         movimiento == MOV_ATRAS_DERECHA ||
         movimiento == MOV_ATRAS_IZQUIERDA;
}

bool movimientoHaciaAdelante(Movimiento movimiento)
{
  return movimiento == MOV_ADELANTE ||
         movimiento == MOV_ADELANTE_DERECHA ||
         movimiento == MOV_ADELANTE_IZQUIERDA;
}

bool objetoMuyCerca(uint16_t distancia)
{
  if (lucesParqueo)
  {
    return distancia > 0 && distancia <= PARADA_PARQUEO;
  }
  return distancia > 0 && distancia < LIMITE_COLISION;
}

bool objetoCerca(uint16_t distancia)
{
  if (lucesParqueo)
  {
    return distancia > PARADA_PARQUEO && distancia < PRECAUCION_PARQUEO;
  }
  return distancia >= LIMITE_COLISION && distancia < LIMITE_OBSTACULO;
}

void actualizarMotores()
{
  const uint32_t ahora = millis();
  if (ahora - ultimoMotor < 40UL)
  {
    return;
  }
  ultimoMotor = ahora;

  // Los bloqueos local y remoto tienen prioridad absoluta.
  if (alertaRemota || panicoActivo)
  {
    movimientoSolicitado = MOV_DETENIDO;
    detenerMotoresInmediato();
    return;
  }

  uint8_t velocidadObjetivo = velocidad;
  const Movimiento movimientoObjetivo = movimientoSolicitado;

  if (movimientoObjetivo == MOV_DETENIDO)
  {
    detenerMotoresInmediato();
    return;
  }

  // Cada sensor bloquea solamente el movimiento que se dirige hacia el
  // objeto. Los giros sobre el eje quedan libres para poder maniobrar.
  const bool bloqueoDelantero = objetoMuyCerca(distanciaFrontal) &&
                                movimientoHaciaAdelante(movimientoObjetivo);
  const bool bloqueoTrasero = objetoMuyCerca(distanciaTrasera) &&
                              movimientoHaciaAtras(movimientoObjetivo);

  if (bloqueoDelantero || bloqueoTrasero)
  {
    detenerMotoresInmediato();
    return;
  }

  // El volcamiento sigue bloqueando todas las direcciones. A diferencia de un
  // objeto cercano, conserva el frenado progresivo del firmware original.
  if (volcamiento)
  {
    velocidadObjetivo = 0;
  }
  else
  {
    const bool precaucionDelantera = objetoCerca(distanciaFrontal) &&
                                     movimientoHaciaAdelante(movimientoObjetivo);
    const bool precaucionTrasera = objetoCerca(distanciaTrasera) &&
                                   movimientoHaciaAtras(movimientoObjetivo);
    if ((precaucionDelantera || precaucionTrasera) && velocidadObjetivo > 100)
    {
      velocidadObjetivo = 100;
    }
  }

  if (volcamiento && velocidadActual > velocidadObjetivo)
  {
    if (velocidadActual > 20)
    {
      velocidadActual -= 20;
    }
    else
    {
      velocidadActual = 0;
    }
  }
  else
  {
    // Los comandos se aplican inmediatamente; el frenado por volcamiento es
    // el único que se realiza de forma progresiva.
    velocidadActual = velocidadObjetivo;
  }

  if (velocidadActual == 0 && velocidadObjetivo == 0)
  {
    detenerMotoresInmediato();
    return;
  }

  aplicarDireccion(movimientoObjetivo);
  calcularVelocidadesRuedas(
    movimientoObjetivo,
    velocidadActual,
    velocidadIzquierda,
    velocidadDerecha
  );
  analogWrite(PIN_ENA, velocidadIzquierda);
  analogWrite(PIN_ENB, velocidadDerecha);
  movimientoActual = movimientoObjetivo;
}

void actualizarBotonPanico()
{
  const uint32_t ahora = millis();
  const bool lectura = digitalRead(PIN_BOTON_PANICO) == LOW;

  if (lectura != ultimaLecturaPanico)
  {
    ultimaLecturaPanico = lectura;
    ultimoCambioPanico = ahora;
  }

  if (ahora - ultimoCambioPanico < 40UL || lectura == botonPanicoPresionado)
  {
    return;
  }

  botonPanicoPresionado = lectura;
  if (!botonPanicoPresionado)
  {
    return;
  }

  // La primera pulsacion bloquea el vehiculo; la siguiente lo libera. Al
  // liberar nunca se reanuda el movimiento anterior.
  panicoActivo = !panicoActivo;
  telemetriaPanicoPendiente = true;
  movimientoSolicitado = MOV_DETENIDO;
  detenerMotoresInmediato();
  if (usarTTN && deviceState == DEVICE_STATE_SLEEP)
  {
    // Adelanta el uplink para informar el cambio sin esperar todo el intervalo.
    LoRaWAN.cycle(1000UL);
  }
  Serial.printf("[Panico] %s\r\n", panicoActivo ? "ACTIVADO" : "DESACTIVADO");
}


/* =========================================================
   BLUETOOTH Y ACTUADORES
   ========================================================= */

bool esComandoMovimiento(char comando)
{
  switch (comando)
  {
    case 'F':
    case 'B':
    case 'L':
    case 'R':
    case 'S':
    case 'I':
    case 'J':
    case 'G':
    case 'H':
      return true;
    default:
      return false;
  }
}

char normalizarComandoBluetooth(char comando)
{
  // Estas minusculas apagan actuadores. El resto de las letras se acepta
  // indistintamente en mayuscula o minuscula.
  switch (comando)
  {
    case 'c':
    case 'w':
    case 'u':
    case 'v':
    case 'x':
    case 'z':
      return comando;
    default:
      if (comando >= 'a' && comando <= 'z')
      {
        return comando - ('a' - 'A');
      }
      return comando;
  }
}

void configurarIntermitente(uint8_t luz, bool encendida)
{
  if (luz == LUZ_PARQUEO)
  {
    lucesParqueo = encendida;
    if (encendida)
    {
      direccionalIzquierda = false;
      direccionalDerecha = false;
    }
  }
  else if (luz == LUZ_DIRECCIONAL_IZQUIERDA)
  {
    direccionalIzquierda = encendida;
    if (encendida)
    {
      lucesParqueo = false;
      direccionalDerecha = false;
    }
  }
  else if (luz == LUZ_DIRECCIONAL_DERECHA)
  {
    direccionalDerecha = encendida;
    if (encendida)
    {
      lucesParqueo = false;
      direccionalIzquierda = false;
    }
  }

  if (!lucesParqueo && !direccionalIzquierda && !direccionalDerecha)
  {
    faseIntermitentes = false;
  }
}

void procesarComandoBluetooth(char comando)
{
  if (comando == '\r' || comando == '\n')
  {
    return;
  }

  const char orden = normalizarComandoBluetooth(comando);

  if ((alertaRemota || panicoActivo) && esComandoMovimiento(orden))
  {
    movimientoSolicitado = MOV_DETENIDO;
    Serial.printf(
      "[Bluetooth] Movimiento %c ignorado: bloqueo activo\r\n",
      orden
    );
    return;
  }

  switch (orden)
  {
    // Direccion y parada.
    case 'F':
      movimientoSolicitado = MOV_ADELANTE;
      break;
    case 'B':
      movimientoSolicitado = MOV_ATRAS;
      break;
    case 'L':
      movimientoSolicitado = MOV_IZQUIERDA;
      break;
    case 'R':
      movimientoSolicitado = MOV_DERECHA;
      break;
    case 'S':
    case 'D':
      movimientoSolicitado = MOV_DETENIDO;
      break;
    case 'I':
      movimientoSolicitado = MOV_ADELANTE_DERECHA;
      break;
    case 'J':
      movimientoSolicitado = MOV_ATRAS_DERECHA;
      break;
    case 'G':
      movimientoSolicitado = MOV_ADELANTE_IZQUIERDA;
      break;
    case 'H':
      movimientoSolicitado = MOV_ATRAS_IZQUIERDA;
      break;

    // Actuadores: mayuscula enciende, minuscula apaga.
    case 'W':
      luzFrontal = true;
      break;
    case 'w':
      luzFrontal = false;
      break;
    case 'U':
      luzTrasera = true;
      break;
    case 'u':
      luzTrasera = false;
      break;
    case 'X':
      configurarIntermitente(LUZ_PARQUEO, true);
      break;
    case 'x':
      configurarIntermitente(LUZ_PARQUEO, false);
      break;
    case 'Z':
      configurarIntermitente(LUZ_DIRECCIONAL_IZQUIERDA, true);
      break;
    case 'z':
      configurarIntermitente(LUZ_DIRECCIONAL_IZQUIERDA, false);
      break;
    case 'C':
      configurarIntermitente(LUZ_DIRECCIONAL_DERECHA, true);
      break;
    case 'c':
      configurarIntermitente(LUZ_DIRECCIONAL_DERECHA, false);
      break;
    case 'V':
      bocina = true;
      break;
    case 'v':
      bocina = false;
      break;

    // Velocidad: 0..9 seleccionan pasos de 25; Q selecciona el maximo.
    case 'Q':
      velocidad = 255;
      break;
    default:
      if (orden < '0' || orden > '9')
      {
        return;
      }
      velocidad = (orden - '0') * 25;
      break;
  }

  Serial.printf(
    "[Bluetooth] comando=%c movimiento=%s velocidad=%u\r\n",
    orden,
    nombreMovimiento(movimientoSolicitado),
    velocidad
  );
}

void actualizarBluetooth()
{
  while (bluetooth.available() > 0)
  {
    procesarComandoBluetooth((char)bluetooth.read());
  }
}

// En modo local, el monitor serie USB acepta los mismos comandos del HC-06.
// Esto permite probar motores y actuadores incluso sin el modulo Bluetooth.
void actualizarControlUsbLocal()
{
  while (Serial.available() > 0)
  {
    procesarComandoBluetooth((char)Serial.read());
  }
}

void imprimirDiagnosticoLocal()
{
  const uint32_t ahora = millis();
  if (ahora - ultimoDiagnostico < 1000UL)
  {
    return;
  }
  ultimoDiagnostico = ahora;

  const char *estadoMpu = "ERROR";
  if (mpuDisponible)
  {
    estadoMpu = "OK";
  }
  Serial.printf(
    "[LOCAL] F=%u cm T=%u cm MPU=%s Pitch=%.1f Roll=%.1f Incl=%.1f Temp=%.1f C Movimiento=%s Vel=%u%% PWM-I=%u PWM-D=%u Evento=%s\r\n",
    distanciaFrontal,
    distanciaTrasera,
    estadoMpu,
    pitch,
    roll,
    inclinacion,
    temperaturaC,
    nombreMovimiento(movimientoActual),
    (velocidadActual * 100U) / 255,
    velocidadIzquierda,
    velocidadDerecha,
    eventoPrincipal()
  );

  if (gpsConPosicion)
  {
    Serial.printf(
      "[LOCAL] GPS lat=%.6f lon=%.6f",
      latitudGps,
      longitudGps
    );
  }
  else
  {
    Serial.print("[LOCAL] GPS sin posicion");
  }
  if (dhtDisponible)
  {
    Serial.printf(
      " DHT11=%.1f C, %.0f %%\r\n",
      temperaturaAmbiente,
      humedadAmbiente
    );
  }
  else
  {
    Serial.println(" DHT11 sin lectura");
  }
}

void escribirBuzzer(bool encendido)
{
  if (encendido == buzzerSonando)
  {
    return;
  }
  buzzerSonando = encendido;
  // El TIC usa un buzzer activo: se gobierna directamente en HIGH/LOW.
  digitalWrite(PIN_BUZZER, encendido);
}

void escribirIntermitentes(bool izquierda, bool derecha)
{
  digitalWrite(PIN_PARQUEO_IZQUIERDO, izquierda);
  digitalWrite(PIN_PARQUEO_DERECHO, derecha);
}

bool actualizarAvisoReversa(uint32_t ahora)
{
  const bool enReversa = movimientoHaciaAtras(movimientoSolicitado);
  const bool distanciaValida = distanciaTrasera != SIN_LECTURA;
  const bool obstaculoCercano = distanciaTrasera <= 80;

  if (!enReversa || !distanciaValida || !obstaculoCercano)
  {
    faseAvisoReversa = false;
    return false;
  }

  if (distanciaTrasera <= 10)
  {
    faseAvisoReversa = true;
    return true;
  }

  // Entre 11 y 80 cm el intervalo aumenta de 60 a 700 ms: cuanto mas cerca
  // esta el obstaculo, mas rapido suena el aviso.
  uint32_t intervaloAvisoMs = map(distanciaTrasera, 10, 80, 60, 700);
  intervaloAvisoMs = constrain(intervaloAvisoMs, 60UL, 700UL);
  if (ahora - ultimoAvisoReversa >= intervaloAvisoMs)
  {
    ultimoAvisoReversa = ahora;
    faseAvisoReversa = !faseAvisoReversa;
  }
  return faseAvisoReversa;
}

bool actualizarLuzTrasera(uint32_t ahora)
{
  if (!movimientoHaciaAtras(movimientoSolicitado))
  {
    faseLuzReversa = false;
    return luzTrasera;
  }

  if (ahora - ultimaLuzReversa >= 300UL)
  {
    ultimaLuzReversa = ahora;
    faseLuzReversa = !faseLuzReversa;
  }
  return faseLuzReversa;
}

void actualizarActuadores()
{
  const uint32_t ahora = millis();

  const bool intermitentesActivos =
    lucesParqueo || direccionalIzquierda || direccionalDerecha;
  if (!intermitentesActivos)
  {
    faseIntermitentes = false;
  }
  else if (ahora - ultimoIntermitente >= 300UL)
  {
    ultimoIntermitente = ahora;
    faseIntermitentes = !faseIntermitentes;
  }

  const bool alarmaActiva = alertaRemota || panicoActivo;
  if (!alarmaActiva)
  {
    faseAlarma = false;
  }
  else if (ahora - ultimaAlarma >= 300UL)
  {
    ultimaAlarma = ahora;
    faseAlarma = !faseAlarma;
  }

  const bool avisoReversa = actualizarAvisoReversa(ahora);
  const bool salidaLuzTrasera = actualizarLuzTrasera(ahora);

  // true enciende la salida (HIGH); false la apaga (LOW).
  digitalWrite(PIN_LUZ_FRONTAL, luzFrontal);
  digitalWrite(PIN_LUZ_TRASERA, salidaLuzTrasera);
  escribirIntermitentes(
    faseIntermitentes && (lucesParqueo || direccionalIzquierda),
    faseIntermitentes && (lucesParqueo || direccionalDerecha)
  );
  // Cualquier alarma tiene prioridad sobre la bocina y el aviso de reversa.
  if (alarmaActiva)
  {
    escribirBuzzer(faseAlarma);
  }
  else
  {
    escribirBuzzer(bocina || avisoReversa);
  }
}


/* =========================================================
   TELEMETRIA VEHICULAR
   ========================================================= */

uint8_t construirFlagsActuadores()
{
  uint8_t flags = 0;
  if (luzFrontal)
  {
    flags |= 1U << 0;
  }
  if (buzzerSonando)
  {
    flags |= 1U << 1;
  }
  if (movimientoHaciaAtras(movimientoSolicitado))
  {
    flags |= 1U << 2;
  }
  if (lucesParqueo)
  {
    flags |= 1U << 3;
  }
  if (luzTrasera)
  {
    flags |= 1U << 4;
  }
  if (alertaRemota)
  {
    flags |= 1U << 5;
  }
  if (direccionalIzquierda)
  {
    flags |= 1U << 6;
  }
  if (direccionalDerecha)
  {
    flags |= 1U << 7;
  }
  return flags;
}

uint8_t construirFlagsEventos()
{
  uint8_t flags = 0;
  if (colision)
  {
    flags |= 1U << 0;
  }
  if (obstaculo)
  {
    flags |= 1U << 1;
  }
  if (volcamiento)
  {
    flags |= 1U << 2;
  }
  if (curvaDerecha)
  {
    flags |= 1U << 3;
  }
  if (curvaIzquierda)
  {
    flags |= 1U << 4;
  }
  if (subida)
  {
    flags |= 1U << 5;
  }
  if (bajada)
  {
    flags |= 1U << 6;
  }
  if (alertaRemota)
  {
    flags |= 1U << 7;
  }
  return flags;
}

void prepararTelemetria()
{
  uint8_t flags = 0x01; // Sesión LoRaWAN activa.
  if (alertaRemota)
  {
    flags |= 1U << 1;
  }
  if (mpuDisponible)
  {
    flags |= 1U << 2;
  }
  if (gpsConPosicion)
  {
    flags |= 1U << 3;
  }
  if (dhtDisponible)
  {
    flags |= 1U << 4;
  }
  if (panicoActivo)
  {
    flags |= 1U << 5;
  }

  // Cabecera: version, tipo, flags, transaccion y resultado del comando.
  appData[0] = VERSION_PROTOCOLO;
  appData[1] = MSG_TELEMETRIA;
  appData[2] = flags;
  appData[3] = ultimaTransaccion;
  appData[4] = ultimoEstadoComando;

  // Bytes 5..20 conservan la estructura de 16 bytes definida en el TIC.
  appData[5] = (uint8_t)movimientoActual;
  appData[6] = (uint8_t)((velocidadActual * 100U) / 255);
  escribirUint16BE(&appData[7], distanciaFrontal);
  escribirUint16BE(&appData[9], distanciaTrasera);
  escribirInt16BE(&appData[11], escalarADecimas(pitch));
  escribirInt16BE(&appData[13], escalarADecimas(roll));
  escribirInt16BE(&appData[15], escalarADecimas(temperaturaC));
  appData[17] = construirFlagsActuadores();
  appData[18] = construirFlagsEventos();
  appData[19] = (uint8_t)(contadorEnvios & 0xFF);

  uint8_t checksum = 0;
  for (uint8_t posicion = 5; posicion < 20; posicion++)
  {
    checksum ^= appData[posicion];
  }
  appData[20] = checksum;

  // Campos administrativos: intervalo, voltaje y porcentaje de bateria 3S.
  const MedicionBateria bateria = leerBateria();
  escribirUint32BE(&appData[21], appTxDutyCycle / 1000UL);
  escribirUint16BE(&appData[25], bateria.milivoltios);

  // Posicion GPS en grados decimales multiplicados por 10^7. Si no existe una
  // posicion valida se envian ceros y el bit GPS de la cabecera permanece en 0.
  const int32_t latitudEscalada = gpsConPosicion
    ? (int32_t)llround(latitudGps * 10000000.0)
    : 0;
  const int32_t longitudEscalada = gpsConPosicion
    ? (int32_t)llround(longitudGps * 10000000.0)
    : 0;
  escribirInt32BE(&appData[27], latitudEscalada);
  escribirInt32BE(&appData[31], longitudEscalada);

  uint8_t checksumGps = 0;
  for (uint8_t posicion = 27; posicion < 35; posicion++)
  {
    checksumGps ^= appData[posicion];
  }
  appData[35] = checksumGps;

  // Temperatura ambiente y humedad relativa en decimas. El bit DHT de la
  // cabecera permite distinguir una lectura valida de los ceros de relleno.
  const int16_t temperaturaAmbienteEscalada = dhtDisponible
    ? escalarADecimas(temperaturaAmbiente)
    : 0;
  const uint16_t humedadAmbienteEscalada = dhtDisponible
    ? (uint16_t)lroundf(humedadAmbiente * 10.0f)
    : 0;
  escribirInt16BE(&appData[36], temperaturaAmbienteEscalada);
  escribirUint16BE(&appData[38], humedadAmbienteEscalada);

  uint8_t checksumDht = 0;
  for (uint8_t posicion = 36; posicion < 40; posicion++)
  {
    checksumDht ^= appData[posicion];
  }
  appData[40] = checksumDht;
  appData[41] = bateria.porcentaje;
  appDataSize = 42;
}

void prepararEnvio()
{
  const bool enviandoAck = ackPendientes > 0;
  isTxConfirmed = enviandoAck || telemetriaPanicoPendiente;

  if (enviandoAck)
  {
    appData[0] = VERSION_PROTOCOLO;
    appData[1] = MSG_ACK;
    appData[2] = ultimaTransaccion;
    appData[3] = ultimoEstadoComando;
    escribirUint32BE(&appData[4], appTxDutyCycle / 1000UL);
    appDataSize = 8;
    ackPendientes--;
    Serial.printf(
      "[Gestion] ACK txId=%u, repeticiones restantes=%u\r\n",
      ultimaTransaccion,
      ackPendientes
    );
    return;
  }

  prepararTelemetria();
}


/* =========================================================
   RECEPCION DE COMANDOS ADMINISTRATIVOS
   ========================================================= */

void procesarIntervalo(const uint8_t *datos, uint8_t longitud)
{
  // Trama: version, comando, transaccion, intervalo (4 bytes).
  if (longitud != 7)
  {
    Serial.println("[Gestion] Longitud invalida para intervalo");
    programarAck();
    return;
  }

  const uint32_t nuevoIntervaloS = leerUint32BE(&datos[3]);
  if (!esIntervaloValido(nuevoIntervaloS))
  {
    ultimoEstadoComando = CMD_FUERA_DE_RANGO;
    Serial.println("[Gestion] Intervalo fuera de rango");
    programarAck();
    return;
  }

  appTxDutyCycle = nuevoIntervaloS * 1000UL;
  ultimoEstadoComando = CMD_OK;
  guardarPendiente = true;
  programarAck();
  Serial.printf("[Gestion] Intervalo aplicado: %lu s\r\n", (unsigned long)nuevoIntervaloS);
}

void procesarAlerta(const uint8_t *datos, uint8_t longitud)
{
  // Trama: version, comando, transaccion, estado (0 o 1).
  if (longitud != 4)
  {
    Serial.println("[Gestion] Valor de alerta invalido");
    programarAck();
    return;
  }

  const uint8_t estado = datos[3];
  if (estado > 1)
  {
    Serial.println("[Gestion] Valor de alerta invalido");
    programarAck();
    return;
  }

  alertaRemota = estado == 1;
  movimientoSolicitado = MOV_DETENIDO;
  ultimoEstadoComando = CMD_OK;
  guardarPendiente = true;
  programarAck();
  const char *texto = "DESACTIVADA";
  if (alertaRemota)
  {
    texto = "ACTIVADA";
  }
  Serial.printf(
    "[Gestion] Alerta remota %s, txId=%u\r\n",
    texto,
    ultimaTransaccion
  );
}

void procesarLuz(const uint8_t *datos, uint8_t longitud)
{
  // Trama: version, comando, transaccion, luz, estado (0 o 1).
  if (longitud != 5)
  {
    Serial.println("[Gestion] Identificador o valor de luz invalido");
    programarAck();
    return;
  }

  const uint8_t luz = datos[3];
  const uint8_t estado = datos[4];
  if (luz > LUZ_DIRECCIONAL_DERECHA || estado > 1)
  {
    Serial.println("[Gestion] Identificador o valor de luz invalido");
    programarAck();
    return;
  }

  const bool encendida = estado == 1;
  switch (luz)
  {
    case LUZ_FRONTAL:
      luzFrontal = encendida;
      break;
    case LUZ_TRASERA:
      luzTrasera = encendida;
      break;
    case LUZ_PARQUEO:
    case LUZ_DIRECCIONAL_IZQUIERDA:
    case LUZ_DIRECCIONAL_DERECHA:
      configurarIntermitente(luz, encendida);
      break;
  }

  ultimoEstadoComando = CMD_OK;
  programarAck();
  actualizarActuadores();
  const char *texto = "APAGADA";
  if (encendida)
  {
    texto = "ENCENDIDA";
  }
  Serial.printf(
    "[Gestion] Luz %u %s, txId=%u\r\n",
    luz,
    texto,
    ultimaTransaccion
  );
}

// Punto de entrada requerido por la libreria Heltec. Validar la cabecera
// antes de acceder al contenido; cada funcion comprueba su propia longitud.
void downLinkDataHandle(McpsIndication_t *mcpsIndication)
{
  const uint8_t *datos = mcpsIndication->Buffer;
  const uint8_t longitud = mcpsIndication->BufferSize;

  Serial.printf(
    "[Gestion] Downlink puerto=%u bytes=%u\r\n",
    mcpsIndication->Port,
    longitud
  );

  if (mcpsIndication->Port != PUERTO_COMANDOS)
  {
    Serial.println("[Gestion] Puerto ignorado");
    return;
  }

  ultimaTransaccion = 0;
  ultimoEstadoComando = CMD_FORMATO_INVALIDO;
  if (longitud < 3)
  {
    Serial.println("[Gestion] Formato o version invalida");
    programarAck();
    return;
  }

  ultimaTransaccion = datos[2];
  if (datos[0] != VERSION_PROTOCOLO)
  {
    Serial.println("[Gestion] Formato o version invalida");
    programarAck();
    return;
  }

  switch (datos[1])
  {
    case CMD_INTERVALO:
      procesarIntervalo(datos, longitud);
      break;
    case CMD_ALERTA:
      procesarAlerta(datos, longitud);
      break;
    case CMD_LUZ:
      procesarLuz(datos, longitud);
      break;
    default:
      ultimoEstadoComando = CMD_NO_SOPORTADO;
      programarAck();
      Serial.println("[Gestion] Comando no soportado");
      break;
  }
}


/* =========================================================
   SETUP
   ========================================================= */

void setup()
{
  Serial.begin(115200);
  delay(500);

  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);

  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT);
  pinMode(PIN_IN4, OUTPUT);
  pinMode(PIN_ENA, OUTPUT);
  pinMode(PIN_ENB, OUTPUT);
  analogWriteFrequency(PIN_ENA, 1000);
  analogWriteResolution(PIN_ENA, 8);
  analogWriteFrequency(PIN_ENB, 1000);
  analogWriteResolution(PIN_ENB, 8);

  pinMode(PIN_TRIG_FRONTAL, OUTPUT);
  pinMode(PIN_ECHO_FRONTAL, INPUT);
  pinMode(PIN_TRIG_TRASERO, OUTPUT);
  pinMode(PIN_ECHO_TRASERO, INPUT);

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LUZ_FRONTAL, OUTPUT);
  pinMode(PIN_LUZ_TRASERA, OUTPUT);
  pinMode(PIN_PARQUEO_IZQUIERDO, OUTPUT);
  pinMode(PIN_PARQUEO_DERECHO, OUTPUT);
  pinMode(PIN_BOTON_PANICO, INPUT_PULLUP);

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_BATERIA, ADC_11db);

  detenerMotoresInmediato();
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LUZ_FRONTAL, LOW);
  digitalWrite(PIN_LUZ_TRASERA, LOW);
  escribirIntermitentes(false, false);
  cargarConfiguracion();
  dht.begin();
  if (!usarTTN)
  {
    // Ignora la alerta durante la prueba local, sin borrar el valor guardado.
    alertaRemota = false;
    guardarPendiente = false;
  }

  bluetooth.begin(9600, SERIAL_8N1, PIN_BT_RX, PIN_BT_TX);
  // El GPS solo transmite hacia la Heltec; no se requiere su pin RX.
  gps.begin(9600, SERIAL_8N1, PIN_GPS_RX, -1);
  mpuDisponible = iniciarMpu6050();
  if (mpuDisponible)
  {
    mpuDisponible = calibrarMpuVertical();
  }

  pantalla.init();
  pantalla.clear();
  pantalla.display();
  pantalla.setContrast(255);

  const char *estadoMpu = "MPU6050: ERROR";
  if (mpuDisponible)
  {
    estadoMpu = "MPU6050: OK";
  }
  if (usarTTN)
  {
    const char *titulo = "SMARTCITYNET ADAS";
    if (alertaRemota)
    {
      titulo = "ALERTA PERSISTENTE";
    }
    mostrarOLED(titulo, "US915 / FSB2", estadoMpu, "Iniciando LoRaWAN");
  }
  else
  {
    mostrarOLED("VEHICULO - LOCAL", "TTN DESHABILITADO", estadoMpu, "USB/BT: comandos");
  }

  Serial.println();
  Serial.println("========================================");
  if (usarTTN)
  {
    Serial.println(" HELTEC V3 - VEHICULO ADAS + LESHAN");
    Serial.println(" US915 / FSB2 / OTAA / CLASE A");
    Serial.printf(" Intervalo: %lu s\r\n", (unsigned long)(appTxDutyCycle / 1000UL));
    if (alertaRemota)
    {
      Serial.printf(" Alerta persistida: ON\r\n");
    }
    else
    {
      Serial.printf(" Alerta persistida: OFF\r\n");
    }
  }
  else
  {
    Serial.println(" HELTEC V3 - PRUEBA LOCAL");
    Serial.println(" TTN/LoRaWAN: DESHABILITADO");
    Serial.println(" Comandos: monitor USB o Bluetooth HC-06");
  }
  if (mpuDisponible)
  {
    Serial.printf(" MPU6050: OK Y CALIBRADO\r\n");
  }
  else
  {
    Serial.printf(" MPU6050: NO DISPONIBLE\r\n");
  }
  Serial.println(" GPS GY-GPS6MV2: TX del GPS -> GPIO35, 9600 baudios");
  Serial.println(" DHT11: GPIO34 | Boton de panico: GPIO33");
  Serial.println(" Bateria 3S: divisor 330k/100k -> GPIO19");
  Serial.println("========================================");
}


/* =========================================================
   CONEXION LORAWAN
   ========================================================= */

void actualizarLoRa()
{
  switch (deviceState)
  {
    case DEVICE_STATE_INIT:
    {
      if (LORAWAN_DEVEUI_AUTO)
      {
        LoRaWAN.generateDeveuiByChipID();
      }
      mostrarOLED("LoRaWAN", "US915 / FSB2", "Inicializando...", "");
      LoRaWAN.init(loraWanClass, loraWanRegion);
      LoRaWAN.setDefaultDR(3);
      break;
    }

    case DEVICE_STATE_JOIN:
    {
      mostrarOLED("TTN - OTAA", "US915 / FSB2", "Buscando red...", "JOIN");
      LoRaWAN.join();
      break;
    }

    case DEVICE_STATE_SEND:
    {
      contadorEnvios++;
      prepararEnvio();

      const char *confirmado = "no";
      if (isTxConfirmed)
      {
        confirmado = "si";
      }
      Serial.printf(
        "[LoRaWAN] TX #%lu tipo=0x%02X bytes=%u confirmado=%s\r\n",
        (unsigned long)contadorEnvios,
        appData[1],
        appDataSize,
        confirmado
      );

      LoRaWAN.send();
      if (appData[1] == MSG_TELEMETRIA)
      {
        telemetriaPanicoPendiente = false;
      }
      deviceState = DEVICE_STATE_CYCLE;
      break;
    }

    case DEVICE_STATE_CYCLE:
    {
      guardarConfiguracion();
      if (ackPendientes > 0)
      {
        txDutyCycleTime = ESPERA_ACK;
        Serial.printf(
          "[Gestion] Siguiente repeticion de ACK en %lu ms\r\n",
          (unsigned long)txDutyCycleTime
        );
      }
      else if (telemetriaPanicoPendiente)
      {
        txDutyCycleTime = 1000UL;
        Serial.println("[Panico] Telemetria prioritaria programada");
      }
      else
      {
        txDutyCycleTime = appTxDutyCycle + randr(
          -APP_TX_DUTYCYCLE_RND,
          APP_TX_DUTYCYCLE_RND
        );
      }
      Serial.printf("[LoRaWAN] Proximo TX: %lu s\r\n", (unsigned long)(txDutyCycleTime / 1000UL));
      LoRaWAN.cycle(txDutyCycleTime);
      deviceState = DEVICE_STATE_SLEEP;
      break;
    }

    case DEVICE_STATE_SLEEP:
    {
      Mcu.timerhandler();
      Radio.IrqProcess();
      delay(1);
      break;
    }

    default:
      detenerMotoresInmediato();
      deviceState = DEVICE_STATE_INIT;
      break;
  }
}


/* =========================================================
   LOOP
   ========================================================= */

void loop()
{
  guardarConfiguracion();
  actualizarGps();
  actualizarDht11();
  actualizarBotonPanico();
  if (!usarTTN)
  {
    actualizarControlUsbLocal();
  }

  actualizarBluetooth();
  actualizarSensores();
  actualizarMotores();
  actualizarActuadores();
  actualizarOLED();

  if (usarTTN)
  {
    actualizarLoRa();
  }
  else
  {
    imprimirDiagnosticoLocal();
    delay(1);
  }
}
