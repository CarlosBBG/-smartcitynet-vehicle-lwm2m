# Frontend SmartCityNet V2

Aplicación React para administrar los vehículos SmartCityNet. La interfaz adapta el
sistema visual del archivo Figma **Dashboard Admin VoT** a los conceptos del
proyecto: vehículos, conectividad LwM2M, telemetría y permisos.

## Requisitos

- Node.js 24 LTS o posterior y npm.
- API NestJS activa en `http://127.0.0.1:3000`.
- Un usuario creado por el seed del backend.
- Node-RED no es necesario; este dashboard lo sustituye en V2.

## Configuración

```bash
cd frontend
cp .env.example .env
npm install
```

Variables opcionales; sin ellas, la API y Socket.IO usan el host con el que se
abrió el frontend y el puerto 3000:

```env
VITE_API_URL=http://IP_DEL_PC:3000/api
VITE_SOCKET_URL=http://IP_DEL_PC:3000
```

No coloque contraseñas, JWT ni credenciales TTN en archivos `VITE_*`: esas
variables forman parte del bundle público. En esta versión de laboratorio el
JWT de sesión se conserva en `localStorage`; nunca se almacena la contraseña.

## Ejecución

```bash
./run-frontend.sh
```

También puede usar `npm run dev`. Abra <http://localhost:5173> o
`http://IP_DEL_PC:5173` desde otro equipo de la misma LAN. Agregue ambos
orígenes usados a `FRONTEND_URL` en `backend/.env`, separados por comas, y
reinicie el backend y Vite tras cambiar la configuración. Permita el puerto
TCP 3000 solo en la red local; no lo exponga a Internet sin TLS y controles
adicionales. El script usa Node.js del sistema o `.runtime/node`, nunca el
runtime instalado dentro de `node-red/`.

## Pantallas actuales

- Login conectado a `/api/auth/login`.
- Dashboard con métricas, clientes registrados en Leshan, mapa GPS y actividad.
- Mapa de los vehículos a página completa, con lista de vehículos y acceso a su detalle.
- Inventario de vehículos con búsqueda, filtros, paginación y estados.
- Alta, edición y activación/desactivación para `ADMIN`; un `VIEWER` solo puede
  consultar.
- Sincronización de consultas mediante eventos Socket.IO y sondeo de respaldo.
- Detalle por vehículo con resumen de sensores, estado del enlace y vista aérea:
  luces y bloqueo remoto cambian al confirmarse el ACK, sin esperar la siguiente
  muestra periódica de telemetría.
- Telemetría con 1 h como vista inicial y filtros de 6 h, 24 h, 7 días o personalizado.
- Mapa individual que muestra la posición solo con coordenadas GPS válidas; si
  faltan, presenta un aviso y no usa 0,0.
- Recursos del objeto LwM2M `/32769/0` y datos del registro en Leshan; la
  lista de recursos puede contraerse en pantallas pequeñas.
- Controles administrativos de intervalo, alerta remota, luces y direccionales,
  siempre con confirmación previa y bloqueo mientras exista una orden pendiente.
- Seguimiento del comando desde la solicitud hasta el ACK físico de la Heltec,
  actualizado mediante `operation.updated` y sondeo de respaldo.
- Centro de alertas con métricas reales, filtros por estado, severidad y tipo,
  línea temporal de incidentes y paginación.
- Notificaciones activas en el encabezado y resumen de incidentes recientes en
  el Dashboard.
- Aviso emergente y sonido breve al recibir una alerta nueva; el mismo ID no
  vuelve a sonar. Algunos navegadores móviles requieren una interacción previa
  con la página para permitir audio automático.
- Reconocimiento de alertas exclusivo de `ADMIN`; un `VIEWER` conserva acceso
  de solo lectura.
- Administración de usuarios exclusiva de `ADMIN`: alta, edición, roles y
  activación/desactivación, con confirmación antes de desactivar una cuenta.
- Actualización inmediata mediante `alert.created`, `alert.updated` y
  `lwm2m.status`, con sondeo de respaldo cada 30 segundos.
- Dashboard multi-vehículo con métricas agregadas, actividad individual y un
  marcador independiente por cada última posición GPS válida.

Con la pestaña visible, el detalle, la última telemetría, el histórico visible,
los recursos LwM2M y las operaciones consultan la API cada 5 segundos como
respaldo de Socket.IO.
La hora relativa (por ejemplo, «hace 10 segundos») avanza cada segundo sin
recargar la página. El backend sincroniza el Bridge cada 2 segundos por
defecto; estos sondeos no hacen que la Heltec transmita cada 5 segundos.

## Calidad

```bash
npm run lint
npm test
npm run build
```

Las pruebas usan Vitest y React Testing Library. Cubren el Login, presentación
de datos del vehículo, permisos de `VIEWER`, controles LwM2M y visualización de
operaciones exitosas o fallidas, actualización de actuadores tras el ACK,
notificaciones sonoras y permisos y presentación de alertas.
La cobertura del mapa comprueba explícitamente dos vehículos y dos posiciones
independientes; las pruebas del menú y de usuarios comprueban que `Mapa` está
disponible y que `Usuarios` solo aparece para `ADMIN`.
