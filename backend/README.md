# SmartCityNet V2 Backend

API administrativa construida con NestJS, TypeScript, Prisma y PostgreSQL. Las
fases 1 a 9 incorporan autenticación JWT, roles, usuarios, vehículos,
sincronización de telemetría, eventos en tiempo real y aprovisionamiento
automático de clientes LwM2M. La fase 6 añade operación segura de recursos y
seguimiento de comandos de extremo a extremo; la fase 7 incorpora reglas y
gestión de alertas operativas; la fase 8 valida el funcionamiento simultáneo y
aislado de varios vehículos. En la fase 9, Node-RED deja de ser un requisito:
React consume esta API directamente y el código V1 queda disponible como legado.

## Requisitos

- Node.js 24 LTS;
- PostgreSQL 14 o posterior, o Docker con Compose;
- una copia local de `.env` basada en `.env.example`.

## Base de datos

La opción reproducible recomendada es iniciar PostgreSQL desde la raíz:

```bash
docker compose up -d postgres
```

El usuario y la contraseña de `docker-compose.yml` son valores de desarrollo
local. No reutilice esa configuración en un servidor público.

En el equipo de desarrollo actual también existe una instalación sin
privilegios dentro de `.runtime/postgresql`; se inicia con:

```bash
./backend/start-local-postgres.sh
```

Este runtime no se versiona. En una instalación nueva use Docker o un servidor
PostgreSQL propio.

## Preparación

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
```

Antes del seed configure `ADMIN_INITIAL_EMAIL`, `ADMIN_INITIAL_PASSWORD` y
`ADMIN_INITIAL_NAME`; cambie también `JWT_SECRET` antes de iniciar la API. La
contraseña debe tener al menos 12 caracteres. No se incluyen secretos reales
en el repositorio.

## Ejecución

Antes de iniciar el backend deben estar disponibles PostgreSQL, el Bridge,
Eclipse Leshan y el gestor LwM2M multi-vehículo. El orden recomendado es:

```bash
# Terminal 1: Bridge
cd bridge
set -a && . ./.env && set +a
. .venv/bin/activate
smartcitynet-bridge

# Terminal 2: Leshan
cd leshan
./run-server.sh

# Terminal 3: un único gestor para todos los vehículos
cd leshan
./run-virtual-client-manager.sh
```

El backend consume los endpoints locales configurados en `BRIDGE_URL`,
`LESHAN_URL` y `LWM2M_MANAGER_URL`:

```bash
cd backend
npm run start:dev
```

Desde la raíz también puede ejecutarse `./backend/run-backend.sh`, que
utiliza Node instalado globalmente o un runtime local independiente en
`.runtime/node`. No busca Node.js dentro de `node-red/`.

- API: <http://127.0.0.1:3000/api>
- Swagger de desarrollo: <http://127.0.0.1:3000/api/docs>

El backend escucha en todas las interfaces para permitir pruebas desde la LAN.
`FRONTEND_URL` admite varios orígenes separados por comas, por ejemplo
`http://localhost:5173,http://IP_DEL_PC:5173`; agregue la IP LAN real del
equipo y limite el puerto TCP 3000 a esa red mediante el firewall. Reinicie el
backend después de cambiar `.env`.

## Endpoints disponibles

```text
POST   /api/auth/login
GET    /api/auth/me

GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id
DELETE /api/users/:id

GET    /api/vehicles
POST   /api/vehicles
GET    /api/vehicles/:id
PATCH  /api/vehicles/:id
DELETE /api/vehicles/:id

GET    /api/vehicles/:id/telemetry
GET    /api/vehicles/:id/telemetry/latest

GET    /api/vehicles/:id/operations
GET    /api/operations/:id

GET    /api/vehicles/:id/lwm2m
GET    /api/vehicles/:id/lwm2m/resources
PUT    /api/vehicles/:id/lwm2m/transmission-interval
PUT    /api/vehicles/:id/lwm2m/remote-alert
PUT    /api/vehicles/:id/lwm2m/lights/:light

GET    /api/lwm2m/clients

GET    /api/alerts
PATCH  /api/alerts/:id/acknowledge
```

Los endpoints de escritura de usuarios son exclusivos de `ADMIN`. Un `VIEWER`
puede consultar vehículos, pero no registrarlos, editarlos ni desactivarlos.
El borrado de vehículos es lógico y conserva sus históricos.

Al registrar un vehículo se genera una sola vez:

```text
lwm2mEndpoint = smartcitynet-${deviceId}
```

El `deviceId` no puede cambiarse mediante edición, evitando romper la identidad
entre TTN, Bridge y Leshan. Un vehículo nuevo queda en `PENDING_DISCOVERY`
hasta que el Bridge conozca el mismo `deviceId`.

## Sincronización del Bridge

El backend consulta `BRIDGE_URL/devices` cada
`BRIDGE_SYNC_INTERVAL_MS` milisegundos. Para cada vehículo registrado:

- actualiza DevEUI, última comunicación, contador y estado;
- persiste una muestra solo cuando cambia `uplink_counter`;
- usa `last_seen` como respaldo si el protocolo no entrega contador;
- marca `OFFLINE` al superar `OFFLINE_THRESHOLD_SECONDS`;
- conserva en `rawState` el gemelo completo para no perder campos del protocolo.

Los ACK de comandos pueden actualizar `last_seen`, pero no generan una muestra
duplicada si mantienen el mismo contador. El estado `ONLINE` requiere actividad
reciente en el Bridge y registro confirmado en Leshan. Si hay actividad reciente
pero falta ese registro, el estado es `LWM2M_DISCONNECTED`.

El histórico acepta `from`, `to`, `page` y `limit` (máximo 1000). Ejemplo:

```bash
curl 'http://127.0.0.1:3000/api/vehicles/UUID/telemetry?limit=50&page=1' \
  -H 'Authorization: Bearer TOKEN'
```

Socket.IO está disponible en el namespace `/realtime`. La conexión debe enviar
el JWT en `auth.token` y recibe `vehicle.updated`, `telemetry.received`,
`operation.updated`, `alert.created`, `alert.updated` y `lwm2m.status`. El
conjunto de orígenes permitidos es el indicado en `FRONTEND_URL`.

## Alertas operativas

El backend evalúa las condiciones al sincronizar telemetría y conectividad:

- `LOCAL_PANIC`: crítica mientras el botón de pánico local esté activo;
- `LOW_BATTERY`: advertencia cuando la batería es igual o inferior a
  `LOW_BATTERY_THRESHOLD` (20 % por defecto);
- `VEHICLE_OFFLINE`: advertencia al superar `OFFLINE_THRESHOLD_SECONDS`;
- `LWM2M_DISCONNECTED`: existe actividad en el Bridge, pero no registro en
  Leshan.

Solo se conserva una alerta activa por vehículo y regla. Cuando la condición
desaparece, la alerta se resuelve automáticamente y se notifica por Socket.IO.
Todo usuario autenticado puede consultar; únicamente `ADMIN` puede reconocer
una alerta. El reconocimiento registra usuario y fecha, pero no sustituye la
resolución de la condición física.

## Operación remota segura

El frontend no envía IDs arbitrarios de objetos o recursos. La API traduce las
acciones permitidas a rutas fijas del objeto `/32769/0`: intervalo (0), alerta
remota (11), luces frontal/trasera/parqueo (23–25) y direccionales (32–33).
Solo `ADMIN` puede escribir. Antes de cada orden se verifica que el vehículo
esté habilitado, registrado en Leshan y sin otra operación pendiente.

El backend sincroniza `BRIDGE_URL/operations`, evita duplicados con una clave
estable y conserva estados desde `requested` hasta `acknowledged`, incluidos
rechazos, fallos de TTN y expiraciones. Una respuesta HTTP aceptada no equivale
a aplicación física: únicamente `acknowledged` confirma el cambio en la Heltec.

## Aprovisionamiento LwM2M automático

`VehicleProvisioningService` reconcilia cada
`LWM2M_RECONCILE_INTERVAL_MS` los vehículos de PostgreSQL con el Bridge, el
gestor multi-cliente y Leshan. Un vehículo habilitado y conocido por el Bridge
debe tener exactamente un cliente virtual activo.

- al registrar un vehículo ya descubierto, crea el cliente automáticamente;
- si todavía no existe en el Bridge, permanece en `PENDING_DISCOVERY`;
- al llegar el primer uplink, inicia el cliente sin intervención manual;
- tras reiniciar el gestor, reconstruye las instancias desde PostgreSQL;
- al desactivar o eliminar lógicamente el vehículo, destruye su instancia;
- confirma el registro real en Leshan antes de declarar conexión LwM2M;
- aplica espera de registro y backoff exponencial configurable ante fallos.

No ejecute un proceso Java por vehículo ni cree clientes desde el frontend. El
gestor de `127.0.0.1:8090` es el único proceso Java multi-cliente y NestJS
mantiene el estado deseado.

## Pruebas y calidad

```bash
cd backend
npm run lint
npm test
npm run test:e2e
npm run build
npm audit
```

Las pruebas E2E utilizan la base indicada por `DATABASE_URL`: crean y eliminan
registros de prueba. Ejecútelas únicamente con una base aislada y preparada con
el seed, nunca con datos que deba conservar. Comprueban login, permisos de
`ADMIN`/`VIEWER`, registro de múltiples vehículos e identidades UUID y LwM2M
independientes. Las pruebas unitarias confirman que el aprovisionamiento crea
una instancia por endpoint y que una operación pendiente solo bloquea el
vehículo al que pertenece.
