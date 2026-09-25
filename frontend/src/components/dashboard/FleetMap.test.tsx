import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { theme } from '../../theme/theme';
import type { Telemetry, Vehicle } from '../../types/vehicle';
import { FleetMap } from './FleetMap';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }: { children: ReactNode }) => (
    <div data-testid="fleet-marker">{children}</div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const baseVehicle: Vehicle = {
  id: 'vehicle-a',
  name: 'Vehículo A',
  deviceId: 'heltec-a',
  devEui: '70B3D57ED000000A',
  lwm2mEndpoint: 'smartcitynet-heltec-a',
  model: 'Heltec WiFi LoRa 32 V3',
  description: null,
  enabled: true,
  status: 'ONLINE',
  lastSeen: '2026-09-22T12:00:00.000Z',
  lastUplinkCounter: 10,
  createdAt: '2026-09-22T11:00:00.000Z',
  updatedAt: '2026-09-22T12:00:00.000Z',
  deletedAt: null,
};

function telemetry(vehicleId: string, latitude: number, longitude: number): Telemetry {
  return {
    id: `sample-${vehicleId}`,
    vehicleId,
    receivedAt: '2026-09-22T12:00:00.000Z',
    uplinkCounter: 10,
    transmissionIntervalSeconds: 30,
    batteryMv: 11_700,
    batteryPercent: 74,
    rssi: -96,
    snr: 7.5,
    movement: 'Detenido',
    speedPercent: 0,
    frontDistanceCm: 120,
    rearDistanceCm: 140,
    pitchDegrees: 0,
    rollDegrees: 0,
    temperatureC: 26,
    latitude,
    longitude,
    gpsAvailable: true,
    ambientTemperatureC: 23,
    ambientHumidityPercent: 50,
    dhtAvailable: true,
    localPanicActive: false,
    remoteAlertActive: false,
    rawState: {},
    createdAt: '2026-09-22T12:00:00.000Z',
  };
}

describe('FleetMap', () => {
  it('muestra un marcador independiente por cada vehículo con GPS válido', () => {
    const secondVehicle: Vehicle = {
      ...baseVehicle,
      id: 'vehicle-b',
      name: 'Vehículo B',
      deviceId: 'heltec-b',
      devEui: '70B3D57ED000000B',
      lwm2mEndpoint: 'smartcitynet-heltec-b',
    };

    render(
      <ThemeProvider theme={theme}>
        <FleetMap
          vehicles={[baseVehicle, secondVehicle]}
          telemetry={{
            [baseVehicle.id]: telemetry(baseVehicle.id, -0.209223, -78.48949),
            [secondVehicle.id]: telemetry(secondVehicle.id, -0.2092555, -78.4894522),
          }}
        />
      </ThemeProvider>,
    );

    expect(screen.getAllByTestId('fleet-marker')).toHaveLength(2);
    expect(screen.getByText('Vehículo A')).toBeInTheDocument();
    expect(screen.getByText('Vehículo B')).toBeInTheDocument();
  });
});
