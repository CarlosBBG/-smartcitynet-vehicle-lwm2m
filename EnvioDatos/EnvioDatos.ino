/*
 * Heltec WiFi LoRa 32 V3
 * LoRaWAN + TTN + OLED
 *
 * Region: US915
 * TTN: FSB2
 * Activation: OTAA
 */

#include "LoRaWan_APP.h"
#include "HT_SSD1306Wire.h"
#include "credentials.h"
#include <Preferences.h>

/* =========================================================
   OLED INTEGRADO HELTEC V3
   ========================================================= */

static SSD1306Wire display(
  0x3C,
  500000,
  SDA_OLED,
  SCL_OLED,
  GEOMETRY_128_64,
  RST_OLED
);

/* =========================================================
   ABP - NO SE UTILIZA
   ========================================================= */

uint8_t nwkSKey[] = {
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
};

uint8_t appSKey[] = {
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
};

uint32_t devAddr = 0x00000000;


/* =========================================================
   US915 - FSB2
   ========================================================= */

uint16_t userChannelsMask[6] = {
  0xFF00,
  0x0000,
  0x0000,
  0x0000,
  0x0000,
  0x0000
};


/* =========================================================
   CONFIGURACION LORAWAN
   ========================================================= */

LoRaMacRegion_t loraWanRegion = ACTIVE_REGION;

DeviceClass_t loraWanClass = CLASS_A;

/* Intervalo inicial: 30 segundos. Puede cambiarse por downlink. */
uint32_t appTxDutyCycle = 30000;

/* OTAA */
bool overTheAirActivation = true;

/* Adaptive Data Rate */
bool loraWanAdr = true;

/* La telemetria es no confirmada; solo los ACK administrativos se confirman. */
bool isTxConfirmed = false;

/* Puerto de telemetria/ACK del Bridge. Los comandos llegan por FPort 11. */
uint8_t appPort = 10;

/* Reintentos */
uint8_t confirmedNbTrials = 4;


/* =========================================================
   VARIABLES
   ========================================================= */

uint32_t contadorEnvios = 0;

/* =========================================================
   PROTOCOLO SMARTCITYNET - FASE 1

   Uplink FPort 10:
     01 01 flags txId estado contador(4) intervalo_s(4) bateria_mV(2)
     01 02 txId estado intervalo_s(4)            (ACK de comando)

   Downlink FPort 11:
     01 10 txId intervalo_s(4)                   (Write interval)
   ========================================================= */

static const uint8_t SMARTCITYNET_VERSION = 0x01;
static const uint8_t MSG_TELEMETRIA = 0x01;
static const uint8_t MSG_ACK = 0x02;
static const uint8_t CMD_INTERVALO = 0x10;
static const uint8_t PUERTO_COMANDOS = 11;

static const uint32_t INTERVALO_PREDETERMINADO_S = 30;
static const uint32_t INTERVALO_MINIMO_S = 15;
static const uint32_t INTERVALO_MAXIMO_S = 86400;

static const uint8_t CMD_OK = 0;
static const uint8_t CMD_FORMATO_INVALIDO = 1;
static const uint8_t CMD_NO_SOPORTADO = 2;
static const uint8_t CMD_FUERA_DE_RANGO = 3;

volatile bool ackPendiente = false;
volatile bool configuracionPendienteGuardar = false;
volatile uint8_t ultimaTransaccion = 0;
volatile uint8_t ultimoEstadoComando = CMD_OK;

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

static uint16_t leerBateriaMv()
{
  /* Divisor resistivo de la Heltec WiFi LoRa 32 V3/V3.2. */
  digitalWrite(37, HIGH);
  delay(5);

  uint32_t sumaMv = 0;
  for (uint8_t i = 0; i < 8; i++)
  {
    sumaMv += analogReadMilliVolts(1);
  }

  uint32_t bateriaMv = (sumaMv / 8) * 490UL / 100UL;
  return bateriaMv > 65534UL ? 65534U : (uint16_t)bateriaMv;
}

static void cargarConfiguracion()
{
  Preferences preferencias;
  preferencias.begin("smartcitynet", true);
  uint32_t intervaloS = preferencias.getUInt(
    "tx_seconds",
    INTERVALO_PREDETERMINADO_S
  );
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
  preferencias.end();
  configuracionPendienteGuardar = false;
}


/* =========================================================
   FUNCION PARA MOSTRAR INFORMACION EN OLED
   ========================================================= */

void mostrarOLED(
  String linea1,
  String linea2 = "",
  String linea3 = "",
  String linea4 = ""
)
{
  display.clear();

  display.setFont(ArialMT_Plain_10);
  display.setTextAlignment(TEXT_ALIGN_LEFT);

  display.drawString(0, 0,  linea1);
  display.drawString(0, 15, linea2);
  display.drawString(0, 30, linea3);
  display.drawString(0, 45, linea4);

  display.display();
}


/* =========================================================
   PAYLOAD DE ADMINISTRACION
   ========================================================= */

static void prepareTxFrame(uint8_t port)
{
  bool enviandoAck = ackPendiente;
  isTxConfirmed = enviandoAck;

  appData[0] = SMARTCITYNET_VERSION;

  if (enviandoAck)
  {
    appData[1] = MSG_ACK;
    appData[2] = ultimaTransaccion;
    appData[3] = ultimoEstadoComando;
    escribirUint32BE(&appData[4], appTxDutyCycle / 1000UL);
    appDataSize = 8;
    ackPendiente = false;
    return;
  }

  uint16_t bateriaMv = leerBateriaMv();

  appData[1] = MSG_TELEMETRIA;
  appData[2] = 0x01;  // bit 0: sesion LoRaWAN activa
  appData[3] = ultimaTransaccion;
  appData[4] = ultimoEstadoComando;
  escribirUint32BE(&appData[5], contadorEnvios);
  escribirUint32BE(&appData[9], appTxDutyCycle / 1000UL);
  appData[13] = (uint8_t)(bateriaMv >> 8);
  appData[14] = (uint8_t)bateriaMv;
  appDataSize = 15;
}


/* =========================================================
   RECEPCION DE COMANDOS ADMINISTRATIVOS
   ========================================================= */

void downLinkDataHandle(McpsIndication_t *mcpsIndication)
{
  const uint8_t *datos = mcpsIndication->Buffer;
  uint8_t longitud = mcpsIndication->BufferSize;

  Serial.printf(
    "[Gestion] Downlink: puerto=%u bytes=%u\r\n",
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

  if (longitud != 7 || datos[0] != SMARTCITYNET_VERSION)
  {
    Serial.println("[Gestion] Formato o version invalida");
    ackPendiente = true;
    return;
  }

  if (datos[1] != CMD_INTERVALO)
  {
    ultimoEstadoComando = CMD_NO_SOPORTADO;
    Serial.println("[Gestion] Comando no soportado");
    ackPendiente = true;
    return;
  }

  uint32_t nuevoIntervaloS = leerUint32BE(&datos[3]);
  if (nuevoIntervaloS < INTERVALO_MINIMO_S ||
      nuevoIntervaloS > INTERVALO_MAXIMO_S)
  {
    ultimoEstadoComando = CMD_FUERA_DE_RANGO;
    Serial.println("[Gestion] Intervalo fuera de rango (15..86400 s)");
    ackPendiente = true;
    return;
  }

  appTxDutyCycle = nuevoIntervaloS * 1000UL;
  ultimoEstadoComando = CMD_OK;
  configuracionPendienteGuardar = true;
  ackPendiente = true;

  Serial.printf(
    "[Gestion] Intervalo aplicado: %lu s, txId=%u\r\n",
    (unsigned long)nuevoIntervaloS,
    ultimaTransaccion
  );
}


/* =========================================================
   SETUP
   ========================================================= */

void setup()
{
  Serial.begin(115200);

  delay(500);

  /*
   * Inicializar placa Heltec
   */
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);

  pinMode(37, OUTPUT);
  digitalWrite(37, HIGH);
  analogReadResolution(12);
  cargarConfiguracion();

  /*
   * Inicializar OLED
   */
  display.init();
  display.clear();
  display.display();

  display.setContrast(255);

  /*
   * Pantalla inicial
   */
  mostrarOLED(
    "HELTEC LoRaWAN",
    "Region: US915",
    "TTN: FSB2",
    "Iniciando..."
  );

  Serial.println();
  Serial.println("===========================");
  Serial.println(" HELTEC V3 + TTN + OLED");
  Serial.println(" US915 - FSB2 - OTAA");
  Serial.printf(
    " Gestion: uplink FPort 10, downlink FPort 11, intervalo %lu s\r\n",
    (unsigned long)(appTxDutyCycle / 1000UL)
  );
  Serial.println("===========================");

  delay(2000);
}


/* =========================================================
   LOOP LORAWAN
   ========================================================= */

void loop()
{
  switch (deviceState)
  {

    /* =====================================================
       INICIALIZACION
       ===================================================== */

    case DEVICE_STATE_INIT:
    {
      Serial.println("[LoRaWAN] Inicializando");

      mostrarOLED(
        "LoRaWAN US915",
        "TTN FSB2",
        "Inicializando...",
        ""
      );

#if (LORAWAN_DEVEUI_AUTO)

      /*
       * Si esta opcion esta activa en Arduino IDE,
       * genera automaticamente un DevEUI.
       *
       * Para usar el DevEUI escrito arriba,
       * LORAWAN_DEVEUI_AUTO debe estar desactivado.
       */
      LoRaWAN.generateDeveuiByChipID();

#endif

      LoRaWAN.init(
        loraWanClass,
        loraWanRegion
      );

      LoRaWAN.setDefaultDR(3);

      delay(1000);

      break;
    }


    /* =====================================================
       JOIN OTAA
       ===================================================== */

    case DEVICE_STATE_JOIN:
    {
      Serial.println("[LoRaWAN] JOIN OTAA...");

      mostrarOLED(
        "TTN - OTAA",
        "US915 / FSB2",
        "Buscando red...",
        "JOIN..."
      );

      LoRaWAN.join();

      break;
    }


    /* =====================================================
       ENVIO
       ===================================================== */

    case DEVICE_STATE_SEND:
    {
      contadorEnvios++;

      prepareTxFrame(appPort);

      Serial.println("[LoRaWAN] JOIN OK");
      Serial.println("[LoRaWAN] Enviando payload");

      Serial.print("Payload: ");

      for (uint8_t i = 0; i < appDataSize; i++)
      {
        if (appData[i] < 0x10)
        {
          Serial.print("0");
        }

        Serial.print(appData[i], HEX);
        Serial.print(" ");
      }

      Serial.println();


      /*
       * Mostrar en OLED
       */
      mostrarOLED(
        "TTN: CONECTADO",
        isTxConfirmed ? "ACK gestion" : "Telemetria",
        "TX #" + String(contadorEnvios),
        "Cada " + String(appTxDutyCycle / 1000UL) + " s"
      );


      /*
       * Enviar por LoRaWAN
       */
      LoRaWAN.send();


      Serial.println("[LoRaWAN] Uplink enviado");

      deviceState = DEVICE_STATE_CYCLE;

      break;
    }


    /* =====================================================
       ESPERA ENTRE TRANSMISIONES
       ===================================================== */

    case DEVICE_STATE_CYCLE:
    {
      guardarConfiguracionSiCorresponde();

      txDutyCycleTime =
        appTxDutyCycle +
        randr(
          -APP_TX_DUTYCYCLE_RND,
          APP_TX_DUTYCYCLE_RND
        );


      Serial.print("[LoRaWAN] Proximo envio: ");
      Serial.print(txDutyCycleTime / 1000);
      Serial.println(" s");


      mostrarOLED(
        "TTN: CONECTADO",
        "Ultimo TX: #" + String(contadorEnvios),
        "Enviado OK",
        "Prox: " +
        String(txDutyCycleTime / 1000) +
        " s"
      );


      LoRaWAN.cycle(txDutyCycleTime);

      deviceState = DEVICE_STATE_SLEEP;

      break;
    }


    /* =====================================================
       SLEEP
       ===================================================== */

    case DEVICE_STATE_SLEEP:
    {
      /*
       * Modo de laboratorio para administracion remota.
       *
       * LoRaWAN.sleep() puede llevar al ESP32-S3 a su modo de bajo consumo.
       * En ese modo las variables de la aplicacion se reinician y se puede
       * perder el ACK pendiente de un comando recibido en RX1/RX2. Mientras
       * validamos el Bridge y Leshan mantenemos activo el procesado de timers
       * e interrupciones de radio. En una fase posterior se podra recuperar
       * el bajo consumo guardando todo el estado administrativo en RTC/NVS.
       */
      Mcu.timerhandler();
      Radio.IrqProcess();
      delay(1);

      break;
    }


    /* =====================================================
       ERROR / REINICIO
       ===================================================== */

    default:
    {
      mostrarOLED(
        "LoRaWAN",
        "Reiniciando...",
        "",
        ""
      );

      deviceState = DEVICE_STATE_INIT;

      break;
    }
  }
}
