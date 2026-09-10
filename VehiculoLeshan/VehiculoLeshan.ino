/*
 * SmartCityNet - Vehiculo ADAS administrado desde Eclipse Leshan
 *
 * Hardware de referencia: Heltec WiFi LoRa 32 V3
 * Modo predeterminado: conexion a TTN por LoRaWAN Clase A.
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
#include "credentials.h"

// true: conexion a TTN. false: prueba local por USB y Bluetooth, sin radio.
const bool usarTTN = true;


/* =========================================================
   PINES RECUPERADOS DEL FIRMWARE ORIGINAL DEL TIC
   ========================================================= */

// Puente H L298N.
const uint8_t PIN_IN1 = 6;
const uint8_t PIN_IN2 = 5;
const uint8_t PIN_IN3 = 4;
const uint8_t PIN_IN4 = 3;
const uint8_t PIN_ENA = 7;
const uint8_t PIN_ENB = 2;

// HC-SR04 frontal y trasero.
const uint8_t PIN_TRIG_FRONTAL = 39;
const uint8_t PIN_ECHO_FRONTAL = 40;
const uint8_t PIN_TRIG_TRASERO = 47;
const uint8_t PIN_ECHO_TRASERO = 48;

// MPU6050 en un bus I2C distinto al OLED integrado.
const uint8_t PIN_MPU_SDA = 41;
const uint8_t PIN_MPU_SCL = 42;


/* =========================================================
   LUCES, BUZZER Y BLUETOOTH DEL FIRMWARE ORIGINAL
   ========================================================= */

const uint8_t PIN_BUZZER = 34;
const uint8_t PIN_LUZ_FRONTAL = 45;
const uint8_t PIN_LUZ_TRASERA = 46;
const uint8_t PIN_LUZ_PARQUEO = 1;

// UART1 para HC-06. Conectar HC-06 TX -> GPIO19 y HC-06 RX -> GPIO20.
const uint8_t PIN_BT_RX = 19;
const uint8_t PIN_BT_TX = 20;


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
     tipo 0x03: telemetria vehicular (27 bytes)

   Downlink FPort 11:
     01 10 txId intervalo_s(4)  -> cambiar intervalo
     01 11 txId estado          -> alerta remota, 0=OFF, 1=ON
     01 12 txId luz estado      -> luz 0=frontal, 1=trasera, 2=parqueo
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
bool bocina = false;

// Fases instantaneas de parpadeo y salida fisica del buzzer.
bool faseParqueo = false;
bool faseAlarma = false;
bool faseAvisoReversa = false;
bool faseLuzReversa = false;
bool buzzerSonando = false;

uint32_t contadorEnvios = 0;

// Marcas de millis() para ejecutar cada tarea sin bloquear el resto.
uint32_t ultimoSensor = 0;
uint32_t ultimoMotor = 0;
uint32_t ultimoParqueo = 0;
uint32_t ultimaAlarma = 0;
uint32_t ultimoAvisoReversa = 0;
uint32_t ultimaLuzReversa = 0;
uint32_t ultimoOLED = 0;
uint32_t ultimoDiagnostico = 0;


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

// El firmware original usa GPIO1 para la luz de parqueo. Ese GPIO coincide
// con la entrada ADC de bateria de la Heltec V3 y no puede cumplir ambas
// funciones simultaneamente. Se conserva el campo del protocolo con 0 mV
// para indicar que esta medicion no esta disponible en esta PCB.
uint16_t leerBateriaMv()
{
  return 0;
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

  if (alertaRemota)
  {
    const char *alarma = "ALARMA: OFF";
    if (faseAlarma)
    {
      alarma = "ALARMA: ON";
    }
    mostrarOLED(
      "ALERTA REMOTA",
      "MOTORES BLOQUEADOS",
      alarma,
      "Esperando desbloqueo"
    );
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

  // El bloqueo remoto tiene prioridad absoluta y detención inmediata.
  if (alertaRemota)
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
  // Las minusculas w/u/v/x apagan actuadores. Deben conservar su significado;
  // el resto de las letras se acepta indistintamente en mayuscula/minuscula.
  switch (comando)
  {
    case 'w':
    case 'u':
    case 'v':
    case 'x':
      return comando;
    default:
      if (comando >= 'a' && comando <= 'z')
      {
        return comando - ('a' - 'A');
      }
      return comando;
  }
}

void procesarComandoBluetooth(char comando)
{
  if (comando == '\r' || comando == '\n')
  {
    return;
  }

  const char orden = normalizarComandoBluetooth(comando);

  if (alertaRemota && esComandoMovimiento(orden))
  {
    movimientoSolicitado = MOV_DETENIDO;
    Serial.printf(
      "[Bluetooth] Movimiento %c ignorado: alerta remota activa\r\n",
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
      lucesParqueo = true;
      break;
    case 'x':
      lucesParqueo = false;
      faseParqueo = false;
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

  if (!lucesParqueo)
  {
    faseParqueo = false;
  }
  else if (ahora - ultimoParqueo >= 300UL)
  {
    ultimoParqueo = ahora;
    faseParqueo = !faseParqueo;
  }

  if (!alertaRemota)
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
  digitalWrite(PIN_LUZ_PARQUEO, faseParqueo);
  // La alarma remota tiene prioridad sobre la bocina y el aviso de reversa.
  if (alertaRemota)
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

  // Campos finales: intervalo en segundos y bateria en milivoltios.
  escribirUint32BE(&appData[21], appTxDutyCycle / 1000UL);
  escribirUint16BE(&appData[25], leerBateriaMv());
  appDataSize = 27;
}

void prepararEnvio()
{
  const bool enviandoAck = ackPendientes > 0;
  isTxConfirmed = enviandoAck;

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
  if (luz > LUZ_PARQUEO || estado > 1)
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
      lucesParqueo = encendida;
      if (!encendida)
      {
        faseParqueo = false;
      }
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
  pinMode(PIN_LUZ_PARQUEO, OUTPUT);

  detenerMotoresInmediato();
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LUZ_FRONTAL, LOW);
  digitalWrite(PIN_LUZ_TRASERA, LOW);
  digitalWrite(PIN_LUZ_PARQUEO, LOW);
  cargarConfiguracion();
  if (!usarTTN)
  {
    // Ignora la alerta durante la prueba local, sin borrar el valor guardado.
    alertaRemota = false;
    guardarPendiente = false;
  }

  bluetooth.begin(9600, SERIAL_8N1, PIN_BT_RX, PIN_BT_TX);
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
