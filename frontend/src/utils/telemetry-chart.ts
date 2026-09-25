import type { Telemetry } from '../types/vehicle';

export interface ChartSample extends Record<string, number | string | null> {
  time: string;
  battery: number | null;
  rssi: number | null;
  snr: number | null;
  speed: number | null;
  temperature: number | null;
  humidity: number | null;
  front: number | null;
  rear: number | null;
}

const timeFormatter = new Intl.DateTimeFormat('es-EC', {
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export function toChartSamples(items: Telemetry[]): ChartSample[] {
  return items.toReversed().map((sample) => ({
    time: timeFormatter.format(new Date(sample.receivedAt)),
    battery: sample.batteryPercent,
    rssi: sample.rssi,
    snr: sample.snr,
    speed: sample.speedPercent,
    temperature: sample.ambientTemperatureC,
    humidity: sample.ambientHumidityPercent,
    front: sample.frontDistanceCm,
    rear: sample.rearDistanceCm,
  }));
}
