import { Box, Typography } from '@mui/material';
import { MapPinned } from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';

import type { Telemetry, Vehicle } from '../../types/vehicle';

interface FleetMapProps {
  vehicles: Vehicle[];
  telemetry: Record<string, Telemetry | null>;
  height?: number | string;
}

type LocatedTelemetry = Telemetry & { latitude: number; longitude: number };

function hasCoordinates(sample: Telemetry | null | undefined): sample is LocatedTelemetry {
  return Boolean(
    sample?.gpsAvailable &&
      typeof sample.latitude === 'number' &&
      typeof sample.longitude === 'number',
  );
}

export function FleetMap({ vehicles, telemetry, height = 310 }: FleetMapProps) {
  const located = vehicles.flatMap((vehicle) => {
    const sample = telemetry[vehicle.id];
    return hasCoordinates(sample)
      ? [{ vehicle, sample }]
      : [];
  });

  if (located.length === 0) {
    return (
      <Box sx={{ height, minHeight: 310, display: 'grid', placeItems: 'center', textAlign: 'center', px: 3, bgcolor: '#f5f8f8' }}>
        <Box>
          <Box sx={{ mx: 'auto', width: 50, height: 50, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: '#e3f8f2', color: 'success.main' }}>
            <MapPinned size={22} />
          </Box>
          <Typography sx={{ mt: 1.5, fontWeight: 600 }}>Sin posiciones GPS válidas</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 350 }}>
            El mapa se actualizará cuando un vehículo envíe coordenadas mediante TTN.
          </Typography>
        </Box>
      </Box>
    );
  }

  const first = located[0].sample;
  return (
    <Box sx={{ height, minHeight: 310, '& .leaflet-control-attribution': { fontSize: 9 } }}>
      <MapContainer
        center={[first.latitude, first.longitude]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {located.map(({ vehicle, sample }) => (
          <CircleMarker
            key={vehicle.id}
            center={[sample.latitude, sample.longitude]}
            radius={8}
            pathOptions={{
              color: vehicle.status === 'ONLINE' ? '#16735f' : '#596170',
              fillColor: vehicle.status === 'ONLINE' ? '#2bb89c' : '#8f96a3',
              fillOpacity: 0.86,
              weight: 3,
            }}
          >
            <Popup>
              <strong>{vehicle.name}</strong>
              <br />
              {vehicle.deviceId}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </Box>
  );
}
