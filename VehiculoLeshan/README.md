# Vehículo ADAS administrado desde Leshan

Este sketch integra el prototipo descrito en `TIC - Jessica Bracero_Final.pdf`
con SmartCityNet, TTN y Eclipse Leshan. Incluye control Bluetooth, dos HC-SR04,
MPU6050, DHT11, GPS GY-GPS6MV2, botón de pánico, L298N y detección local de eventos. Añade telemetría
vehicular, el recurso LwM2M **Remote Alert** y el control remoto de luces dentro
del objeto `32769`.

## Organización del código

`VehiculoLeshan.ino` agrupa pines, estado del vehículo, sensores, motores,
Bluetooth y comunicación. `setup()` inicia el hardware; `loop()` actualiza
las tareas y llama a `actualizarLoRa()` cuando TTN está habilitado.

`velocidad` es la solicitada y `velocidadActual` la aplicada, ambas de 0 a 255.
Las distancias están en centímetros, los ángulos en grados y los tiempos en
milisegundos. `luzTrasera` guarda la orden manual; `faseLuzReversa` controla
su parpadeo automático. Los nombres exigidos por Heltec, como
`appTxDutyCycle` y `downLinkDataHandle`, se mantienen.

## Modo LoRaWAN

El sketch está configurado con `const bool usarTTN = true;`. Inicializa la
radio, intenta unirse por OTAA y transmite uplinks por FPort 10; los comandos administrativos
se reciben por FPort 11. Los sensores, motores, luces, buzzer, OLED y control
Bluetooth continúan activos.

Para probar únicamente el vehículo sin radio, cambie temporalmente esta línea:

```cpp
const bool usarTTN = false;
```

El monitor serie USB, a 115200 baudios, muestra cada segundo las distancias,
estado del MPU6050, Pitch, Roll, inclinación, temperatura, movimiento,
velocidad y evento detectado. También acepta los mismos comandos de la tabla de
control Bluetooth. Esto permite probar el vehículo aunque el HC-06 no esté
disponible.

Una alerta remota persistida se ignora temporalmente en memoria para que no
bloquee los motores durante estas pruebas; el valor guardado no se borra.

El archivo `VehiculoLeshan/credentials.h` se necesita para compilar ambos
modos. Si no existe, cópielo desde `credentials.example.h`: para la prueba
local puede dejar sus valores en cero. Para TTN debe configurar las claves
OTAA de la placa. No suba `credentials.h` al repositorio.

Cuando Remote Alert está activo:

- los motores se detienen inmediatamente;
- los comandos Bluetooth de movimiento se ignoran;
- el buzzer suena de forma intermitente;
- el OLED muestra que el vehículo está bloqueado;
- el estado se guarda en NVS y continúa activo después de un reinicio.

Al desactivar la alerta el vehículo queda detenido; hace falta recibir un nuevo
comando Bluetooth para volver a moverse.

> La orden remota viaja por LoRaWAN Clase A y puede tardar uno o varios ciclos.
> No debe utilizarse como parada de emergencia. La protección por obstáculos e
> inclinación se ejecuta localmente porque necesita respuesta inmediata.

## Conexiones

La nueva distribución corresponde al esquema `DistribucionPines`:

| Componente | Señal | GPIO |
|---|---|---:|
| L298N | IN1 | 6 |
| L298N | IN2 | 5 |
| L298N | IN3 | 4 |
| L298N | IN4 | 3 |
| L298N | ENA | 7 |
| L298N | ENB | 2 |
| HC-SR04 frontal | Trigger | 46 |
| HC-SR04 frontal | Echo | 45 |
| HC-SR04 trasero | Trigger | 26 |
| HC-SR04 trasero | Echo | 48 |
| MPU6050 | SDA | 41 |
| MPU6050 | SCL | 42 |
| Buzzer | señal | 47 |
| Luces frontales | señal común | 39 |
| Luces traseras | señal común | 40 |
| Direccional/parqueo izquierdo | señal | 1 |
| Direccional/parqueo derecho | señal | 38 |
| DHT11 | datos | 34 |
| Botón de pánico | entrada a GND | 33 |
| HC-06 | TX del HC-06 → RX Heltec | 20 |
| HC-06 | RX del HC-06 ← TX Heltec | 21 |
| GY-GPS6MV2 | TX del GPS → RX Heltec | 35 |
| GY-GPS6MV2 | RX del GPS | Sin conectar |
| Batería 3S | nodo del divisor 330 kΩ / 100 kΩ | 19 |

GPIO20/21 utilizan UART1 y dejan GPIO43/44 exclusivamente para el monitor USB.
El GPS utiliza UART2 a 9600 baudios únicamente para recepción en GPIO35.
El OLED usa su bus integrado en GPIO17/18; el MPU6050 utiliza un segundo bus
I2C para evitar el conflicto.

La posición GPS y la medición ambiental se muestran en una vista alternada del
OLED. Latitud, longitud, temperatura ambiente, humedad y sus indicadores de
validez también se envían por LoRaWAN para mostrarse en Leshan y Node-RED.
El botón de pánico se conecta entre GPIO33 y GND usando la resistencia pull-up
interna: una pulsación bloquea motores y activa el buzzer; la siguiente lo
libera, pero no reanuda el movimiento anterior. Cada cambio programa un uplink
prioritario para reflejar la alerta en Leshan y Node-RED sin esperar todo el
intervalo normal de telemetría.

GPIO19 recibe el punto medio del divisor 330 kΩ / 100 kΩ conectado al paquete
de tres celdas Li-ion en serie. El firmware promedia 20 lecturas ADC, calcula
el voltaje del paquete y el porcentaje por celda. Ambos valores se publican en
la telemetría y se muestran en Leshan y Node-RED.

## MPU6050 montado verticalmente

Al arrancar, el vehículo debe permanecer quieto y en su posición normal durante
aproximadamente un segundo. El sketch toma esa gravedad como referencia, por lo
que Pitch y Roll comienzan cerca de cero aunque el módulo esté vertical.

El evento de volcamiento usa la inclinación respecto de esa referencia: se
activa al superar 40 grados durante cinco lecturas consecutivas y se rearma al
bajar de 30 grados. El filtro y la histéresis evitan que vibraciones breves
detengan los motores.

### Precauciones eléctricas

- Las entradas del ESP32-S3 son de 3,3 V. Los Echo del HC-SR04 pueden entregar
  5 V: use un divisor resistivo o conversor de nivel antes de GPIO45 y GPIO48.
- Conecte DATA del DHT11 a GPIO34. Si usa el sensor sin placa auxiliar, añada
  una resistencia pull-up de 4,7–10 kΩ entre DATA y 3,3 V.
- Retire los jumpers ENA/ENB del L298N para controlar velocidad por PWM.
- Use una alimentación separada para los motores y una para lógica/sensores.
- Una todas las tierras en una referencia GND común.
- Pruebe inicialmente con las ruedas levantadas del suelo.

## Credenciales y compilación con TTN

Para otro dispositivo TTN:

```bash
cd /ruta/al/repositorio
cp VehiculoLeshan/credentials.example.h VehiculoLeshan/credentials.h
```

Edite `credentials.h` con DevEUI, JoinEUI y AppKey únicos. El sketch usa
solamente este archivo; no toma las credenciales del ejemplo `EnvioDatos`.

```bash
arduino-cli compile \
  --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
  VehiculoLeshan

arduino-cli upload \
  --port /dev/ttyUSB0 \
  --fqbn 'Heltec-esp32:esp32:heltec_wifi_lora_32_V3:LORAWAN_REGION=3,LORAWAN_DEVEUI=0' \
  VehiculoLeshan
```

## Control Bluetooth conservado

| Comando | Acción | Comando | Acción |
|---|---|---|---|
| `F` | avanzar | `W/w` | luz frontal ON/OFF |
| `B` | retroceder | `U/u` | luz trasera ON/OFF |
| `L` | izquierda | `V/v` | bocina ON/OFF |
| `R` | derecha | `X/x` | parqueo ON/OFF |
| `S` | detener | `D` | detener movimiento |
| `I/J/G/H` | movimientos diagonales | `0`–`9`, `q/Q` | velocidad |
| `Z/z` | direccional izquierda ON/OFF | `C/c` | direccional derecha ON/OFF |

Los comandos de intermitentes quedan ordenados como `Z`, `X`, `C`: izquierda,
parqueo y derecha. Activar parqueo apaga las direccionales individuales;
activar una direccional apaga parqueo y la direccional opuesta.

El comportamiento se obtuvo del binario recuperado de la Heltec del TIC:

- el motor izquierdo usa IN1/IN2 y el derecho usa IN3/IN4 con polaridad
  inversa debido al montaje físico;
- `L` y `R` hacen girar ambos motores en sentidos opuestos;
- en `G/I/H/J` ambos motores permanecen activos y la rueda interior trabaja al
  50 % de la velocidad;
- `0`–`9` seleccionan PWM 0, 25, 50, ..., 225 y `q/Q` selecciona 255;
- ENA y ENB utilizan PWM de 1 kHz y 8 bits;
- el movimiento se mantiene hasta recibir `S` o `D`, igual que en el firmware
  recuperado. No existe una parada automática a los 500 ms;
- al retroceder la luz trasera parpadea cada 300 ms. El buzzer queda continuo
  a 10 cm o menos, pulsa cada vez más lento entre 11 y 80 cm y se apaga por
  encima de 80 cm o cuando el sensor reporta fuera de rango;
- las luces de parqueo y las direccionales cambian de fase cada 300 ms; el
  buzzer se trata como el actuador activo HIGH/LOW instalado en el vehículo.

La protección local utiliza ambos HC-SR04. Entre 30 y 99 cm, el vehículo limita
la velocidad a PWM 100 cuando se acerca al objeto. Por debajo de 30 cm, el
sensor delantero bloquea el avance y el trasero bloquea la reversa. El bloqueo
solo afecta la dirección peligrosa: siempre se puede retroceder ante un objeto
delantero, avanzar ante uno trasero o girar sobre el eje hacia ambos lados. El
volcamiento continúa frenando todas las direcciones.

Al activar las luces de parqueo, esos límites se reducen para realizar
maniobras próximas: la velocidad se limita entre 11 y 39 cm y el movimiento se
detiene a 10 cm o menos. El límite reducido se aplica tanto al sensor delantero
como al trasero y únicamente en la dirección hacia el objeto.

Para una primera prueba, levante las ruedas, envíe `3` para limitar el PWM a
75, y pruebe individualmente `F`, `S`, `B`, `S`, `L`, `S`, `R`, `S`. Después
pruebe las diagonales `G`, `I`, `H` y `J`, deteniendo con `S` entre cada una.
Con Remote Alert y TTN habilitados, todos los comandos de movimiento se
rechazan aunque el Bluetooth continúe conectado.

## Telemetría

El uplink usa FPort 10, versión `0x01`, tipo `0x03` y 42 bytes. Incluye:

- movimiento y velocidad;
- distancias frontal y trasera;
- Pitch, Roll y temperatura;
- flags de actuadores y eventos;
- contador y checksum XOR del bloque TIC;
- intervalo administrativo, voltaje de batería y porcentaje calculado para 3S;
- último txId/estado, alerta remota, pánico local y disponibilidad del MPU6050.
- latitud y longitud escaladas a `10^7`, indicador de posición válida y un
  checksum específico para el bloque GPS.
- temperatura ambiente y humedad relativa en décimas, disponibilidad del DHT11
  y un checksum específico para el bloque ambiental.

El Bridge sigue aceptando las tramas vehiculares anteriores de 27, 36 y 41 bytes y
el formato administrativo `0x01`, por lo que distintas revisiones pueden
coexistir en la misma aplicación TTN.

Después de aplicar una escritura administrativa, el firmware sustituye el
temporizador normal y programa el primer ACK aproximadamente tres segundos
después. Envía una segunda copia tres segundos más tarde con el mismo `txId`.
Las repeticiones son idempotentes en el Bridge y reducen la posibilidad de que
una pérdida de uplink deje el actuador aplicado pero sin confirmar en Leshan.

Los bits de actuadores informan por separado el estado solicitado de la luz
frontal, la luz trasera manual, parqueo y las dos direccionales. La señal
automática de reversa mantiene prioridad sobre la luz trasera manual por
seguridad.

## Iniciar el cliente LwM2M del vehículo

Después del primer uplink y de confirmar que el nuevo Device ID aparece en
`http://127.0.0.1:8081/devices`, ejecute un cliente virtual propio:

```bash
cd /ruta/al/repositorio/leshan

DEVICE_ID=heltec-labredes \
LESHAN_ENDPOINT=smartcitynet-heltec-labredes \
./run-virtual-client.sh
```

Sustituya `heltec-labredes` por el Device ID real de TTN.

## Probar la alerta desde Leshan

En la interfaz <http://127.0.0.1:8080>, abra el endpoint del vehículo, objeto
32769, instancia 0, recurso 11 **Remote Alert**.

Activar por API Leshan:

```bash
curl -s -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/11 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":11,"type":"BOOLEAN","value":true}' \
  | python3 -m json.tool
```

Desactivar:

```bash
curl -s -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/11 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":11,"type":"BOOLEAN","value":false}' \
  | python3 -m json.tool
```

También puede probar el Bridge directamente:

```bash
curl -s -X POST \
  http://127.0.0.1:8081/devices/heltec-labredes/alert \
  -H 'Content-Type: application/json' \
  -d '{"value":true}' | python3 -m json.tool
```

Siga la operación hasta `acknowledged`:

```bash
watch -n 2 \
  'curl -s http://127.0.0.1:8081/operations | python3 -m json.tool'
```

La respuesta `CHANGED(204)` de Leshan solo confirma que el Bridge aceptó la
solicitud. La aplicación física queda confirmada cuando el ACK de la Heltec
cambia la operación a `acknowledged` y `/32769/0/11` refleja el valor nuevo.

## Controlar las luces desde Leshan

El objeto `32769`, instancia `0`, expone cinco recursos booleanos RW para las
luces en la misma pestaña **SmartCityNet Vehicle Management v1.0**:

| Recurso | Luz |
|---|---|
| `/32769/0/23` | frontal |
| `/32769/0/24` | trasera manual |
| `/32769/0/25` | parqueo |
| `/32769/0/32` | direccional izquierda |
| `/32769/0/33` | direccional derecha |

La ubicación aparece en el mismo objeto mediante recursos de solo lectura:

| Ruta | Dato GPS |
|---|---|
| `/32769/0/26` | latitud |
| `/32769/0/27` | longitud |
| `/32769/0/28` | posición disponible |

Las mediciones del DHT11 se publican como recursos de solo lectura:

| Ruta | Dato ambiental |
|---|---|
| `/32769/0/29` | temperatura ambiente |
| `/32769/0/30` | humedad relativa |
| `/32769/0/31` | lectura DHT11 disponible |

El estado enclavado del botón físico se publica en `/32769/0/34` como
**Local Panic**, un recurso booleano de solo lectura.

Para encender la luz frontal desde la API de Leshan:

```bash
curl -s -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/23 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":23,"type":"BOOLEAN","value":true}' \
  | python3 -m json.tool
```

Use `false` para apagarla. Cambie el recurso a `24`, `25`, `32` o `33` para la
luz trasera, parqueo, direccional izquierda o direccional derecha. La escritura
necesita que el nodo esté unido a TTN; si la radio está desactivada o no hay
gateway disponible, el comando queda pendiente hasta el siguiente uplink.
