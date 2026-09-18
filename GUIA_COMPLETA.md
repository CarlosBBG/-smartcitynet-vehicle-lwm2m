# Guía completa de SmartCityNet — versión 1

Esta guía documenta la primera versión reproducible del prototipo SmartCityNet:
firmware del vehículo, conexión LoRaWAN con The Things Network (TTN), Bridge de
adaptación, representación LwM2M en Eclipse Leshan y dashboard Node-RED.

El documento está preparado para acompañar el repositorio público. Todos los
identificadores y secretos mostrados son ejemplos; use valores propios y nunca
publique credenciales reales.

## 1. Alcance y resultado

La versión 1 permite:

- operar el vehículo localmente mediante Bluetooth;
- leer dos sensores ultrasónicos, un MPU6050 y un DHT11;
- mostrar la ubicación de un GPS GY-GPS6MV2 en la Heltec, Leshan y Node-RED;
- detener y bloquear el vehículo mediante un botón de pánico local;
- detectar obstáculos, colisión, inclinación, curvas y pendientes;
- controlar motores, velocidad, buzzer y luces;
- unirse a TTN por OTAA en `US915 / FSB2`;
- transmitir telemetría vehicular en `FPort 10`;
- recibir comandos administrativos en `FPort 11`;
- cambiar el intervalo de transmisión entre 15 y 86400 segundos;
- activar una alerta remota que detiene y bloquea los motores;
- encender y apagar las luces frontal, trasera, parqueo y direccionales;
- persistir el estado del dispositivo y las operaciones en SQLite;
- exponer el vehículo en Leshan como `SmartCityNet Vehicle Management v1.0`;
- visualizar y administrar el dispositivo desde Node-RED;
- confirmar cada comando mediante un `txId` y un ACK enviado por la Heltec.

La protección ante obstáculos e inclinación se ejecuta en el vehículo. Los
comandos LoRaWAN son administrativos y no constituyen un mecanismo de seguridad
en tiempo real.

## 2. Arquitectura

```text
                              UPLINK
Heltec ──LoRaWAN──> gateway ──> TTN ──MQTT/TLS──> Bridge ──> SQLite
   ^                                                ^   ^
   │                                                │   │ HTTP lectura
   │ DOWNLINK                                       │   └──── Node-RED
   └──────── gateway <── TTN <── MQTT <─────────────┘          │
                                                               │ HTTP Write
Leshan Server <──LwM2M/CoAP──> cliente virtual <──HTTP─────────┘
```

El diagrama lógico completo es:

```text
Node-RED --PUT--> Leshan --> cliente LwM2M --> Bridge --> TTN --> Heltec
Node-RED <--GET----------------------------- Bridge <-- TTN <-- Heltec
```

Cada tecnología cumple una función distinta:

| Componente | Responsabilidad |
|---|---|
| Heltec | Sensores, actuadores, telemetría, comandos y ACK físico |
| LoRaWAN/TTN | Enlace inalámbrico, OTAA, uplinks, downlinks y metadatos de radio |
| Bridge | MQTT, protocolo binario, *device twin*, API y transacciones |
| Cliente virtual | Adaptación HTTP ↔ recursos LwM2M |
| Leshan | Servidor LwM2M y punto de administración |
| Node-RED | Visualización y envío de escrituras a Leshan |

La Heltec no ejecuta CoAP. El segmento CoAP/UDP existe entre Leshan y el cliente
virtual; el enlace LoRaWAN utiliza tramas compactas adecuadas para su límite de
payload y su comunicación diferida.

## 3. Estructura del repositorio

```text
Investigacion/
├── README.md
├── GUIA_COMPLETA.md
├── EnvioDatos/                 # firmware base
├── VehiculoLeshan/             # firmware principal y hardware
├── bridge/
│   ├── smartcitynet_bridge/    # paquete Python
│   ├── tests/                  # pruebas unittest
│   └── data/                   # SQLite local, no versionar
├── leshan/
│   ├── models/32769.xml
│   ├── virtual-client/         # cliente Java
│   └── *.sh                    # compilación y arranque
└── node-red/
    ├── flows.json
    ├── dashboard.vue
    └── *.sh
```

Para las conexiones eléctricas, comandos Bluetooth y comportamiento exacto de
los motores consulte [`VehiculoLeshan/README.md`](VehiculoLeshan/README.md).

## 4. Requisitos

La implementación se desarrolló con estas versiones de referencia:

| Componente | Versión |
|---|---:|
| Ubuntu | 22.04.5 LTS |
| Arduino CLI | 1.5.1 |
| Core `Heltec-esp32:esp32` | 3.3.8 |
| Heltec ESP32 Dev-Boards | 2.1.6 |
| Python | 3.10.12 o posterior |
| Paho MQTT | 2.x |
| Java | 17 |
| Eclipse Leshan | 2.0.0-M18 |
| Node-RED | 5.0.4 |
| FlowFuse Dashboard | 1.30.2 |

También se necesita una aplicación TTN, un gateway compatible con US915 y una
Heltec WiFi LoRa 32 V3. El firmware presupone el montaje descrito en la guía del
vehículo.

### Preparar Arduino CLI

```bash
arduino-cli config add board_manager.additional_urls \
  https://resource.heltec.cn/download/package_heltec_esp32_index.json
arduino-cli core update-index
arduino-cli core install Heltec-esp32:esp32@3.3.8
arduino-cli lib install "Heltec ESP32 Dev-Boards@2.1.6"
```

Si `/dev/ttyUSB0` devuelve `Permission denied`, añada su usuario al grupo
`dialout` y vuelva a iniciar sesión:

```bash
sudo usermod -aG dialout "$USER"
```

Compruebe la placa con `arduino-cli board list`. Mantenga las ruedas levantadas
durante las primeras pruebas de motores.

## 5. Configuración de TTN

### 5.1 Crear la aplicación y el dispositivo

En The Things Stack:

1. Cree una aplicación.
2. Registre el dispositivo final mediante OTAA.
3. Use el plan regional `United States 902–928 MHz, FSB 2`.
4. Genere un DevEUI, JoinEUI y AppKey propios.
5. Anote el **Device ID** de TTN; se reutilizará en todos los servicios.

El Device ID no es el DevEUI. En los ejemplos se usa `heltec-labredes`, pero
puede elegir otro nombre.

### 5.2 Credenciales de la Heltec

```bash
cp VehiculoLeshan/credentials.example.h VehiculoLeshan/credentials.h
```

Edite la copia con DevEUI, JoinEUI y AppKey. Respete el orden de bytes indicado
por la plantilla. `credentials.h` está excluido del repositorio y no debe
aparecer en capturas, paquetes de distribución ni registros públicos.

### 5.3 Integración MQTT

En **Integrations > MQTT** genere una API key con permisos para leer tráfico de
aplicación y escribir downlinks. Copie la plantilla:

```bash
cp bridge/.env.example bridge/.env
```

Configure valores propios:

```dotenv
TTN_MQTT_HOST=nam1.cloud.thethings.network
TTN_MQTT_PORT=8883
TTN_MQTT_USERNAME=mi-aplicacion@ttn
TTN_MQTT_PASSWORD=NNSXS.REEMPLAZAR_CON_API_KEY
BRIDGE_DATABASE=./data/smartcitynet.db
BRIDGE_HTTP_HOST=127.0.0.1
BRIDGE_HTTP_PORT=8081
LOG_LEVEL=INFO
```

El host cambia según el clúster donde esté registrada la aplicación. No añada
decodificadores de payload obligatorios en TTN: el Bridge decodifica los bytes
recibidos.

## 6. Firmware del vehículo

### 6.1 Compilar y cargar

Desde la raíz del repositorio:

```bash
arduino-cli compile \
  --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
  VehiculoLeshan

arduino-cli upload --port /dev/ttyUSB0 \
  --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
  VehiculoLeshan

arduino-cli monitor --port /dev/ttyUSB0 --config baudrate=115200
```

El sketch usa `const bool usarTTN = true;`. Para probar temporalmente sensores,
luces y motores sin gateway, cambie `true` por `false`; restáurelo antes de
validar la integración completa. Ambos modos necesitan `credentials.h`; en
modo local puede utilizar los valores en cero de `credentials.example.h`.

### 6.2 Comprobaciones de hardware

- La Heltec debe mostrar el intento de JOIN y luego la sesión LoRaWAN activa.
- TTN debe registrar uplinks por `FPort 10`.
- El monitor serie debe mostrar distancias, MPU, movimiento, velocidad y
  evento.
- El OLED debe alternar la conducción con GPS y DHT11. La posición GPS, la
  temperatura ambiente y la humedad se envían a TTN y deben aparecer en Leshan
  y Node-RED.
- El GY-GPS6MV2 trabaja a 9600 baudios: TX del GPS va a GPIO35 y su entrada RX
  queda sin conectar.
- Una pulsación del botón en GPIO33 debe detener y bloquear los motores,
  programar un uplink prioritario y mostrar la alerta en Leshan y Node-RED; una
  segunda pulsación debe liberar el bloqueo sin reanudar el movimiento.
- Con un objeto a menos de 30 cm, el sensor frontal debe impedir únicamente el
  avance y el trasero únicamente la reversa. Los giros sobre el eje y el
  movimiento en sentido contrario deben continuar disponibles.
- Al activar las luces de parqueo, el vehículo debe limitar la velocidad entre
  11 y 39 cm y detenerse a 10 cm o menos en la dirección del objeto.
- Si el MPU6050 está montado verticalmente, deje el vehículo quieto durante el
  segundo inicial de calibración.
- Los Echo de los HC-SR04 requieren adaptación de 5 V a 3,3 V.
- Los motores pueden tener fuente independiente, pero todas las tierras deben
  compartir GND.

GPIO19 recibe el punto medio de un divisor de 330 kΩ / 100 kΩ conectado a tres
celdas Li-ion en serie. El firmware calcula el voltaje del paquete y el
porcentaje por celda; ambos se transmiten para Leshan y Node-RED.

## 7. Instalar los servicios locales

### 7.1 Bridge Python

```bash
cd bridge
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
mkdir -p data
cd ..
```

### 7.2 Java y Leshan

Instale un JDK 17. Los scripts usan `SMARTCITYNET_JAVA_HOME`; por ejemplo:

```bash
export SMARTCITYNET_JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

Ajuste la ruta a su sistema. En el primer inicio los scripts descargan los JAR
de Leshan 2.0.0-M18 en `leshan/.runtime/`.

### 7.3 Node-RED

La instalación es local al proyecto y no necesita `sudo`:

```bash
cd node-red
./install-node-red.sh
cd ..
```

El script instala las versiones fijadas en `package.json`. Los directorios
`.runtime/` y `node_modules/` son artefactos locales y no forman parte del
paquete de distribución.

## 8. Iniciar el sistema

Use una terminal por proceso. Todos los ejemplos suponen el mismo Device ID y
endpoint; esa coincidencia es obligatoria.

### Terminal 1: Bridge

```bash
cd bridge
set -a
. ./.env
set +a
. .venv/bin/activate
smartcitynet-bridge
```

Espere el primer uplink y compruebe:

```bash
curl http://127.0.0.1:8081/health
curl http://127.0.0.1:8081/devices
```

### Terminal 2: servidor Leshan

```bash
cd leshan
SMARTCITYNET_JAVA_HOME=/ruta/al/jdk-17 ./run-server.sh
```

Servicios locales: interfaz HTTP en <http://127.0.0.1:8080> y CoAP/UDP en
`coap://127.0.0.1:5683`.

### Terminal 3: cliente LwM2M virtual

```bash
cd leshan
DEVICE_ID=heltec-labredes \
LESHAN_ENDPOINT=smartcitynet-heltec-labredes \
SMARTCITYNET_JAVA_HOME=/ruta/al/jdk-17 \
./run-virtual-client.sh
```

Verifique que `smartcitynet-heltec-labredes` aparezca en:

```bash
curl http://127.0.0.1:8080/api/clients
```

### Terminal 4: Node-RED

```bash
cd node-red
DEVICE_ID=heltec-labredes \
LESHAN_ENDPOINT=smartcitynet-heltec-labredes \
./run-node-red.sh
```

Abra:

- Dashboard: <http://127.0.0.1:1880/dashboard/vehiculo>
- Editor Node-RED: <http://127.0.0.1:1880>
- Leshan: <http://127.0.0.1:8080>

Los cuatro servicios escuchan en `127.0.0.1`. Deténgalos con `Ctrl+C` en cada
terminal.

## 9. Modelo LwM2M

El modelo se define en [`leshan/models/32769.xml`](leshan/models/32769.xml). El
objeto es de instancia única y aparece junto con el objeto Device `/3/0` en el
mismo endpoint.

| Ruta | Recurso | Op. | Origen |
|---|---|:---:|---|
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

El ID `32769` es provisional para laboratorio; no representa una asignación
oficial de OMNA para un producto interoperable.

## 10. Protocolo y confirmación de comandos

Todos los enteros multibyte usan *big-endian*.

| Dirección | FPort | Tipo | Longitud | Función |
|---|---:|---:|---:|---|
| Uplink | 10 | `0x01` | 15 B | Telemetría administrativa heredada |
| Uplink | 10 | `0x02` | 8 B | ACK de comando |
| Uplink | 10 | `0x03` | 27, 36, 41 o 42 B | Telemetría vehicular; extensiones GPS, DHT11 y porcentaje de batería 3S |
| Downlink | 11 | `0x10` | 7 B | Cambiar intervalo |
| Downlink | 11 | `0x11` | 4 B | Activar/desactivar alerta |
| Downlink | 11 | `0x12` | 5 B | Controlar una luz |

La trama vehicular actual de 42 bytes incluye movimiento, velocidad, distancias,
pitch, roll, temperatura del MPU6050, flags, contador, intervalo, batería,
resultado del último comando, GPS, temperatura ambiente, humedad y porcentaje
calculado por la Heltec para un paquete 3S. El Bridge conserva compatibilidad
con las tramas anteriores de 27, 36 y 41 bytes. Los IDs de
luz son `0=frontal`, `1=trasera`, `2=parqueo`, `3=direccional izquierda` y
`4=direccional derecha`.

Estados de respuesta del firmware:

| Código | Significado |
|---:|---|
| `0` | aplicado |
| `1` | formato inválido |
| `2` | comando no soportado |
| `3` | valor fuera de rango |

### Ciclo de vida

```text
requested → published → ttn_queued → ttn_sent → acknowledged
                                      └────────→ rejected
                         operación sin progreso → timed_out
```

`CHANGED(204)` en Leshan solo indica que el cliente virtual y el Bridge
aceptaron la solicitud. `ttn_sent` indica que TTN transmitió el downlink. El
único estado que confirma el cambio físico es `acknowledged`, generado al
recibir un uplink con el mismo `txId` y estado `applied`.

El Bridge admite una sola operación pendiente por dispositivo. Una segunda
escritura devuelve `409 Conflict` hasta que la anterior termine o venza después
de 180 segundos. Esto evita que `down/replace` sustituya un comando todavía no
confirmado.

Tras aplicar una orden, la Heltec programa un ACK aproximadamente tres segundos
después y envía una segunda copia unos tres segundos más tarde. El Bridge trata
las copias como idempotentes.

### Latencia esperada

El firmware utiliza LoRaWAN Clase A. El dispositivo abre las ventanas de
recepción después de transmitir, así que un comando puede esperar hasta el
siguiente uplink:

```text
espera de downlink: 0–intervalo configurado
ACK rápido:         ~3 s después de aplicar
actualización UI:   0–2 s por consulta del cliente/dashboard
```

Con un intervalo de 30 segundos, la experiencia normal es de varios segundos a
algo más de 30 segundos. No es tiempo real. Para reducir la latencia durante
demostraciones use 15 segundos, o evalúe Clase C cuando el vehículo tenga
alimentación continua y se hayan medido consumo y cobertura.

## 11. Operación y pruebas manuales

### Leer el estado

```bash
curl http://127.0.0.1:8081/devices
curl http://127.0.0.1:8081/operations
curl http://127.0.0.1:8080/api/clients
curl http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0
```

### Cambiar el intervalo desde Leshan

```bash
curl -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/0 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":0,"type":"INTEGER","value":"15"}'
```

### Activar la alerta remota

```bash
curl -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/11 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":11,"type":"BOOLEAN","value":true}'
```

### Controlar luces

Este ejemplo enciende la luz frontal. Use `24` para la trasera, `25` para
parqueo, `32` para la direccional izquierda y `33` para la derecha; envíe
`false` para apagar.

```bash
curl -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/23 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":23,"type":"BOOLEAN","value":true}'
```

Después de cada escritura siga `/operations` hasta `acknowledged` y confirme el
resultado físico. No envíe el siguiente comando mientras haya uno pendiente.

## 12. Pruebas de la versión 1

### Bridge

```bash
cd bridge
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

Las pruebas cubren tramas, validación, persistencia, ACK, control de luces,
serialización de comandos y expiración. Actualmente deben completar 16 casos.

### Firmware

Después de cambiar el protocolo compile ambos sketches:

```bash
arduino-cli compile \
  --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
  VehiculoLeshan

arduino-cli compile \
  --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
  EnvioDatos
```

### Validación integral

1. Inicie los cuatro servicios en el orden documentado.
2. Confirme el JOIN y un uplink en TTN.
3. Compruebe el Device ID en `/devices`.
4. Compruebe el endpoint en `/api/clients`.
5. Valide sensores y luces en el dashboard.
6. Cambie el intervalo a 15 segundos.
7. Espere `acknowledged` y confirme el valor aplicado.
8. Encienda y apague cada luz, esperando confirmación entre órdenes.
9. Active la alerta y confirme que los motores quedan bloqueados.
10. Desactive la alerta y compruebe que el vehículo permanece detenido hasta
    recibir un nuevo comando de movimiento.

## 13. Diagnóstico

### El Bridge no muestra el dispositivo

- Confirme que TTN recibe uplinks en `FPort 10`.
- Revise host, usuario y API key en `bridge/.env`.
- Verifique que la clave tenga permisos de uplink y downlink.
- Compruebe que la red permita MQTT/TLS por el puerto 8883.
- Consulte el registro del Bridge antes de introducir una VPN. Una VPN es una
  solución de red opcional, no un requisito de la arquitectura.

### Node-RED muestra conexión, pero el comando no cambia la Heltec

Compruebe que los identificadores coincidan exactamente:

```text
TTN Device ID:       heltec-labredes
DEVICE_ID:           heltec-labredes
LESHAN_ENDPOINT:     smartcitynet-heltec-labredes
endpoint en Leshan:  smartcitynet-heltec-labredes
```

Después revise `/operations`. `published`, `ttn_queued` y `ttn_sent` son
estados intermedios; solo `acknowledged` confirma la aplicación.

### El comando tarda cerca de 30 segundos

Es el comportamiento esperado de Clase A con intervalo de 30 segundos. El
downlink solo puede entregarse después de un uplink. Configure 15 segundos para
una demostración más ágil y mantenga el ACK rápido habilitado.

### El comando se aplica, pero Leshan tarda en reflejarlo

- Espere el ACK rápido de la Heltec y revise el siguiente uplink en TTN.
- Confirme que el Bridge decodifique el `txId`.
- Compruebe que el cliente virtual siga ejecutándose y consulte cada dos
  segundos.
- No inicie dos clientes virtuales con el mismo endpoint.

### Una escritura devuelve `409 Conflict`

Ya existe una operación pendiente. Espere su ACK o su expiración a los 180
segundos. No fuerce otra orden porque TTN usa `down/replace`.

### Leshan registra `Unable to send event COAPLOG`, `EofException` o
`Tubería rota`

Ese aviso suele corresponder a la conexión SSE de una pestaña web de Leshan que
se cerró o recargó. No implica por sí mismo un fallo CoAP ni LoRaWAN. Cierre las
pestañas antiguas, abra de nuevo <http://127.0.0.1:8080> y confirme por API que
el cliente sigue registrado. Investigue la red solo si además desaparece el
endpoint o fallan las lecturas/escrituras.

### Puerto serie ocupado

Cierre el monitor serie antes de cargar el sketch y confirme el proceso que usa
el puerto:

```bash
lsof /dev/ttyUSB0
```

### La Heltec no completa OTAA

Revise DevEUI, JoinEUI, AppKey, plan regional `US915`, FSB2, antena y cobertura
del gateway. No reutilice el mismo DevEUI en dos placas.

### Dashboard sin datos o con valores antiguos

Compruebe, en orden:

```bash
curl http://127.0.0.1:8081/health
curl http://127.0.0.1:8081/devices
curl http://127.0.0.1:8080/api/clients
curl -I http://127.0.0.1:1880/dashboard/vehiculo
```

La interfaz conserva el último estado almacenado y debe marcarlo como antiguo
si no existen uplinks recientes.

## 14. Seguridad antes de publicar

No incluya en una publicación:

- `EnvioDatos/credentials.h` ni `VehiculoLeshan/credentials.h`;
- `bridge/.env` ni claves TTN;
- `bridge/data/`, bases `.db` o telemetría real;
- `.venv/`, `node_modules/`, `.runtime/` o compilados Java;
- `HELTEC.txt` ni archivos históricos que contengan claves;
- capturas con DevEUI, AppKey, API keys o datos personales.

Inspeccione el paquete que vaya a distribuir y busque claves, identificadores y
contraseñas. Las plantillas deben contener únicamente marcadores ficticios. Si
una credencial ya fue expuesta, eliminar el archivo no es suficiente: rote la
credencial antes de publicar.

Los servicios locales no tienen autenticación ni TLS propio. Mantenga
`BRIDGE_HTTP_HOST`, Leshan y Node-RED en `127.0.0.1`. Para exponerlos en una red,
añada autenticación, HTTPS, reglas de firewall y control de acceso.

## 15. Limitaciones y trabajo futuro

- LoRaWAN Clase A ofrece bajo consumo, no respuesta inmediata garantizada.
- El Object ID `32769` debe reemplazarse por una asignación válida antes de un
  producto interoperable.
- La batería no puede medirse correctamente mientras GPIO1 controle parqueo.
- Las operaciones expiran localmente a los 180 segundos; no implementan todavía
  reintentos automáticos con el mismo `txId`.
- Bridge, Leshan y Node-RED dependen de consultas periódicas; una evolución
  podría usar eventos push sin cambiar la confirmación física.
- Un despliegue real requiere autenticación, cifrado y supervisión de servicios.
- Conviene evaluar Clase C únicamente para vehículos con alimentación continua
  y después de medir consumo y confiabilidad de la red.

## 16. Lista de comprobación para la entrega

- [ ] El repositorio no contiene secretos ni bases de datos locales.
- [ ] Las plantillas `credentials.example.h` y `.env.example` usan marcadores.
- [ ] Ambos sketches Arduino compilan.
- [ ] Las 24 pruebas del Bridge finalizan correctamente.
- [ ] La Heltec realiza JOIN y TTN recibe `FPort 10`.
- [ ] El Bridge muestra el Device ID esperado.
- [ ] El cliente aparece en Leshan con los objetos `/3/0` y `/32769/0`.
- [ ] El dashboard carga en escritorio y móvil sin superposiciones.
- [ ] Intervalo, alerta y las cinco funciones de luz llegan a `acknowledged`.
- [ ] El estado físico coincide con Leshan y Node-RED.
- [ ] README, guía y capturas corresponden a esta versión.

Con estas comprobaciones, la versión 1 queda lista para publicarse como
prototipo reproducible y base de las siguientes iteraciones.
