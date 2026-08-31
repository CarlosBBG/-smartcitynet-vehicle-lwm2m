# SmartCityNet — vehículo LoRaWAN administrado con LwM2M

Prototipo académico que integra un vehículo basado en **Heltec WiFi LoRa 32
V3** con **The Things Network (TTN)**, un Bridge MQTT/HTTP, **Eclipse Leshan** y
un dashboard de **Node-RED**. El sistema transmite telemetría y permite cambiar
el intervalo de envío, bloquear los motores y controlar las luces de forma
remota.

La instalación detallada, el protocolo, las pruebas y el diagnóstico están en
la [guía completa](GUIA_COMPLETA.md).

## Arquitectura

```text
Heltec --LoRaWAN--> gateway --> TTN --MQTT/TLS--> Bridge/SQLite
   ^                                           ^          ^
   |                                           | HTTP     | HTTP lectura
   +---- downlink FPort 11 <-------------------+          |
                                               cliente LwM2M virtual
                                                        ^
                                                        | CoAP/UDP
                                                        v
Node-RED ------------------- HTTP Write ----------> Eclipse Leshan
```

La Heltec usa un protocolo binario compacto: uplinks por `FPort 10` y comandos
por `FPort 11`. El cliente virtual representa su *device twin* como el objeto
LwM2M provisional `/32769/0`; no se transporta CoAP directamente sobre
LoRaWAN.

## Funciones de esta versión

- Unión OTAA en `US915 / FSB2` y telemetría vehicular por TTN.
- Control local mediante Bluetooth: movimiento, velocidad, luces y bocina.
- Lectura de dos HC-SR04 y un MPU6050, con detección local de eventos.
- Control remoto del intervalo, alerta/bloqueo y luces frontal, trasera y de
  parqueo.
- Persistencia del *device twin* y de las operaciones en SQLite.
- Confirmación de extremo a extremo mediante `txId` y ACK de aplicación.
- Objeto `SmartCityNet Vehicle Management v1.0` visible en la misma sesión del
  cliente Leshan.
- Dashboard responsive con estado, sensores, vehículo, luces y seguimiento de
  comandos.

## Estructura

| Ruta | Contenido |
|---|---|
| `VehiculoLeshan/` | Firmware principal del vehículo y guía de hardware |
| `EnvioDatos/` | Firmware base de telemetría administrativa |
| `bridge/` | Bridge Python, API local, SQLite y pruebas unitarias |
| `leshan/` | Servidor, objeto 32769 y cliente LwM2M virtual Java |
| `node-red/` | Flujos, dashboard Vue y scripts de instalación |

## Inicio rápido

Requisitos: Ubuntu/Linux, Python 3.10 o posterior, Java 17, Arduino CLI, acceso
a una aplicación TTN y una Heltec WiFi LoRa 32 V3.

1. Copie las plantillas privadas y configure sus propias credenciales:

   ```bash
   cp VehiculoLeshan/credentials.example.h VehiculoLeshan/credentials.h
   cp bridge/.env.example bridge/.env
   ```

2. Compile y cargue el firmware:

   ```bash
   arduino-cli compile \
     --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
     VehiculoLeshan

   arduino-cli upload --port /dev/ttyUSB0 \
     --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
     VehiculoLeshan
   ```

3. Prepare el Bridge una sola vez:

   ```bash
   cd bridge
   python3 -m venv .venv
   . .venv/bin/activate
   python -m pip install -e .
   cd ..
   ```

4. Inicie, en terminales distintas, el Bridge, Leshan, el cliente virtual y
   Node-RED. Sustituya los identificadores de ejemplo por el Device ID de TTN:

   ```bash
   # Terminal 1
   cd bridge
   set -a && . ./.env && set +a
   . .venv/bin/activate
   smartcitynet-bridge
   ```

   ```bash
   # Terminal 2
   cd leshan
   SMARTCITYNET_JAVA_HOME=/ruta/al/jdk-17 ./run-server.sh
   ```

   ```bash
   # Terminal 3
   cd leshan
   DEVICE_ID=heltec-labredes \
   LESHAN_ENDPOINT=smartcitynet-heltec-labredes \
   SMARTCITYNET_JAVA_HOME=/ruta/al/jdk-17 \
   ./run-virtual-client.sh
   ```

   ```bash
   # Terminal 4; ejecutar ./install-node-red.sh antes del primer inicio
   cd node-red
   DEVICE_ID=heltec-labredes \
   LESHAN_ENDPOINT=smartcitynet-heltec-labredes \
   ./run-node-red.sh
   ```

Accesos locales:

- Dashboard: <http://127.0.0.1:1880/dashboard/vehiculo>
- Leshan: <http://127.0.0.1:8080>
- Bridge: <http://127.0.0.1:8081/devices>

## Pruebas

```bash
cd bridge
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

Después de modificar el protocolo, ejecute también la compilación de ambos
sketches Arduino. Consulte la [guía completa](GUIA_COMPLETA.md#12-pruebas-de-la-versión-1)
para la validación integral.

## Seguridad y alcance

No publique `credentials.h`, `bridge/.env`, bases SQLite, entornos virtuales ni
archivos de ejecución local. La configuración incluida escucha en `localhost`
y no tiene autenticación. El Object ID `32769` es provisional para laboratorio.
LoRaWAN Clase A tiene latencia variable: los comandos remotos no sustituyen las
protecciones locales ni deben utilizarse como parada de emergencia.

## Documentación adicional

- [Guía completa de instalación y operación](GUIA_COMPLETA.md)
- [Firmware y conexiones del vehículo](VehiculoLeshan/README.md)
- [Bridge MQTT/HTTP](bridge/README.md)
- [Integración con Leshan](leshan/README.md)
- [Dashboard Node-RED](node-red/README.md)
