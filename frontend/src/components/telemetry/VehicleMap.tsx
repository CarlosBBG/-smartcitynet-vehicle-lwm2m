import { Box, Typography } from '@mui/material';
import { MapPinned } from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';

import type { Telemetry, Vehicle } from '../../types/vehicle';

interface VehicleMapProps {
  vehicle: Vehicle;
  telemetry: Telemetry | null | undefined;
}

function hasValidPosition(telemetry: Telemetry | null | undefined): telemetry is Telemetry & {
  latitude: number;
  longitude: number;
} {
  return Boolean(
    telemetry?.gpsAvailable &&
      typeof telemetry.latitude === 'number' &&
      typeof telemetry.longitude === 'number' &&
      !(telemetry.latitude === 0 && telemetry.longitude === 0),
  );
}

export function VehicleMap({ vehicle, telemetry }: VehicleMapProps) {
  if (!hasValidPosition(telemetry)) {
    return (
      <Box sx={{ minHeight: 430, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3, bgcolor: '#f3f8f7' }}>
        <Box>
          <Box sx={{ mx: 'auto', width: 54, height: 54, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: '#e3f8f2', color: 'success.main' }}>
            <MapPinned size={24} />
          </Box>
          <Typography sx={{ mt: 1.5, fontWeight: 600 }}>Posición GPS no disponible</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 420 }}>
            Se mostrará la ubicación cuando el módulo GPS entregue coordenadas válidas. Nunca se utiliza la posición 0,0 como reemplazo.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: { xs: 390, md: 540 }, '& .leaflet-control-attribution': { fontSize: 9 } }}>
      <MapContainer
        center={[telemetry.latitude, telemetry.longitude]}
        zoom={17}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CircleMarker
          center={[telemetry.latitude, telemetry.longitude]}
          radius={10}
          pathOptions={{ color: '#16735f', fillColor: '#2bb89c', fillOpacity: 0.9, weight: 4 }}
        >
          <Popup>
            <strong>{vehicle.name}</strong>
            <br />
            {telemetry.latitude.toFixed(6)}, {telemetry.longitude.toFixed(6)}
          </Popup>
        </CircleMarker>
      </MapContainer>
    </Box>
  );
}
