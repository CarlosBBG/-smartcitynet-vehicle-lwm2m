import { Box, Typography } from '@mui/material';

import { Lwm2mControls } from '../lwm2m/Lwm2mControls';
import type { Lwm2mResource, Telemetry } from '../../types/vehicle';
import type { ActuatorState } from '../../utils/confirmed-actuator-state';
import { formatDateTime } from '../../utils/format';
import './VehicleOverview.css';

interface VehicleOverviewProps {
  telemetry: Telemetry | null | undefined;
  actuators: ActuatorState;
  online: boolean;
  vehicleId: string;
  resources: Lwm2mResource[];
  canManage: boolean;
  registered: boolean;
  pending: boolean;
  onUpdated: () => Promise<void>;
}

const eventLabels: Record<string, string> = {
  local_panic: 'Pánico local', remote_alert: 'Alerta remota', collision: 'Colisión',
  obstacle: 'Obstáculo', rollover: 'Vuelco', right_curve: 'Curva derecha',
  left_curve: 'Curva izquierda', uphill: 'Subida', downhill: 'Bajada',
};

function distance(value: number | null | undefined): string {
  if (value == null) return 'Sin lectura';
  if (value <= 0 || value >= 999) return 'Fuera de rango';
  return `${Math.round(value)} cm`;
}

export function VehicleOverview({ telemetry, actuators, online, vehicleId, resources, canManage, registered, pending, onUpdated }: VehicleOverviewProps) {
  const front = actuators.front_light_on;
  const rear = actuators.rear_light_on;
  const parking = actuators.parking_lights_on;
  const left = actuators.left_indicator_on;
  const right = actuators.right_indicator_on;
  const locked = Boolean(telemetry?.localPanicActive || actuators.remote_alert_active);
  const rawEvents = telemetry?.rawState.events;
  const events = [...new Set([
    ...(telemetry?.localPanicActive ? ['local_panic'] : []),
    ...(actuators.remote_alert_active ? ['remote_alert'] : []),
    ...(Array.isArray(rawEvents) ? rawEvents.filter((value): value is string => typeof value === 'string' && value in eventLabels && (value !== 'remote_alert' || actuators.remote_alert_active === true)) : []),
  ])];

  return (
    <section className="vehicle-overview" aria-label="Vista general del vehículo">
      <div className="vehicle-overview__heading">
        <div>
          <Typography component="h2" className="vehicle-overview__title">Vista superior</Typography>
          <Typography className="vehicle-overview__subline">
            {telemetry ? `Última muestra · ${formatDateTime(telemetry.receivedAt)}` : 'Aún no hay telemetría disponible'}
          </Typography>
        </div>
        <span className={`vehicle-overview__connection ${online ? 'is-online' : ''}`}>
          <span className="vehicle-overview__connection-dot" />{online ? 'En línea' : 'Sin conexión reciente'}
        </span>
      </div>

      <div className="vehicle-overview__layout">
        <div className="vehicle-overview__stage">
          <div className="vehicle-overview__stage-label">FRENTE</div>
          <div className="vehicle-overview__range vehicle-overview__range--front">
            <span>Sensor frontal</span><strong>{distance(telemetry?.frontDistanceCm)}</strong>
          </div>
          <svg viewBox="0 0 280 390" role="img" aria-label={`Vista aérea del vehículo; luces frontales ${front === null ? 'sin lectura' : front ? 'encendidas' : 'apagadas'}, traseras ${rear === null ? 'sin lectura' : rear ? 'encendidas' : 'apagadas'}`}>
            <path className="vehicle-overview__range-arc" d="M62 90 Q140 18 218 90" />
            <path className="vehicle-overview__range-arc" d="M62 300 Q140 372 218 300" />
            <g className="vehicle-overview__car">
              <g className={`vehicle-overview__beam ${front ? 'is-on' : ''}`}>
                <path d="M108 108 L59 54 Q88 42 116 62 Z" />
                <path d="M172 108 L221 54 Q192 42 164 62 Z" />
              </g>
              <g className={`vehicle-overview__beam vehicle-overview__beam--rear ${rear ? 'is-on' : ''}`}>
                <path d="M110 269 L73 333 Q96 343 119 318 Z" />
                <path d="M170 269 L207 333 Q184 343 161 318 Z" />
              </g>
              <g className="vehicle-overview__wheels">
                <rect x="67" y="132" width="20" height="48" rx="7" /><rect x="193" y="132" width="20" height="48" rx="7" />
                <rect x="67" y="219" width="20" height="48" rx="7" /><rect x="193" y="219" width="20" height="48" rx="7" />
              </g>
              <path className={`vehicle-overview__body ${locked ? 'is-locked' : ''}`} d="M112 91 Q140 73 168 91 L188 139 L181 276 Q140 303 99 276 L92 139 Z" />
              <path className="vehicle-overview__glass" d="M111 118 Q140 100 169 118 L177 153 L103 153 Z" />
              <path className="vehicle-overview__glass" d="M103 221 L177 221 L172 264 Q140 279 108 264 Z" />
              <path className="vehicle-overview__roof" d="M104 166 L176 166 L176 207 L104 207 Z" />
              <path className="vehicle-overview__center-line" d="M140 170 V203" />
              <g className={`vehicle-overview__lamps vehicle-overview__lamps--front ${front ? 'is-on' : ''}`}>
                <circle cx="108" cy="107" r="5.5" /><circle cx="172" cy="107" r="5.5" />
              </g>
              <g className={`vehicle-overview__lamps vehicle-overview__lamps--rear ${rear ? 'is-on' : ''}`}>
                <circle cx="111" cy="270" r="5.5" /><circle cx="169" cy="270" r="5.5" />
              </g>
              <g className={`vehicle-overview__lamps vehicle-overview__lamps--indicator ${parking || left ? 'is-on' : ''}`}>
                <circle cx="98" cy="139" r="4" /><circle cx="102" cy="256" r="4" />
              </g>
              <g className={`vehicle-overview__lamps vehicle-overview__lamps--indicator ${parking || right ? 'is-on' : ''}`}>
                <circle cx="182" cy="139" r="4" /><circle cx="178" cy="256" r="4" />
              </g>
            </g>
          </svg>
          <div className="vehicle-overview__range vehicle-overview__range--rear">
            <span>Sensor trasero</span><strong>{distance(telemetry?.rearDistanceCm)}</strong>
          </div>
          <div className="vehicle-overview__stage-label">TRASERA</div>
        </div>
      </div>

      <div className="vehicle-overview__controls">
        <Lwm2mControls
          vehicleId={vehicleId}
          resources={resources}
          canManage={canManage}
          registered={registered}
          pending={pending}
          onUpdated={onUpdated}
          showInterval={false}
          compact
        />
      </div>
      <div className="vehicle-overview__events">
        <span className="vehicle-overview__events-label">Eventos y alertas</span>
        <div>
          {events.length === 0
            ? <span className="vehicle-overview__event is-empty">{telemetry ? 'Sin eventos reportados' : 'Sin lectura'}</span>
            : events.map((event) => <span key={event} className="vehicle-overview__event">{eventLabels[event]}</span>)}
        </div>
      </div>
      {!online && telemetry && (
        <Box className="vehicle-overview__stale" role="note">El vehículo no tiene conexión reciente. Los sensores muestran la última telemetría recibida.</Box>
      )}
    </section>
  );
}
