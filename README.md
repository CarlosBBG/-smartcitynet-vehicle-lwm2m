# SmartCityNet V2 — administración de vehículos LoRaWAN

Prototipo académico para vehículos **Heltec WiFi LoRa 32 V3** conectados a
**The Things Network (TTN)**. La aplicación V2 usa **React**, **NestJS** y
**PostgreSQL** para visualizar los vehículos, GPS, telemetría, alertas y operaciones.
**Eclipse Leshan** conserva la administración LwM2M; el Bridge adapta los
mensajes LoRaWAN y sus ACK. **Node-RED no es necesario para ejecutar V2**.
El dashboard y los flujos de V1 se conservan como referencia histórica en
[`node-red/`](node-red/); su instalación se explica en la
[guía V1](GUIA_COMPLETA.md).

## Arquitectura

```text
Telemetría: Heltec → TTN → Bridge → NestJS/PostgreSQL → React
Comandos:   React → NestJS → Leshan → cliente virtual → Bridge → TTN → Heltec
ACK físico: Heltec → TTN → Bridge → NestJS/PostgreSQL → React
```

La Heltec usa un protocolo binario compacto: uplinks por `FPort 10` y comandos
por `FPort 11`. El cliente virtual representa su *device twin* como el objeto
LwM2M provisional `/32769/0`; no se transporta CoAP directamente sobre
LoRaWAN.

## Funciones de esta versión

- Unión OTAA en `US915 / FSB2` y telemetría vehicular por TTN.
- Control local mediante Bluetooth: movimiento, velocidad, luces y bocina.
- Lectura de dos HC-SR04, MPU6050 y DHT11, con temperatura y humedad visibles
  en Leshan y React.
- Ubicación mediante GY-GPS6MV2, visible en Leshan y el mapa de React.
- Parada enclavada mediante botón de pánico local, reportada a Leshan y al
  dashboard mediante un uplink prioritario.
- Control remoto del intervalo, alerta/bloqueo, luces principales, parqueo y
  direccionales izquierda/derecha.
- Persistencia del *device twin* en SQLite y de vehículos, telemetría,
  operaciones, alertas y usuarios en PostgreSQL.
- Confirmación de extremo a extremo mediante `txId` y ACK de aplicación.
- Objeto `SmartCityNet Vehicle Management v1.0` visible en la misma sesión del
  cliente Leshan.
- Dashboard React multi-vehículo con mapa, histórico, alertas y seguimiento de
  comandos. La respuesta HTTP de escritura no se confunde con el ACK físico.

## Estructura

| Ruta | Contenido |
|---|---|
| `VehiculoLeshan/` | Firmware principal del vehículo y guía de hardware |
| `EnvioDatos/` | Firmware base de telemetría administrativa |
| `bridge/` | Bridge Python, API local, SQLite y pruebas unitarias |
| `leshan/` | Servidor, objeto 32769 y cliente LwM2M virtual Java |
| `node-red/` | Dashboard V1 opcional, conservado como código histórico |
| `backend/` | API V2, PostgreSQL, autenticación, vehículos, telemetría y WebSocket |
| `frontend/` | Aplicación React V2 basada en el sistema visual de Figma |
| `scripts/` | Verificaciones reproducibles de integración del sistema completo |

## SmartCityNet V2 — Fases 1 a 9

La aplicación V2 proporciona:

- autenticación JWT con contraseñas Argon2;
- roles `ADMIN` y `VIEWER`;
- administración de usuarios;
- registro, edición, desactivación y borrado lógico de vehículos;
- endpoint LwM2M estable `smartcitynet-${deviceId}`;
- esquema PostgreSQL para usuarios, vehículos, telemetría, operaciones y alertas;
- migraciones Prisma, seed seguro y documentación Swagger;
- sincronización deduplicada Bridge → PostgreSQL cada dos segundos;
- estado `PENDING_DISCOVERY`, `ONLINE`, `OFFLINE`, `LWM2M_DISCONNECTED` o
  `DISABLED` según actividad y registro real;
- API paginada para histórico y última telemetría;
- eventos Socket.IO autenticados para vehículos y nuevas muestras;
- manager Java multi-vehículo con API local e instancias LwM2M aisladas;
- aprovisionamiento idempotente y cierre limpio de clientes virtuales;
- reconciliación automática PostgreSQL → Bridge → manager → Leshan;
- creación al primer uplink y recuperación después de reinicios;
- lectura y escritura de recursos LwM2M desde NestJS con validación de la
  respuesta de Leshan;
- pruebas unitarias y E2E de permisos y registro de vehículos.
- frontend React con Login, AppShell, Dashboard y administración de vehículos;
- mapa de los vehículos y administración de usuarios en rutas propias, sin pestañas
  pendientes; la vista de usuarios solo aparece para `ADMIN`;
- tema visual derivado del archivo Figma de referencia, con diseño responsive;
- mapa de últimas posiciones, conteo real de clientes Leshan y actualización
  mediante Socket.IO con sondeo de respaldo.
- detalle operativo por vehículo con resumen, gráficas, mapa, recursos LwM2M e
  historial de operaciones;
- controles remotos limitados a rutas conocidas, exclusivos de `ADMIN`, con
  confirmación previa y exclusión de comandos simultáneos;
- sincronización persistente de operaciones del Bridge y evento Socket.IO
  `operation.updated` hasta la confirmación física de la Heltec.
- vista del vehículo que refleja luces y bloqueo remoto al recibir el ACK,
  sin esperar al siguiente uplink periódico de telemetría;
- reglas automáticas para pánico local, batería baja, vehículo fuera de línea y
  pérdida del registro LwM2M;
- bandeja de alertas con filtros, reconocimiento administrativo y resolución
  automática cuando desaparece la condición;
- avisos en el encabezado y notificaciones emergentes con sonido para alertas
  nuevas, mediante Socket.IO y sondeo de respaldo;
- operación simultánea de múltiples vehículos con twins, telemetría, endpoints
  LwM2M, históricos y comandos aislados por identidad;
- verificación integral Bridge → PostgreSQL → manager → Leshan → Dashboard,
  incluidos múltiples marcadores GPS y clientes LwM2M simultáneos.

La fase 9 deja Node-RED como componente opcional de V1. Los scripts de React y
NestJS usan Node.js del sistema o `.runtime/node`, nunca el runtime de Node-RED.
Consulte [`backend/README.md`](backend/README.md) y
[`frontend/README.md`](frontend/README.md) para detalles de instalación.

## Verificación multi-vehículo

Con PostgreSQL, Bridge, Leshan, manager, backend y frontend iniciados, ejecute:

```bash
./scripts/verify-multi-vehicle.sh
```

El script no envía comandos a las placas. Comprueba de forma no destructiva
que al menos dos dispositivos coincidan por `deviceId` y `lwm2mEndpoint` en el
Bridge, PostgreSQL, el manager y Leshan; también exige dos posiciones GPS
válidas para el mapa, históricos, operaciones, recursos LwM2M, alertas, usuarios y un
frontend disponible. Las pruebas automatizadas verifican por separado que una
operación pendiente del vehículo A no bloquee un comando dirigido al vehículo B.

## Inicio rápido de V2

Requisitos: Python 3.10+, Java 17, Node.js 24 LTS con npm, PostgreSQL 14+,
acceso TTN y una Heltec WiFi LoRa 32 V3. Configure las credenciales privadas
del firmware y TTN según las guías de [`VehiculoLeshan/`](VehiculoLeshan/README.md)
y [`bridge/`](bridge/README.md). En una instalación nueva no instale Node-RED.
La verificación multi-vehículo requiere además `curl` y `jq`.

1. Prepare Bridge y API, una sola vez desde la raíz del repositorio:

   ```bash
   cp bridge/.env.example bridge/.env
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   python3 -m venv bridge/.venv
   bridge/.venv/bin/pip install -e ./bridge
   docker compose up -d postgres
   cd backend
   npm install
   npx prisma migrate deploy
   npx prisma generate
   npm run prisma:seed
   cd ../frontend
   npm install
   cd ..
   ```

   Antes del seed, establezca `ADMIN_INITIAL_EMAIL`, `ADMIN_INITIAL_PASSWORD`
   y `JWT_SECRET` en `backend/.env`; cambie los ejemplos. Configure TTN en
   `bridge/.env`. En este equipo de desarrollo puede iniciarse PostgreSQL
   mediante `./backend/start-local-postgres.sh` en lugar de Docker. Si Node.js
   no está instalado globalmente, los scripts de arranque aceptan una copia
   local independiente en `.runtime/node` (directorio no versionado).
   Los scripts de Leshan usan por defecto un JDK local en
   `/home/lcd/.local/share/smartcitynet/jdk-17`; en otro equipo exporte
   `SMARTCITYNET_JAVA_HOME` con la ruta de su JDK 17 antes de iniciarlos.

2. Inicie PostgreSQL y luego los cinco servicios V2. Ejecute **cada línea en
   una terminal distinta**, desde la raíz; no pegue el bloque completo en una
   sola terminal:

   ```bash
   docker compose up -d postgres                 # PostgreSQL
   (cd bridge && set -a && . ./.env && set +a && .venv/bin/smartcitynet-bridge)
   (cd leshan && ./run-server.sh)                # Leshan
   (cd leshan && ./run-virtual-client-manager.sh) # Gestor multi-vehículo
   ./backend/run-backend.sh                      # API NestJS
   ./frontend/run-frontend.sh                    # Dashboard React
   ```

   El backend reconcilia automáticamente los vehículos conocidos por el Bridge
   con el gestor y Leshan: no se crea un cliente virtual a mano por vehículo.

3. Abra <http://localhost:5173> e ingrese con el usuario configurado en el
   seed. API: <http://127.0.0.1:3000/api/docs>; Leshan:
   <http://127.0.0.1:8080>. Si los vehículos aparecen desconectados, revise
   Bridge/TTN y el registro LwM2M; Node-RED no interviene en V2.

## Pruebas

`npm run test:e2e` crea y elimina registros en la base indicada por
`backend/.env`. Use una base de pruebas aislada y con el seed aplicado; no
ejecute esas pruebas contra datos que deba conservar.

```bash
(cd bridge && .venv/bin/python -m unittest discover -s tests -v)
(cd backend && npm test && npm run build)
(cd frontend && npm test && npm run lint && npm run build)
```

Con la base de pruebas aislada y preparada, ejecute aparte
`(cd backend && npm run test:e2e)`.

Con los servicios activos, `./scripts/verify-multi-vehicle.sh` comprueba dos
vehículos, dos posiciones GPS, LwM2M, históricos, operaciones, alertas, usuarios y React
sin enviar downlinks. Las pruebas automatizadas validan controles y permisos;
para afirmar que una orden llegó físicamente a una Heltec real, compruebe su
ACK de aplicación. La [guía V1](GUIA_COMPLETA.md#12-pruebas-de-la-versión-1)
conserva las pruebas del firmware y protocolo.

## Seguridad y alcance

No publique `credentials.h`, `bridge/.env`, `backend/.env`, bases SQLite,
entornos virtuales ni archivos de ejecución local. Bridge, Leshan y el gestor
escuchan localmente y no deben exponerse a Internet; la API V2 usa JWT y roles.
La contraseña de PostgreSQL en `docker-compose.yml` es solo para desarrollo
local; cámbiela antes de cualquier despliegue fuera de este entorno.
El Object ID `32769` es provisional para laboratorio.
LoRaWAN Clase A tiene latencia variable: los comandos remotos no sustituyen las
protecciones locales ni deben utilizarse como parada de emergencia.

## Documentación adicional

- [Guía histórica de V1](GUIA_COMPLETA.md)
- [Firmware y conexiones del vehículo](VehiculoLeshan/README.md)
- [Bridge MQTT/HTTP](bridge/README.md)
- [Integración con Leshan](leshan/README.md)
- [Dashboard Node-RED V1 opcional](node-red/README.md)
