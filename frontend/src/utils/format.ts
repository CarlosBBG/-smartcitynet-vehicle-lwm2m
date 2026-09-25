const relativeFormatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function formatRelativeTime(value: string | number | Date | null, now = Date.now()): string {
  if (!value) return 'Sin comunicación';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Fecha no disponible';

  const seconds = Math.round((timestamp - now) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return relativeFormatter.format(seconds, 'second');
  if (absolute < 3600)
    return relativeFormatter.format(Math.round(seconds / 60), 'minute');
  if (absolute < 86_400)
    return relativeFormatter.format(Math.round(seconds / 3600), 'hour');
  return relativeFormatter.format(Math.round(seconds / 86_400), 'day');
}

export function formatDateTime(value: string | number | Date | null): string {
  if (!value) return 'Sin datos';
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatBattery(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Sin lectura' : `${value}%`;
}
