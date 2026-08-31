/*
 * SmartCityNet - Vehiculo ADAS administrado desde Eclipse Leshan
 *
 * Hardware de referencia: Heltec WiFi LoRa 32 V3
 * Modo actual: prueba local sin conexion a TTN.
 *
 * Conserva los sensores, pines y movimientos documentados en
 * "TIC - Jessica Bracero_Final.pdf" y añade un bloqueo remoto:
 * al activar Remote Alert desde Leshan, detiene los motores, ignora todos los
 * comandos de movimiento Bluetooth y hace sonar una alarma intermitente.
 * Desactivar la alerta no reanuda el movimiento anterior: hace falta un nuevo
 * comando Bluetooth.
 */

#include "LoRaWan_APP.h"
#include "HT_SSD1306Wire.h"
#include <HardwareSerial.h>
#include <Preferences.h>
#include <Wire.h>
#include <math.h>

// Cambiar a 1 cuando vuelva a estar disponible el gateway. En 0 no se
// inicializa la radio, no se intenta OTAA y no se transmite ningun uplink.
#ifndef HABILITAR_TTN
#define HABILITAR_TTN 1
#endif

#if HABILITAR_TTN
#if __has_include("credentials.h")
#include "credentials.h"
#elif __has_include("../EnvioDatos/credentials.h")
#warning "Usando ../EnvioDatos/credentials.h; cree VehiculoLeshan/credentials.h para otro dispositivo"
#include "../EnvioDatos/credentials.h"
#else
#error "Copie credentials.example.h como credentials.h y configure las claves OTAA"
#endif
#else
// La libreria Heltec declara estas variables aun cuando la radio no se usa.
// En modo local se proporcionan valores neutros y no se cargan credenciales.
uint8_t devEui[8] = {0};
uint8_t appEui[8] = {0};
uint8_t appKey[16] = {0};
#endif


/* =========================================================
   PINES RECUPERADOS DEL FIRMWARE ORIGINAL DEL TIC
   ========================================================= */

// Puente H L298N.
static const uint8_t PIN_IN1 = 6;
static const uint8_t PIN_IN2 = 5;
static const uint8_t PIN_IN3 = 4;
static const uint8_t PIN_IN4 = 3;
static const uint8_t PIN_ENA = 7;
static const uint8_t PIN_ENB = 2;

// HC-SR04 frontal y trasero.
static const uint8_t PIN_TRIG_FRONTAL = 39;
static const uint8_t PIN_ECHO_FRONTAL = 40;
static const uint8_t PIN_TRIG_TRASERO = 47;
static const uint8_t PIN_ECHO_TRASERO = 48;

// MPU6050 en un bus I2C distinto al OLED integrado.
static const uint8_t PIN_MPU_SDA = 41;
static const uint8_t PIN_MPU_SCL = 42;


/* =========================================================
   LUCES, BUZZER Y BLUETOOTH DEL FIRMWARE ORIGINAL
   ========================================================= */

static const uint8_t PIN_BUZZER = 34;
static const uint8_t PIN_LUZ_FRONTAL = 45;
static const uint8_t PIN_LUZ_TRASERA = 46;
static const uint8_t PIN_LUZ_PARQUEO = 1;

// UART1 para HC-06. Conectar HC-06 TX -> GPIO19 y HC-06 RX -> GPIO20.
static const uint8_t PIN_BT_RX = 19;
static const uint8_t PIN_BT_TX = 20;


/* =========================================================
   OLED, I2C DEL MPU Y BLUETOOTH
   ========================================================= */

static SSD1306Wire display(
  0x3C,
  500000,
  SDA_OLED,
  SCL_OLED,
  GEOMETRY_128_64,
  RST_OLED
);

static TwoWire busMpu(1);
static HardwareSerial bluetooth(1);


/* =========================================================
   VARIABLES OBLIGATORIAS DE LA LIBRERIA LORAWAN
   ========================================================= */

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
uint32_t appTxDutyCycle = 30000;
bool overTheAirActivation = true;
bool loraWanAdr = true;
bool isTxConfirmed = false;
uint8_t appPort = 10;
uint8_t confirmedNbTrials = 4;


/* =========================================================
   PROTOCOLO SMARTCITYNET

   Uplink FPort 10:
     tipo 0x02: ACK administrativo existente (8 bytes)
     tipo 0x03: telemetria vehicular (27 bytes)

   Downlink FPort 11:
     01 10 txId intervalo_s(4)  -> cambiar intervalo
     01 11 txId estado          -> alerta remota, 0=OFF, 1=ON
     01 12 txId luz estado      -> luz 0=frontal, 1=trasera, 2=parqueo
   ========================================================= */

static const uint8_t SMARTCITYNET_VERSION = 0x01;
static const uint8_t MSG_ACK = 0x02;
static const uint8_t MSG_TELEMETRIA_VEHICULO = 0x03;
static const uint8_t CMD_INTERVALO = 0x10;
static const uint8_t CMD_ALERTA = 0x11;
static const uint8_t CMD_LUZ = 0x12;
static const uint8_t PUERTO_COMANDOS = 11;

static const uint8_t LUZ_FRONTAL = 0;
static const uint8_t LUZ_TRASERA = 1;
static const uint8_t LUZ_PARQUEO = 2;

static const uint32_t INTERVALO_PREDETERMINADO_S = 30;
static const uint32_t INTERVALO_MINIMO_S = 15;
static const uint32_t INTERVALO_MAXIMO_S = 86400;

static const uint8_t CMD_OK = 0;
static const uint8_t CMD_FORMATO_INVALIDO = 1;
static const uint8_t CMD_NO_SOPORTADO = 2;
static const uint8_t CMD_FUERA_DE_RANGO = 3;
static const uint8_t REPETICIONES_ACK_ADMINISTRATIVO = 2;
static const uint32_t RETARDO_ACK_ADMINISTRATIVO_MS = 3000;

volatile uint8_t repeticionesAckPendientes = 0;
volatile bool configuracionPendienteGuardar = false;
volatile bool alertaRemota = false;
volatile uint8_t ultimaTransaccion = 0;
volatile uint8_t ultimoEstadoComando = CMD_OK;


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

Movimiento movimientoSolicitado = MOV_DETENIDO;
Movimiento movimientoActual = MOV_DETENIDO;
// El firmware recuperado arranca a velocidad maxima y los comandos 0..9 la
// cambian en pasos de 25 (q/Q restaura 255).
uint8_t velocidadSolicitada = 255;
uint8_t velocidadAplicada = 0;
uint8_t velocidadIzquierdaAplicada = 0;
uint8_t velocidadDerechaAplicada = 0;

static const uint16_t DISTANCIA_FUERA_DE_RANGO_CM = 999;
uint16_t distanciaFrontalCm = DISTANCIA_FUERA_DE_RANGO_CM;
uint16_t distanciaTraseraCm = DISTANCIA_FUERA_DE_RANGO_CM;
float pitchGrados = 0.0f;
float rollGrados = 0.0f;
float inclinacionGrados = 0.0f;
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
uint8_t contadorVolcamiento = 0;

bool evColision = false;
bool evObstaculo = false;
bool evVolcamiento = false;
bool evCurvaDerecha = false;
bool evCurvaIzquierda = false;
bool evSubida = false;
bool evBajada = false;

bool luzFrontal = false;
bool luzTrasera = false;
bool lucesParqueo = false;
bool bocinaManual = false;
bool faseParqueo = false;
bool faseAlarma = false;
bool faseAvisoReversa = false;
bool faseLuzReversa = false;
bool buzzerSonando = false;

uint32_t contadorEnvios = 0;
uint32_t ultimaLecturaSensoresMs = 0;
uint32_t ultimoControlMotoresMs = 0;
uint32_t ultimoCambioParqueoMs = 0;
uint32_t ultimoCambioAlarmaMs = 0;
uint32_t ultimoCambioAvisoReversaMs = 0;
uint32_t ultimoCambioLuzReversaMs = 0;
uint32_t ultimaPantallaMs = 0;
uint32_t ultimoDiagnosticoLocalMs = 0;


/* =========================================================
   UTILIDADES BINARIAS Y CONFIGURACION
   ========================================================= */

static void programarAckAdministrativo()
{
  // El ACK se repite con el mismo txId. El Bridge lo procesa de forma
  // idempotente y una perdida de radio no deja el estado físico sin confirmar.
  repeticionesAckPendientes = REPETICIONES_ACK_ADMINISTRATIVO;
#if HABILITAR_TTN
  // Sustituye el ciclo normal que ya estaba programado antes de RX1/RX2.
  // El callback termina antes de que el temporizador cambie el estado a SEND.
  LoRaWAN.cycle(RETARDO_ACK_ADMINISTRATIVO_MS);
#endif
}

static void escribirUint16BE(uint8_t *destino, uint16_t valor)
{
  destino[0] = (uint8_t)(valor >> 8);
  destino[1] = (uint8_t)valor;
}

static void escribirInt16BE(uint8_t *destino, int16_t valor)
{
  escribirUint16BE(destino, (uint16_t)valor);
}

static void escribirUint32BE(uint8_t *destino, uint32_t valor)
{
  destino[0] = (uint8_t)(valor >> 24);
  destino[1] = (uint8_t)(valor >> 16);
  destino[2] = (uint8_t)(valor >> 8);
  destino[3] = (uint8_t)valor;
}

static uint32_t leerUint32BE(const uint8_t *origen)
{
  return ((uint32_t)origen[0] << 24) |
         ((uint32_t)origen[1] << 16) |
         ((uint32_t)origen[2] << 8) |
         (uint32_t)origen[3];
}

static int16_t escalarDecimal(float valor)
{
  long escalado = lroundf(valor * 10.0f);
  if (escalado > INT16_MAX) escalado = INT16_MAX;
  if (escalado < INT16_MIN) escalado = INT16_MIN;
  return (int16_t)escalado;
}

// El firmware original usa GPIO1 para la luz de parqueo. Ese GPIO coincide
// con la entrada ADC de bateria de la Heltec V3 y no puede cumplir ambas
// funciones simultaneamente. Se conserva el campo del protocolo con 0 mV
// para indicar que esta medicion no esta disponible en esta PCB.
static uint16_t leerBateriaMv()
{
  return 0;
}

static void cargarConfiguracion()
{
  Preferences preferencias;
  preferencias.begin("smartcitynet", true);
  uint32_t intervaloS = preferencias.getUInt(
    "tx_seconds",
    INTERVALO_PREDETERMINADO_S
  );
  alertaRemota = preferencias.getBool("remote_alert", false);
  preferencias.end();

  if (intervaloS < INTERVALO_MINIMO_S || intervaloS > INTERVALO_MAXIMO_S)
  {
    intervaloS = INTERVALO_PREDETERMINADO_S;
  }

  appTxDutyCycle = intervaloS * 1000UL;
}

static void guardarConfiguracionSiCorresponde()
{
  if (!configuracionPendienteGuardar)
  {
    return;
  }

  Preferences preferencias;
  preferencias.begin("smartcitynet", false);
  preferencias.putUInt("tx_seconds", appTxDutyCycle / 1000UL);
  preferencias.putBool("remote_alert", alertaRemota);
  preferencias.end();
  configuracionPendienteGuardar = false;
}


/* =========================================================
   OLED
   ========================================================= */

static void mostrarOLED(
  const String &linea1,
  const String &linea2 = "",
  const String &linea3 = "",
  const String &linea4 = ""
)
{
  display.clear();
  display.setFont(ArialMT_Plain_10);
  display.setTextAlignment(TEXT_ALIGN_LEFT);
  display.drawString(0, 0, linea1);
  display.drawString(0, 15, linea2);
  display.drawString(0, 30, linea3);
  display.drawString(0, 45, linea4);
  display.display();
}

static const char *nombreMovimiento(Movimiento movimiento)
{
  switch (movimiento)
  {
    case MOV_ADELANTE: return "ADELANTE";
    case MOV_ATRAS: return "ATRAS";
    case MOV_IZQUIERDA: return "IZQUIERDA";
    case MOV_DERECHA: return "DERECHA";
    case MOV_ADELANTE_DERECHA: return "ADEL-DER";
    case MOV_ATRAS_DERECHA: return "ATRAS-DER";
    case MOV_ADELANTE_IZQUIERDA: return "ADEL-IZQ";
    case MOV_ATRAS_IZQUIERDA: return "ATRAS-IZQ";
    default: return "DETENIDO";
  }
}

static const char *eventoPrincipal()
{
  if (alertaRemota) return "ALERTA REMOTA";
  if (evColision) return "COLISION";
  if (evVolcamiento) return "VOLCAMIENTO";
  if (evObstaculo) return "OBSTACULO";
  if (evCurvaDerecha) return "CURVA DERECHA";
  if (evCurvaIzquierda) return "CURVA IZQ";
  if (evSubida) return "SUBIDA";
  if (evBajada) return "BAJADA";
  return "NORMAL";
}

static void actualizarOLED()
{
  uint32_t ahora = millis();
  if (ahora - ultimaPantallaMs < 500)
  {
    return;
  }
  ultimaPantallaMs = ahora;

  if (alertaRemota)
  {
    mostrarOLED(
      "ALERTA REMOTA",
      "MOTORES BLOQUEADOS",
      faseAlarma ? "ALARMA: ON" : "ALARMA: OFF",
      "Esperando desbloqueo"
    );
    return;
  }

  mostrarOLED(
    String(nombreMovimiento(movimientoActual)) + " " +
      String((velocidadAplicada * 100U) / 255U) + "%",
    "F:" + String(distanciaFrontalCm) + " T:" + String(distanciaTraseraCm) + " cm",
    "P:" + String(pitchGrados, 1) + " R:" + String(rollGrados, 1),
    eventoPrincipal()
  );
}


/* =========================================================
   MPU6050
   ========================================================= */

static bool escribirRegistroMpu(uint8_t registro, uint8_t valor)
{
  busMpu.beginTransmission(0x68);
  busMpu.write(registro);
  busMpu.write(valor);
  return busMpu.endTransmission() == 0;
}

static bool iniciarMpu6050()
{
  busMpu.begin(PIN_MPU_SDA, PIN_MPU_SCL, 400000);
  delay(20);
  return escribirRegistroMpu(0x6B, 0x00);
}

static float productoPunto(const Vector3f &a, const Vector3f &b)
{
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

static Vector3f productoCruz(const Vector3f &a, const Vector3f &b)
{
  return {
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  };
}

static bool normalizarVector(Vector3f &vector)
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

static float magnitudVector(const Vector3f &vector)
{
  return sqrtf(productoPunto(vector, vector));
}

static Vector3f proyectarSobrePlano(
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

static bool leerMuestraMpu(Vector3f &aceleracion, float &temperatura)
{
  busMpu.beginTransmission(0x68);
  busMpu.write(0x3B);
  if (busMpu.endTransmission(false) != 0)
  {
    return false;
  }

  uint8_t recibidos = busMpu.requestFrom((uint8_t)0x68, (uint8_t)14, true);
  if (recibidos != 14)
  {
    return false;
  }

  int16_t rawAx = (int16_t)((busMpu.read() << 8) | busMpu.read());
  int16_t rawAy = (int16_t)((busMpu.read() << 8) | busMpu.read());
  int16_t rawAz = (int16_t)((busMpu.read() << 8) | busMpu.read());
  int16_t rawTemp = (int16_t)((busMpu.read() << 8) | busMpu.read());

  // Consumir giroscopio X/Y/Z; en esta fase los ángulos usan acelerómetro.
  for (uint8_t i = 0; i < 6; i++)
  {
    busMpu.read();
  }

  aceleracion.x = rawAx / 16384.0f;
  aceleracion.y = rawAy / 16384.0f;
  aceleracion.z = rawAz / 16384.0f;
  temperatura = rawTemp / 340.0f + 36.53f;
  return true;
}

static bool calibrarMpuVertical()
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
      float norma = sqrtf(productoPunto(muestra, muestra));
      if (norma >= 0.80f && norma <= 1.20f)
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

static bool leerMpu6050()
{
  Vector3f muestra;
  float temperatura;
  if (!mpuCalibrado || !leerMuestraMpu(muestra, temperatura))
  {
    return false;
  }

  const float alpha = 0.20f;
  if (!filtroMpuInicializado)
  {
    aceleracionFiltrada = muestra;
    filtroMpuInicializado = true;
  }
  else
  {
    aceleracionFiltrada.x += alpha * (muestra.x - aceleracionFiltrada.x);
    aceleracionFiltrada.y += alpha * (muestra.y - aceleracionFiltrada.y);
    aceleracionFiltrada.z += alpha * (muestra.z - aceleracionFiltrada.z);
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

  pitchGrados = atan2f(componentePitch, vertical) * 180.0f / PI;
  rollGrados = atan2f(componenteRoll, vertical) * 180.0f / PI;
  inclinacionGrados = atan2f(
    sqrtf(componentePitch * componentePitch + componenteRoll * componenteRoll),
    vertical
  ) * 180.0f / PI;
  temperaturaC = temperatura;
  return true;
}


/* =========================================================
   SENSORES ULTRASONICOS Y EVENTOS
   ========================================================= */

static uint16_t leerDistanciaCm(uint8_t trigPin, uint8_t echoPin)
{
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  uint32_t duracion = pulseIn(echoPin, HIGH, 30000UL);
  uint32_t distancia = duracion * 34UL / 2000UL;
  if (duracion == 0 || distancia == 0 || distancia > 400)
  {
    return DISTANCIA_FUERA_DE_RANGO_CM;
  }
  return (uint16_t)distancia;
}

static void evaluarEventos()
{
  evColision = distanciaFrontalCm > 0 && distanciaFrontalCm < 30;
  evObstaculo = distanciaFrontalCm >= 30 && distanciaFrontalCm < 100;

  if (!mpuDisponible || !mpuCalibrado)
  {
    contadorVolcamiento = 0;
    evVolcamiento = false;
    evCurvaDerecha = false;
    evCurvaIzquierda = false;
    evSubida = false;
    evBajada = false;
    return;
  }

  // Confirmar durante aproximadamente un segundo y rearmar por debajo de
  // 30 grados. Esto evita disparos por vibracion o aceleraciones breves.
  if (inclinacionGrados >= 40.0f)
  {
    if (contadorVolcamiento < 5)
    {
      contadorVolcamiento++;
    }
    if (contadorVolcamiento >= 5)
    {
      evVolcamiento = true;
    }
  }
  else if (inclinacionGrados <= 30.0f)
  {
    contadorVolcamiento = 0;
    evVolcamiento = false;
  }
  else if (!evVolcamiento && contadorVolcamiento > 0)
  {
    contadorVolcamiento--;
  }

  evCurvaDerecha = rollGrados > 25.0f;
  evCurvaIzquierda = rollGrados < -25.0f;
  evSubida = pitchGrados > 25.0f;
  evBajada = pitchGrados < -25.0f;
}

static void actualizarSensores()
{
  uint32_t ahora = millis();
  if (ahora - ultimaLecturaSensoresMs < 200)
  {
    return;
  }
  ultimaLecturaSensoresMs = ahora;

  distanciaFrontalCm = leerDistanciaCm(
    PIN_TRIG_FRONTAL,
    PIN_ECHO_FRONTAL
  );
  distanciaTraseraCm = leerDistanciaCm(
    PIN_TRIG_TRASERO,
    PIN_ECHO_TRASERO
  );
  mpuDisponible = leerMpu6050();
  evaluarEventos();
}


/* =========================================================
   CONTROL DEL PUENTE H L298N
   ========================================================= */

static void detenerMotoresInmediato()
{
  analogWrite(PIN_ENA, 0);
  analogWrite(PIN_ENB, 0);
  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, LOW);
  velocidadAplicada = 0;
  velocidadIzquierdaAplicada = 0;
  velocidadDerechaAplicada = 0;
  movimientoActual = MOV_DETENIDO;
}

static void aplicarDireccion(Movimiento movimiento)
{
  // En el montaje real del TIC el motor derecho tiene polaridad electrica
  // inversa. Estos niveles proceden de las rutinas del firmware recuperado.
  switch (movimiento)
  {
    case MOV_ADELANTE:
    case MOV_ADELANTE_DERECHA:
    case MOV_ADELANTE_IZQUIERDA:
      digitalWrite(PIN_IN1, HIGH); digitalWrite(PIN_IN2, LOW);
      digitalWrite(PIN_IN3, LOW);  digitalWrite(PIN_IN4, HIGH);
      break;
    case MOV_ATRAS:
    case MOV_ATRAS_DERECHA:
    case MOV_ATRAS_IZQUIERDA:
      digitalWrite(PIN_IN1, LOW); digitalWrite(PIN_IN2, HIGH);
      digitalWrite(PIN_IN3, HIGH); digitalWrite(PIN_IN4, LOW);
      break;
    case MOV_IZQUIERDA:
      digitalWrite(PIN_IN1, LOW); digitalWrite(PIN_IN2, HIGH);
      digitalWrite(PIN_IN3, LOW); digitalWrite(PIN_IN4, HIGH);
      break;
    case MOV_DERECHA:
      digitalWrite(PIN_IN1, HIGH); digitalWrite(PIN_IN2, LOW);
      digitalWrite(PIN_IN3, HIGH); digitalWrite(PIN_IN4, LOW);
      break;
    default:
      digitalWrite(PIN_IN1, LOW); digitalWrite(PIN_IN2, LOW);
      digitalWrite(PIN_IN3, LOW); digitalWrite(PIN_IN4, LOW);
      break;
  }
}

static void calcularVelocidadesRuedas(
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
  if (movimiento == MOV_ADELANTE_IZQUIERDA ||
      movimiento == MOV_ATRAS_IZQUIERDA)
  {
    velocidadIzquierda = velocidadBase / 2;
  }
  else if (movimiento == MOV_ADELANTE_DERECHA ||
           movimiento == MOV_ATRAS_DERECHA)
  {
    velocidadDerecha = velocidadBase / 2;
  }
}

static bool movimientoHaciaAtras(Movimiento movimiento)
{
  return movimiento == MOV_ATRAS ||
         movimiento == MOV_ATRAS_DERECHA ||
         movimiento == MOV_ATRAS_IZQUIERDA;
}

static void actualizarMotores()
{
  uint32_t ahora = millis();
  if (ahora - ultimoControlMotoresMs < 40)
  {
    return;
  }
  ultimoControlMotoresMs = ahora;

  // El bloqueo remoto tiene prioridad absoluta y detención inmediata.
  if (alertaRemota)
  {
    movimientoSolicitado = MOV_DETENIDO;
    detenerMotoresInmediato();
    return;
  }

  // La rutina original frena por colision frontal o volcamiento. El sensor
  // trasero se reserva para el aviso de reversa y no bloquea los motores.
  bool frenadoSeguridad = evColision || evVolcamiento;

  uint8_t velocidadObjetivo = velocidadSolicitada;
  Movimiento movimientoObjetivo = movimientoSolicitado;

  if (movimientoObjetivo == MOV_DETENIDO)
  {
    detenerMotoresInmediato();
    return;
  }
  else if (frenadoSeguridad)
  {
    // El original resta 20 unidades PWM cada 40 ms. Se conserva la misma
    // rampa, pero sin bloquear Bluetooth, sensores ni la gestion remota.
    velocidadObjetivo = 0;
  }
  else if (evObstaculo && movimientoObjetivo == MOV_ADELANTE)
  {
    velocidadObjetivo = 100;
  }

  if (frenadoSeguridad && velocidadAplicada > velocidadObjetivo)
  {
    velocidadAplicada = velocidadAplicada > 20 ? velocidadAplicada - 20 : 0;
  }
  else
  {
    // Los comandos de movimiento y velocidad se aplican inmediatamente en
    // el firmware recuperado; solo el frenado de colision es progresivo.
    velocidadAplicada = velocidadObjetivo;
  }

  if (velocidadAplicada == 0 && velocidadObjetivo == 0)
  {
    detenerMotoresInmediato();
    return;
  }

  aplicarDireccion(movimientoObjetivo);
  calcularVelocidadesRuedas(
    movimientoObjetivo,
    velocidadAplicada,
    velocidadIzquierdaAplicada,
    velocidadDerechaAplicada
  );
  analogWrite(PIN_ENA, velocidadIzquierdaAplicada);
  analogWrite(PIN_ENB, velocidadDerechaAplicada);
  movimientoActual = movimientoObjetivo;
}


/* =========================================================
   BLUETOOTH Y ACTUADORES
   ========================================================= */

static bool esComandoMovimiento(char comando)
{
  return comando == 'F' || comando == 'B' || comando == 'L' ||
         comando == 'R' || comando == 'S' || comando == 'I' ||
         comando == 'J' || comando == 'G' || comando == 'H';
}

static void procesarComandoBluetooth(char comando)
{
  if (comando == '\r' || comando == '\n')
  {
    return;
  }

  char comandoNormalizado = comando;
  if (comandoNormalizado >= 'a' && comandoNormalizado <= 'z' &&
      comandoNormalizado != 'w' && comandoNormalizado != 'u' &&
      comandoNormalizado != 'v' && comandoNormalizado != 'x')
  {
    comandoNormalizado -= ('a' - 'A');
  }

  if (alertaRemota && esComandoMovimiento(comandoNormalizado))
  {
    movimientoSolicitado = MOV_DETENIDO;
    Serial.printf("[Bluetooth] Movimiento %c ignorado: alerta remota activa\r\n", comandoNormalizado);
    return;
  }

  switch (comandoNormalizado)
  {
    case 'F': movimientoSolicitado = MOV_ADELANTE; break;
    case 'B': movimientoSolicitado = MOV_ATRAS; break;
    case 'L': movimientoSolicitado = MOV_IZQUIERDA; break;
    case 'R': movimientoSolicitado = MOV_DERECHA; break;
    case 'S': movimientoSolicitado = MOV_DETENIDO; break;
    case 'I': movimientoSolicitado = MOV_ADELANTE_DERECHA; break;
    case 'J': movimientoSolicitado = MOV_ATRAS_DERECHA; break;
    case 'G': movimientoSolicitado = MOV_ADELANTE_IZQUIERDA; break;
    case 'H': movimientoSolicitado = MOV_ATRAS_IZQUIERDA; break;
    case 'D':
      movimientoSolicitado = MOV_DETENIDO;
      break;
    case 'Q':
      velocidadSolicitada = 255;
      break;
    default:
      if (comando >= '0' && comando <= '9')
      {
        uint8_t nivel = comando - '0';
        velocidadSolicitada = nivel * 25;
      }
      else
      {
        switch (comando)
        {
          case 'W': luzFrontal = true; break;
          case 'w': luzFrontal = false; break;
          case 'U': luzTrasera = true; break;
          case 'u': luzTrasera = false; break;
          case 'X': lucesParqueo = true; break;
          case 'x': lucesParqueo = false; faseParqueo = false; break;
          case 'V': bocinaManual = true; break;
          case 'v': bocinaManual = false; break;
          default: return;
        }
      }
      break;
  }

  Serial.printf(
    "[Bluetooth] comando=%c movimiento=%s velocidad=%u\r\n",
    comandoNormalizado,
    nombreMovimiento(movimientoSolicitado),
    velocidadSolicitada
  );
}

static void actualizarBluetooth()
{
  while (bluetooth.available() > 0)
  {
    procesarComandoBluetooth((char)bluetooth.read());
  }
}

// En modo local, el monitor serie USB acepta los mismos comandos del HC-06.
// Esto permite probar motores y actuadores incluso sin el modulo Bluetooth.
static void actualizarControlUsbLocal()
{
#if !HABILITAR_TTN
  while (Serial.available() > 0)
  {
    char comando = (char)Serial.read();
    if (comando != '\r' && comando != '\n')
    {
      procesarComandoBluetooth(comando);
    }
  }
#endif
}

static void imprimirDiagnosticoLocal()
{
#if !HABILITAR_TTN
  uint32_t ahora = millis();
  if (ahora - ultimoDiagnosticoLocalMs < 1000)
  {
    return;
  }
  ultimoDiagnosticoLocalMs = ahora;

  Serial.printf(
    "[LOCAL] F=%u cm T=%u cm MPU=%s Pitch=%.1f Roll=%.1f Incl=%.1f Temp=%.1f C Movimiento=%s Vel=%u%% PWM-I=%u PWM-D=%u Evento=%s\r\n",
    distanciaFrontalCm,
    distanciaTraseraCm,
    mpuDisponible ? "OK" : "ERROR",
    pitchGrados,
    rollGrados,
    inclinacionGrados,
    temperaturaC,
    nombreMovimiento(movimientoActual),
    (velocidadAplicada * 100U) / 255U,
    velocidadIzquierdaAplicada,
    velocidadDerechaAplicada,
    eventoPrincipal()
  );
#endif
}

static void escribirBuzzer(bool encendido)
{
  if (encendido == buzzerSonando)
  {
    return;
  }
  buzzerSonando = encendido;
  // El TIC usa un buzzer activo: se gobierna directamente en HIGH/LOW.
  digitalWrite(PIN_BUZZER, encendido ? HIGH : LOW);
}

static bool actualizarAvisoReversa(uint32_t ahora)
{
  if (!movimientoHaciaAtras(movimientoSolicitado) ||
      distanciaTraseraCm == DISTANCIA_FUERA_DE_RANGO_CM ||
      distanciaTraseraCm > 80)
  {
    faseAvisoReversa = false;
    return false;
  }

  if (distanciaTraseraCm <= 10)
  {
    faseAvisoReversa = true;
    return true;
  }

  // Entre 11 y 80 cm el intervalo aumenta de 60 a 700 ms: cuanto mas cerca
  // esta el obstaculo, mas rapido suena el aviso.
  uint32_t intervalo = map(distanciaTraseraCm, 10, 80, 60, 700);
  intervalo = constrain(intervalo, 60UL, 700UL);
  if (ahora - ultimoCambioAvisoReversaMs >= intervalo)
  {
    ultimoCambioAvisoReversaMs = ahora;
    faseAvisoReversa = !faseAvisoReversa;
  }
  return faseAvisoReversa;
}

static bool actualizarLuzTrasera(uint32_t ahora)
{
  if (!movimientoHaciaAtras(movimientoSolicitado))
  {
    faseLuzReversa = false;
    return luzTrasera;
  }

  if (ahora - ultimoCambioLuzReversaMs >= 300)
  {
    ultimoCambioLuzReversaMs = ahora;
    faseLuzReversa = !faseLuzReversa;
  }
  return faseLuzReversa;
}

static void actualizarActuadores()
{
  uint32_t ahora = millis();

  if (lucesParqueo && ahora - ultimoCambioParqueoMs >= 300)
  {
    ultimoCambioParqueoMs = ahora;
    faseParqueo = !faseParqueo;
  }
  if (!lucesParqueo)
  {
    faseParqueo = false;
  }

  if (alertaRemota && ahora - ultimoCambioAlarmaMs >= 300)
  {
    ultimoCambioAlarmaMs = ahora;
    faseAlarma = !faseAlarma;
  }
  if (!alertaRemota)
  {
    faseAlarma = false;
  }

  bool avisoReversa = actualizarAvisoReversa(ahora);
  bool salidaLuzTrasera = actualizarLuzTrasera(ahora);

  digitalWrite(PIN_LUZ_FRONTAL, luzFrontal ? HIGH : LOW);
  digitalWrite(PIN_LUZ_TRASERA, salidaLuzTrasera ? HIGH : LOW);
  digitalWrite(PIN_LUZ_PARQUEO, faseParqueo ? HIGH : LOW);
  escribirBuzzer(alertaRemota ? faseAlarma : (bocinaManual || avisoReversa));
}


/* =========================================================
   TELEMETRIA VEHICULAR
   ========================================================= */

static uint8_t construirFlagsActuadores()
{
  uint8_t flags = 0;
  if (luzFrontal) flags |= 1U << 0;
  if (buzzerSonando) flags |= 1U << 1;
  if (movimientoHaciaAtras(movimientoSolicitado)) flags |= 1U << 2;
  if (lucesParqueo) flags |= 1U << 3;
  if (luzTrasera) flags |= 1U << 4;
  if (alertaRemota) flags |= 1U << 5;
  return flags;
}

static uint8_t construirFlagsEventos()
{
  uint8_t flags = 0;
  if (evColision) flags |= 1U << 0;
  if (evObstaculo) flags |= 1U << 1;
  if (evVolcamiento) flags |= 1U << 2;
  if (evCurvaDerecha) flags |= 1U << 3;
  if (evCurvaIzquierda) flags |= 1U << 4;
  if (evSubida) flags |= 1U << 5;
  if (evBajada) flags |= 1U << 6;
  if (alertaRemota) flags |= 1U << 7;
  return flags;
}

static void prepararTelemetriaVehiculo()
{
  uint8_t flags = 0x01; // Sesión LoRaWAN activa.
  if (alertaRemota) flags |= 1U << 1;
  if (mpuDisponible) flags |= 1U << 2;

  appData[0] = SMARTCITYNET_VERSION;
  appData[1] = MSG_TELEMETRIA_VEHICULO;
  appData[2] = flags;
  appData[3] = ultimaTransaccion;
  appData[4] = ultimoEstadoComando;

  // Bytes 5..20 conservan la estructura de 16 bytes definida en el TIC.
  appData[5] = (uint8_t)movimientoActual;
  appData[6] = (uint8_t)((velocidadAplicada * 100U) / 255U);
  escribirUint16BE(&appData[7], distanciaFrontalCm);
  escribirUint16BE(&appData[9], distanciaTraseraCm);
  escribirInt16BE(&appData[11], escalarDecimal(pitchGrados));
  escribirInt16BE(&appData[13], escalarDecimal(rollGrados));
  escribirInt16BE(&appData[15], escalarDecimal(temperaturaC));
  appData[17] = construirFlagsActuadores();
  appData[18] = construirFlagsEventos();
  appData[19] = (uint8_t)(contadorEnvios & 0xFF);

  uint8_t checksum = 0;
  for (uint8_t i = 5; i <= 19; i++)
  {
    checksum ^= appData[i];
  }
  appData[20] = checksum;

  escribirUint32BE(&appData[21], appTxDutyCycle / 1000UL);
  escribirUint16BE(&appData[25], leerBateriaMv());
  appDataSize = 27;
}

static void prepareTxFrame(uint8_t port)
{
  (void)port;
  bool enviandoAck = repeticionesAckPendientes > 0;
  isTxConfirmed = enviandoAck;

  if (enviandoAck)
  {
    appData[0] = SMARTCITYNET_VERSION;
    appData[1] = MSG_ACK;
    appData[2] = ultimaTransaccion;
    appData[3] = ultimoEstadoComando;
    escribirUint32BE(&appData[4], appTxDutyCycle / 1000UL);
    appDataSize = 8;
    repeticionesAckPendientes--;
    Serial.printf(
      "[Gestion] ACK txId=%u, repeticiones restantes=%u\r\n",
      ultimaTransaccion,
      repeticionesAckPendientes
    );
    return;
  }

  prepararTelemetriaVehiculo();
}


/* =========================================================
   RECEPCION DE COMANDOS ADMINISTRATIVOS
   ========================================================= */

void downLinkDataHandle(McpsIndication_t *mcpsIndication)
{
  const uint8_t *datos = mcpsIndication->Buffer;
  uint8_t longitud = mcpsIndication->BufferSize;

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

  ultimaTransaccion = longitud >= 3 ? datos[2] : 0;
  ultimoEstadoComando = CMD_FORMATO_INVALIDO;

  if (longitud < 3 || datos[0] != SMARTCITYNET_VERSION)
  {
    Serial.println("[Gestion] Formato o version invalida");
    programarAckAdministrativo();
    return;
  }

  if (datos[1] == CMD_INTERVALO)
  {
    if (longitud != 7)
    {
      Serial.println("[Gestion] Longitud invalida para intervalo");
      programarAckAdministrativo();
      return;
    }

    uint32_t nuevoIntervaloS = leerUint32BE(&datos[3]);
    if (nuevoIntervaloS < INTERVALO_MINIMO_S ||
        nuevoIntervaloS > INTERVALO_MAXIMO_S)
    {
      ultimoEstadoComando = CMD_FUERA_DE_RANGO;
      Serial.println("[Gestion] Intervalo fuera de rango");
      programarAckAdministrativo();
      return;
    }

    appTxDutyCycle = nuevoIntervaloS * 1000UL;
    ultimoEstadoComando = CMD_OK;
    configuracionPendienteGuardar = true;
    programarAckAdministrativo();
    Serial.printf("[Gestion] Intervalo aplicado: %lu s\r\n", (unsigned long)nuevoIntervaloS);
    return;
  }

  if (datos[1] == CMD_ALERTA)
  {
    if (longitud != 4 || datos[3] > 1)
    {
      Serial.println("[Gestion] Valor de alerta invalido");
      programarAckAdministrativo();
      return;
    }

    alertaRemota = datos[3] == 1;
    movimientoSolicitado = MOV_DETENIDO;
    ultimoEstadoComando = CMD_OK;
    configuracionPendienteGuardar = true;
    programarAckAdministrativo();

    Serial.printf(
      "[Gestion] Alerta remota %s, txId=%u\r\n",
      alertaRemota ? "ACTIVADA" : "DESACTIVADA",
      ultimaTransaccion
    );
    return;
  }

  if (datos[1] == CMD_LUZ)
  {
    if (longitud != 5 || datos[3] > LUZ_PARQUEO || datos[4] > 1)
    {
      Serial.println("[Gestion] Identificador o valor de luz invalido");
      programarAckAdministrativo();
      return;
    }

    bool encendida = datos[4] == 1;
    switch (datos[3])
    {
      case LUZ_FRONTAL:
        luzFrontal = encendida;
        break;
      case LUZ_TRASERA:
        luzTrasera = encendida;
        break;
      case LUZ_PARQUEO:
        lucesParqueo = encendida;
        if (!encendida) faseParqueo = false;
        break;
    }

    ultimoEstadoComando = CMD_OK;
    programarAckAdministrativo();
    actualizarActuadores();
    Serial.printf(
      "[Gestion] Luz %u %s, txId=%u\r\n",
      datos[3],
      encendida ? "ENCENDIDA" : "APAGADA",
      ultimaTransaccion
    );
    return;
  }

  ultimoEstadoComando = CMD_NO_SOPORTADO;
  programarAckAdministrativo();
  Serial.println("[Gestion] Comando no soportado");
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
  pinMode(PIN_LUZ_PARQUEO, OUTPUT);

  detenerMotoresInmediato();
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LUZ_FRONTAL, LOW);
  digitalWrite(PIN_LUZ_TRASERA, LOW);
  digitalWrite(PIN_LUZ_PARQUEO, LOW);
  cargarConfiguracion();
#if !HABILITAR_TTN
  // Una alerta guardada anteriormente no debe impedir la prueba local. El
  // valor persistido no se borra y volvera a aplicarse al reactivar TTN.
  alertaRemota = false;
  configuracionPendienteGuardar = false;
#endif

  bluetooth.begin(9600, SERIAL_8N1, PIN_BT_RX, PIN_BT_TX);
  mpuDisponible = iniciarMpu6050();
  if (mpuDisponible)
  {
    mpuDisponible = calibrarMpuVertical();
  }

  display.init();
  display.clear();
  display.display();
  display.setContrast(255);

  mostrarOLED(
#if HABILITAR_TTN
    alertaRemota ? "ALERTA PERSISTENTE" : "SMARTCITYNET ADAS",
    "US915 / FSB2",
    mpuDisponible ? "MPU6050: OK" : "MPU6050: ERROR",
    "Iniciando LoRaWAN"
#else
    "VEHICULO - LOCAL",
    "TTN DESHABILITADO",
    mpuDisponible ? "MPU6050: OK" : "MPU6050: ERROR",
    "USB/BT: comandos"
#endif
  );

  Serial.println();
  Serial.println("========================================");
#if HABILITAR_TTN
  Serial.println(" HELTEC V3 - VEHICULO ADAS + LESHAN");
  Serial.println(" US915 / FSB2 / OTAA / CLASE A");
  Serial.printf(" Intervalo: %lu s\r\n", (unsigned long)(appTxDutyCycle / 1000UL));
  Serial.printf(" Alerta persistida: %s\r\n", alertaRemota ? "ON" : "OFF");
#else
  Serial.println(" HELTEC V3 - PRUEBA LOCAL");
  Serial.println(" TTN/LoRaWAN: DESHABILITADO");
  Serial.println(" Comandos: monitor USB o Bluetooth HC-06");
#endif
  Serial.printf(" MPU6050: %s\r\n", mpuDisponible ? "OK Y CALIBRADO" : "NO DISPONIBLE");
  Serial.println("========================================");
}


/* =========================================================
   LOOP
   ========================================================= */

void loop()
{
  // Persiste fuera del callback de radio y lo antes posible tras un comando.
  guardarConfiguracionSiCorresponde();
  actualizarControlUsbLocal();
  actualizarBluetooth();
  actualizarSensores();
  actualizarMotores();
  actualizarActuadores();
  actualizarOLED();
  imprimirDiagnosticoLocal();

#if HABILITAR_TTN
  switch (deviceState)
  {
    case DEVICE_STATE_INIT:
    {
#if (LORAWAN_DEVEUI_AUTO)
      LoRaWAN.generateDeveuiByChipID();
#endif
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
      prepareTxFrame(appPort);

      Serial.printf(
        "[LoRaWAN] TX #%lu tipo=0x%02X bytes=%u confirmado=%s\r\n",
        (unsigned long)contadorEnvios,
        appData[1],
        appDataSize,
        isTxConfirmed ? "si" : "no"
      );

      LoRaWAN.send();
      deviceState = DEVICE_STATE_CYCLE;
      break;
    }

    case DEVICE_STATE_CYCLE:
    {
      guardarConfiguracionSiCorresponde();
      if (repeticionesAckPendientes > 0)
      {
        txDutyCycleTime = RETARDO_ACK_ADMINISTRATIVO_MS;
        Serial.printf(
          "[Gestion] Siguiente repeticion de ACK en %lu ms\r\n",
          (unsigned long)txDutyCycleTime
        );
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
#else
  // Cede tiempo al sistema sin activar ni procesar la radio LoRa.
  delay(1);
#endif
}
