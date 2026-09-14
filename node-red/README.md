# Dashboard Node-RED de SmartCityNet

Este componente visualiza el *device twin* del vehículo y permite solicitar
operaciones administrativas conservando a Leshan como punto de control:

```text
Bridge --HTTP/lectura--> Node-RED Dashboard
Node-RED --HTTP/Write--> Leshan --CoAP--> cliente virtual --HTTP--> Bridge
Bridge --MQTT--> TTN --LoRaWAN Clase A--> Heltec
```

Node-RED no se conecta directamente a TTN ni sustituye a Leshan. Las lecturas
se actualizan cada dos segundos desde la API local del Bridge y las escrituras
usan la API de Leshan.

## Instalación

La instalación es local al proyecto y no requiere `sudo`. El script descarga
Node.js 24.19.0 desde `nodejs.org`, verifica su SHA-256 e instala Node-RED 5.0.4
y FlowFuse Dashboard 1.30.2:

```bash
cd node-red
./install-node-red.sh
```

La descarga de Node.js se guarda en `.runtime/` y las dependencias en
`node_modules/`; ambos directorios están excluidos por `.gitignore`.

## Ejecución

Primero deben estar activos el Bridge, Leshan Server y el cliente virtual del
vehículo. Después:

```bash
cd node-red
./run-node-red.sh
```

Direcciones locales:

- Dashboard: <http://127.0.0.1:1880/dashboard/vehiculo>
- Editor de flujos: <http://127.0.0.1:1880>
- Leshan: <http://127.0.0.1:8080>
- Bridge: <http://127.0.0.1:8081/devices>

El servicio escucha únicamente en `127.0.0.1`. Para detenerlo use `Ctrl+C` en
la terminal donde se está ejecutando.

## Funciones del dashboard

- Estado de conexión y última comunicación.
- Batería, RSSI, SNR, movimiento y velocidad.
- Distancias frontal y trasera, pitch, roll y temperatura interna del MPU6050.
- Temperatura ambiente y humedad relativa del DHT11 con indicador de validez.
- Mapa OpenStreetMap, latitud, longitud y estado de la posición GPS.
- Eventos detectados y disponibilidad del MPU6050.
- Estado actual de la alerta remota.
- Última operación administrativa y su ciclo hasta `acknowledged`.
- Activación/desactivación de la alarma mediante `/32769/0/11`.
- Escritura del intervalo mediante `/32769/0/0`.
- Control y confirmación de las luces frontal, trasera, parqueo y direccionales
  mediante `/32769/0/23`, `/32769/0/24`, `/32769/0/25`, `/32769/0/32` y
  `/32769/0/33`.

El mapa no requiere una API key. El navegador que abre el dashboard sí necesita
acceso a `openstreetmap.org` para descargar la cartografía; las coordenadas
siguen visibles aunque el mapa externo no pueda cargarse.

Los controles piden confirmación antes de enviar una escritura. La aceptación
HTTP/CoAP no implica que la Heltec ya aplicó el comando: el dashboard muestra la
operación como completada solamente cuando el Bridge recibe el ACK de
aplicación y cambia a `acknowledged`.

Mientras una operación permanezca en `requested`, `published`, `ttn_queued` o
`ttn_sent`, los demás controles se mantienen bloqueados. Node-RED también
valida el campo `success` de la respuesta de Leshan; una respuesta HTTP 200 que
contenga un error CoAP ya no se presenta como escritura aceptada.

## Configuración para otro dispositivo

Los valores predeterminados son:

```text
DEVICE_ID=heltec-labredes
LESHAN_ENDPOINT=smartcitynet-heltec-labredes
BRIDGE_URL=http://127.0.0.1:8081
LESHAN_URL=http://127.0.0.1:8080
```

Pueden cambiarse al iniciar:

```bash
DEVICE_ID=otro-vehiculo \
LESHAN_ENDPOINT=smartcitynet-otro-vehiculo \
./run-node-red.sh
```

Debe existir una instancia del cliente virtual Leshan registrada con el mismo
endpoint.

## Archivos

- `flows.json`: flujo importable/editable de Node-RED.
- `dashboard.vue`: interfaz responsive usada por `ui-template`.
- `settings.js`: servidor local y configuración del editor.
- `run-node-red.sh`: arranque con variables predeterminadas.
- `install-node-red.sh`: instalación reproducible sin `sudo`.

## Diagnóstico

Comprobar los tres servicios:

```bash
curl -s http://127.0.0.1:8081/health
curl -s http://127.0.0.1:8080/api/clients | python3 -m json.tool
curl -I http://127.0.0.1:1880/dashboard/vehiculo
```

Si el dashboard abre pero no muestra datos, confirme que `/devices` contiene el
valor configurado en `DEVICE_ID`. Si los controles fallan, confirme que Leshan
contiene exactamente el endpoint configurado en `LESHAN_ENDPOINT`.

## Seguridad

El editor y el dashboard no tienen autenticación porque este prototipo está
limitado a localhost. No cambie `NODE_RED_HOST` a `0.0.0.0` ni publique el
puerto 1880 sin configurar autenticación, HTTPS y reglas de acceso.
