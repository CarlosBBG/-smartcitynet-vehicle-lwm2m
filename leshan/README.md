# Integración con Eclipse Leshan

Esta fase implementa un cliente LwM2M virtual para representar en Eclipse
Leshan el nodo LoRaWAN `heltec-labredes`.

La Heltec no transporta CoAP. El cliente virtual consulta el *device twin* del
Bridge y adapta las operaciones LwM2M a su API HTTP:

```text
Leshan Server <--LwM2M/CoAP--> cliente virtual <--HTTP--> Bridge <--MQTT--> TTN
```

## Componentes

- Eclipse Leshan `2.0.0-M18`.
- Servidor demo local en `http://127.0.0.1:8080` y
  `coap://127.0.0.1:5683`.
- Cliente virtual Java con endpoint `smartcitynet-heltec-labredes`.
- Objeto Device estándar `/3/0`.
- Objeto provisional SmartCityNet `/32769/0`, definido en
  [`models/32769.xml`](models/32769.xml).

Se requiere un JDK 17. Indique su ubicación mediante la variable
`SMARTCITYNET_JAVA_HOME` si no coincide con la ruta predeterminada de los
scripts.

## Arranque

Primero se inicia el Bridge:

```bash
cd bridge
set -a
source .env
set +a
source .venv/bin/activate
smartcitynet-bridge
```

En otra terminal se inicia Leshan Server:

```bash
cd leshan
./run-server.sh
```

Y en una tercera terminal se registra el cliente virtual:

```bash
cd leshan
./run-virtual-client.sh
```

La interfaz queda disponible en <http://127.0.0.1:8080>. La compilación manual
del cliente puede comprobarse con:

```bash
./build-virtual-client.sh
```

Los JAR oficiales se descargan en `.runtime/`, que no se versiona.

## Lectura desde Leshan

```bash
curl http://127.0.0.1:8080/api/clients

curl \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0
```

El cliente consulta el Bridge cada dos segundos. Cuando cambia el *device
twin*, llama a `fireResourceChange`, permitiendo que las relaciones
Observe/Notify de Leshan reciban el cambio sin generar una consulta LoRaWAN.

## Escritura del intervalo

Una escritura LwM2M de 30 segundos puede probarse mediante la API del servidor
demo:

```bash
curl -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/0 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":0,"type":"INTEGER","value":"30"}'
```

La respuesta CoAP `CHANGED(204)` significa que el Bridge aceptó la solicitud.
No significa que la Heltec ya la haya aplicado. El recurso `/32769/0/9`
permite seguir `published`, `ttn_queued`, `ttn_sent`, `acknowledged` o
`rejected`; `/32769/0/0` cambia únicamente después del ACK de aplicación.

La extensión vehicular permite activar la alarma y bloquear motores escribiendo
`true` en `/32769/0/11`, y desbloquearlos escribiendo `false`:

```bash
curl -X PUT \
  http://127.0.0.1:8080/api/clients/ENDPOINT/32769/0/11 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":11,"type":"BOOLEAN","value":true}'
```

Las luces se controlan en el mismo objeto `/32769/0`. Este ejemplo enciende la
luz frontal; use `24`, `25`, `32` y `33` para la trasera, parqueo, direccional
izquierda y direccional derecha respectivamente:

```bash
curl -X PUT \
  http://127.0.0.1:8080/api/clients/ENDPOINT/32769/0/23 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":23,"type":"BOOLEAN","value":true}'
```

## Recursos

| Ruta | Nombre | Operaciones | Fuente |
|---|---|---|---|
| `/32769/0/0` | Transmission Interval | RW | Heltec/Bridge |
| `/32769/0/1` | Uplink Counter | R | Heltec |
| `/32769/0/2` | Battery Voltage | R | Heltec |
| `/32769/0/3` | Battery Level | R | Bridge |
| `/32769/0/4` | Last Command Status | R | Heltec |
| `/32769/0/5` | Last Transaction ID | R | Heltec |
| `/32769/0/6` | RSSI | R | TTN |
| `/32769/0/7` | SNR | R | TTN |
| `/32769/0/8` | Last Seen | R | TTN/Bridge |
| `/32769/0/9` | Operation State | R | Bridge |
| `/32769/0/10` | DevEUI | R | TTN |
| `/32769/0/11` | Remote Alert | RW | Heltec/Bridge |
| `/32769/0/12` | Movement | R | Heltec |
| `/32769/0/13` | Speed | R | Heltec |
| `/32769/0/14` | Front Distance | R | HC-SR04 |
| `/32769/0/15` | Rear Distance | R | HC-SR04 |
| `/32769/0/16` | Pitch | R | MPU6050 |
| `/32769/0/17` | Roll | R | MPU6050 |
| `/32769/0/18` | Temperature | R | MPU6050 |
| `/32769/0/19` | Actuator Flags | R | Heltec |
| `/32769/0/20` | Event Flags | R | Heltec |
| `/32769/0/21` | Event Summary | R | Bridge |
| `/32769/0/22` | MPU Available | R | Heltec |
| `/32769/0/23` | Front Light | RW | Heltec/Bridge |
| `/32769/0/24` | Rear Light | RW | Heltec/Bridge |
| `/32769/0/25` | Parking Lights | RW | Heltec/Bridge |
| `/32769/0/26` | Latitude | R | GPS |
| `/32769/0/27` | Longitude | R | GPS |
| `/32769/0/28` | GPS Available | R | Heltec |
| `/32769/0/29` | Ambient Temperature | R | DHT11 |
| `/32769/0/30` | Relative Humidity | R | DHT11 |
| `/32769/0/31` | DHT Available | R | Heltec |
| `/32769/0/32` | Left Turn Indicator | RW | Heltec/Bridge |
| `/32769/0/33` | Right Turn Indicator | RW | Heltec/Bridge |
| `/32769/0/34` | Local Panic | R | Heltec |

El identificador 32769 es provisional para laboratorio. El rango 32769–42768
requiere reserva empresarial en OMNA y no debe presentarse como una asignación
oficial.
