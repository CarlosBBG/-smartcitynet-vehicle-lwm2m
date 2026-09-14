# SmartCityNet LwM2M-LoRaWAN Bridge — fase 1

Este componente implementa el primer corte vertical de la propuesta:

```text
Heltec V3 <--LoRaWAN--> TTN <--MQTT/TLS--> Bridge <--HTTP--> cliente virtual <--LwM2M/CoAP--> Eclipse Leshan
```

La versión 1 recibe los uplinks de TTN, conserva un *device twin* local y permite
cambiar el intervalo de transmisión, la alerta remota y las cinco funciones de
iluminación del vehículo. El Bridge genera el downlink, lo deja en la cola de TTN y registra su
estado hasta recibir el ACK de la Heltec.

No se encapsula una trama CoAP completa en LoRaWAN. El protocolo binario pequeño
es la capa de adaptación; el cliente LwM2M virtual implementado en `../leshan/`
registra en Leshan todos los recursos, incluido el control de luces, descritos
en `../leshan/models/32769.xml`.

## Preparación en TTN

En la aplicación de The Things Network, abra **Integrations > MQTT** y genere una
API key. Necesita permiso para leer tráfico de aplicación y escribir downlinks.
En TTN Cloud el usuario suele tener la forma `application-id@ttn`.

```bash
cd bridge
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e .
cp .env.example .env
```

Edite `.env` con el servidor, usuario y API key mostrados por TTN. No suba este
archivo a un repositorio. Para ejecutar:

```bash
set -a
. ./.env
set +a
smartcitynet-bridge
```

La API se limita de forma predeterminada a `127.0.0.1:8081`.

## Uso

Después del primer uplink:

```bash
curl http://127.0.0.1:8081/devices
curl http://127.0.0.1:8081/operations
```

Para solicitar un intervalo de 60 segundos:

```bash
curl -X POST http://127.0.0.1:8081/devices/DEVICE_ID/transmission-interval \
  -H 'Content-Type: application/json' \
  -d '{"value":60}'
```

Para activar la alerta remota de un vehículo compatible:

```bash
curl -X POST http://127.0.0.1:8081/devices/DEVICE_ID/alert \
  -H 'Content-Type: application/json' \
  -d '{"value":true}'
```

Las luces se administran con `front`, `rear`, `parking`, `left` o `right`. Por
ejemplo:

```bash
curl -X POST http://127.0.0.1:8081/devices/DEVICE_ID/lights/front \
  -H 'Content-Type: application/json' \
  -d '{"value":true}'
```

La respuesta HTTP `202` con estado `published` significa que el Bridge publicó
la solicitud, no que el dispositivo la aplicó. Los eventos de TTN la llevan por
`ttn_queued` y `ttn_sent`. Como la placa es Clase A, recibirá el downlink después
de un uplink. En su siguiente transmisión enviará el ACK de aplicación; solo
entonces cambia a `acknowledged` o `rejected`.

El Bridge publica mediante `down/replace` y usa un downlink no confirmado. Para
no sustituir una orden que la Heltec todavía debe confirmar, rechaza con HTTP
`409 Conflict` cualquier escritura nueva mientras la operación más reciente
esté en `requested`, `published`, `ttn_queued` o `ttn_sent`. Una operación sin
progreso durante 180 segundos cambia a `timed_out` y libera el siguiente
comando. La confirmación autoritativa es el ACK de aplicación, que incluye el
identificador de transacción y el valor aplicado.

## Protocolo binario

Todos los enteros multibyte usan orden de red (*big-endian*).

| Dirección | FPort | Tipo | Contenido |
|---|---:|---:|---|
| Uplink | 10 | `0x01` | versión, tipo, flags, último txId/estado, contador, intervalo, batería mV |
| Uplink | 10 | `0x02` | versión, tipo, txId, estado, intervalo aplicado |
| Uplink | 10 | `0x03` | telemetría vehicular; 41 bytes con GPS y DHT11, compatible con 27 y 36 bytes |
| Downlink | 11 | `0x10` | versión, comando, txId, nuevo intervalo en segundos |
| Downlink | 11 | `0x11` | versión, comando, txId, alerta remota 0/1 |
| Downlink | 11 | `0x12` | versión, comando, txId, luz 0..2, estado 0/1 |

El intervalo aceptado está entre 15 y 86400 segundos. La Heltec lo persiste en
NVS, por lo que sobrevive a reinicios.

## Pruebas

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

La base SQLite contiene dos tablas: `devices` para el estado más reciente y
`operations` para el ciclo de vida de cada solicitud administrativa.
