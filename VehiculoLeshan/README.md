# Vehículo ADAS administrado desde Leshan

Este sketch integra el prototipo descrito en `TIC - Jessica Bracero_Final.pdf`
con SmartCityNet, TTN y Eclipse Leshan. Conserva el control Bluetooth, los dos
HC-SR04, el MPU6050, el L298N y la detección local de eventos. Añade telemetría
vehicular, el recurso LwM2M **Remote Alert** y el control remoto de luces dentro
del objeto `32769`.

## Modo LoRaWAN

El sketch está configurado con `HABILITAR_TTN=1`. Inicializa la radio, intenta
unirse por OTAA y transmite uplinks por FPort 10; los comandos administrativos
se reciben por FPort 11. Los sensores, motores, luces, buzzer, OLED y control
Bluetooth continúan activos.

Para probar únicamente el vehículo sin radio, cambie temporalmente esta línea:

```cpp
#define HABILITAR_TTN 0
```

El monitor serie USB, a 115200 baudios, muestra cada segundo las distancias,
estado del MPU6050, Pitch, Roll, inclinación, temperatura, movimiento,
velocidad y evento detectado. También acepta los mismos comandos de la tabla de
control Bluetooth. Esto permite probar el vehículo aunque el HC-06 no esté
disponible.

Una alerta remota persistida se ignora temporalmente en memoria para que no
bloquee los motores durante estas pruebas; el valor guardado no se borra.

Con `HABILITAR_TTN=1` se necesita `credentials.h` con las claves OTAA de la
placa. No suba ese archivo al repositorio.

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

Los pines siguientes fueron corroborados directamente en el firmware original
del vehículo:

| Componente | Señal | GPIO |
|---|---|---:|
| L298N | IN1 | 6 |
| L298N | IN2 | 5 |
| L298N | IN3 | 4 |
| L298N | IN4 | 3 |
| L298N | ENA | 7 |
| L298N | ENB | 2 |
| HC-SR04 frontal | Trigger | 39 |
| HC-SR04 frontal | Echo | 40 |
| HC-SR04 trasero | Trigger | 47 |
| HC-SR04 trasero | Echo | 48 |
| MPU6050 | SDA | 41 |
| MPU6050 | SCL | 42 |
| Buzzer | señal | 34 |
| Luz frontal | señal | 45 |
| Luz trasera | señal | 46 |
| Luz de parqueo | señal | 1 |
| HC-06 | TX del HC-06 → RX Heltec | 19 |
| HC-06 | RX del HC-06 ← TX Heltec | 20 |

GPIO19/20 utilizan UART1 y dejan GPIO43/44 exclusivamente para el monitor USB.
El OLED usa su bus integrado en GPIO17/18; el MPU6050 utiliza un segundo bus
I2C para evitar el conflicto.

GPIO2–GPIO7 controlan el L298N y no corresponden a un RC522. GPIO19/20
corresponden al HC-06 del montaje original, no a un tercer HC-SR04. El firmware
original utiliza solamente los sensores ultrasónicos frontal y trasero.

GPIO1 también es la entrada ADC de batería de la Heltec V3. Como la PCB del TIC
lo utiliza para la luz de parqueo, el sketch no intenta medir la batería y
reporta `0 mV` en ese campo para evitar lecturas falsas y conflictos eléctricos.

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
  5 V: use un divisor resistivo o conversor de nivel antes de GPIO40 y GPIO48.
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

Edite `credentials.h` con DevEUI, JoinEUI y AppKey únicos. Si no existe ese
archivo, el sketch usa temporalmente `../EnvioDatos/credentials.h` para permitir
la compilación, pero no debe cargarlo en una segunda placa con el mismo DevEUI.

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
- las luces de parqueo cambian de fase cada 300 ms y el buzzer se trata como el
  actuador activo HIGH/LOW instalado en el vehículo.

La protección local también coincide con el TIC: una colisión frontal o un
volcamiento reduce el PWM en pasos de 20 cada 40 ms hasta detenerse; un
obstáculo frontal de 30 a 99 cm limita el avance recto a PWM 100. El HC-SR04
trasero se usa para el aviso sonoro y no impide la reversa.

Para una primera prueba, levante las ruedas, envíe `3` para limitar el PWM a
75, y pruebe individualmente `F`, `S`, `B`, `S`, `L`, `S`, `R`, `S`. Después
pruebe las diagonales `G`, `I`, `H` y `J`, deteniendo con `S` entre cada una.
Con Remote Alert y TTN habilitados, todos los comandos de movimiento se
rechazan aunque el Bluetooth continúe conectado.

## Telemetría

El uplink usa FPort 10, versión `0x01`, tipo `0x03` y 27 bytes. Incluye:

- movimiento y velocidad;
- distancias frontal y trasera;
- Pitch, Roll y temperatura;
- flags de actuadores y eventos;
- contador y checksum XOR del bloque TIC;
- intervalo administrativo y batería;
- último txId/estado, alerta remota y disponibilidad del MPU6050.

El Bridge sigue aceptando el formato anterior `0x01`, por lo que el Heltec de
laboratorio y el vehículo pueden coexistir en la misma aplicación TTN.

Después de aplicar una escritura administrativa, el firmware sustituye el
temporizador normal y programa el primer ACK aproximadamente tres segundos
después. Envía una segunda copia tres segundos más tarde con el mismo `txId`.
Las repeticiones son idempotentes en el Bridge y reducen la posibilidad de que
una pérdida de uplink deje el actuador aplicado pero sin confirmar en Leshan.

Los bits de actuadores informan por separado el estado solicitado de la luz
frontal, la luz trasera manual y las luces de parqueo. La señal automática de
reversa mantiene prioridad sobre la luz trasera manual por seguridad.

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

El objeto `32769`, instancia `0`, expone tres recursos booleanos RW para las
luces en la misma pestaña **SmartCityNet Vehicle Management v1.0**:

| Recurso | Luz |
|---|---|
| `/32769/0/23` | frontal |
| `/32769/0/24` | trasera manual |
| `/32769/0/25` | parqueo |

Para encender la luz frontal desde la API de Leshan:

```bash
curl -s -X PUT \
  http://127.0.0.1:8080/api/clients/smartcitynet-heltec-labredes/32769/0/23 \
  -H 'Content-Type: application/json' \
  -d '{"kind":"singleResource","id":23,"type":"BOOLEAN","value":true}' \
  | python3 -m json.tool
```

Use `false` para apagarla o cambie el último identificador de recurso a `24` o
`25` para controlar la luz trasera o las luces de parqueo. La escritura necesita
que el nodo esté unido a TTN; si la radio está desactivada o no hay gateway
disponible, el comando queda pendiente hasta el siguiente uplink.
