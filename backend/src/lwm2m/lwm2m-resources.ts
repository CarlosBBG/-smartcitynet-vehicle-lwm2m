export interface Lwm2mResourceDefinition {
  id: number;
  name: string;
  operations: 'R' | 'RW';
  unit?: string;
}

export const SMARTCITYNET_OBJECT_ID = 32_769;
export const SMARTCITYNET_RESOURCES: Lwm2mResourceDefinition[] = [
  { id: 0, name: 'Intervalo de transmisión', operations: 'RW', unit: 's' },
  { id: 1, name: 'Contador de uplinks', operations: 'R' },
  { id: 2, name: 'Voltaje de batería', operations: 'R', unit: 'mV' },
  { id: 3, name: 'Nivel de batería', operations: 'R', unit: '%' },
  { id: 4, name: 'Estado del último comando', operations: 'R' },
  { id: 5, name: 'Última transacción', operations: 'R' },
  { id: 6, name: 'RSSI', operations: 'R', unit: 'dBm' },
  { id: 7, name: 'SNR', operations: 'R', unit: 'dB' },
  { id: 8, name: 'Última lectura', operations: 'R' },
  { id: 9, name: 'Estado de operación', operations: 'R' },
  { id: 10, name: 'DevEUI', operations: 'R' },
  { id: 11, name: 'Alerta remota', operations: 'RW' },
  { id: 12, name: 'Movimiento', operations: 'R' },
  { id: 13, name: 'Velocidad', operations: 'R', unit: '%' },
  { id: 14, name: 'Distancia frontal', operations: 'R', unit: 'cm' },
  { id: 15, name: 'Distancia trasera', operations: 'R', unit: 'cm' },
  { id: 16, name: 'Pitch', operations: 'R', unit: '°' },
  { id: 17, name: 'Roll', operations: 'R', unit: '°' },
  { id: 18, name: 'Temperatura MPU', operations: 'R', unit: '°C' },
  { id: 19, name: 'Flags de actuadores', operations: 'R' },
  { id: 20, name: 'Flags de eventos', operations: 'R' },
  { id: 21, name: 'Resumen de eventos', operations: 'R' },
  { id: 22, name: 'MPU disponible', operations: 'R' },
  { id: 23, name: 'Luz frontal', operations: 'RW' },
  { id: 24, name: 'Luz trasera', operations: 'RW' },
  { id: 25, name: 'Luces de parqueo', operations: 'RW' },
  { id: 26, name: 'Latitud', operations: 'R' },
  { id: 27, name: 'Longitud', operations: 'R' },
  { id: 28, name: 'GPS disponible', operations: 'R' },
  { id: 29, name: 'Temperatura ambiente', operations: 'R', unit: '°C' },
  { id: 30, name: 'Humedad ambiente', operations: 'R', unit: '%' },
  { id: 31, name: 'DHT disponible', operations: 'R' },
  { id: 32, name: 'Direccional izquierda', operations: 'RW' },
  { id: 33, name: 'Direccional derecha', operations: 'RW' },
  { id: 34, name: 'Pánico local', operations: 'R' },
];
