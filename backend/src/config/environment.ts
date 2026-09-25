const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'] as const;

function parsePositiveInteger(
  values: Record<string, unknown>,
  name: string,
  fallback: number,
): number {
  const value = Number(values[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return value;
}

function parseIntegerInRange(
  values: Record<string, unknown>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(values[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}`);
  }
  return value;
}

function parseUrl(
  values: Record<string, unknown>,
  name: string,
  fallback: string,
): string {
  const rawValue = values[name];
  if (rawValue !== undefined && typeof rawValue !== 'string') {
    throw new Error(`${name} debe ser una cadena`);
  }
  const value = rawValue ?? fallback;
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} debe ser una URL válida`);
  }
  return value;
}

export function validateEnvironment(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED.filter((name) => {
    const value = values[name];
    return typeof value !== 'string' || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`Faltan variables requeridas: ${missing.join(', ')}`);
  }

  if (String(values.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET debe contener al menos 32 caracteres');
  }

  const port = Number(values.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }

  const bridgeUrl = parseUrl(values, 'BRIDGE_URL', 'http://127.0.0.1:8081');
  const leshanUrl = parseUrl(values, 'LESHAN_URL', 'http://127.0.0.1:8080');
  const lwm2mManagerUrl = parseUrl(
    values,
    'LWM2M_MANAGER_URL',
    'http://127.0.0.1:8090',
  );

  return {
    ...values,
    NODE_ENV: values.NODE_ENV ?? 'development',
    PORT: port,
    JWT_EXPIRES_IN: values.JWT_EXPIRES_IN ?? '8h',
    BRIDGE_URL: bridgeUrl,
    LESHAN_URL: leshanUrl,
    LWM2M_MANAGER_URL: lwm2mManagerUrl,
    BRIDGE_SYNC_INTERVAL_MS: parsePositiveInteger(
      values,
      'BRIDGE_SYNC_INTERVAL_MS',
      2000,
    ),
    OFFLINE_THRESHOLD_SECONDS: parsePositiveInteger(
      values,
      'OFFLINE_THRESHOLD_SECONDS',
      120,
    ),
    LOW_BATTERY_THRESHOLD: parseIntegerInRange(
      values,
      'LOW_BATTERY_THRESHOLD',
      20,
      0,
      100,
    ),
    LWM2M_RECONCILE_INTERVAL_MS: parsePositiveInteger(
      values,
      'LWM2M_RECONCILE_INTERVAL_MS',
      5000,
    ),
    LWM2M_REGISTRATION_GRACE_MS: parsePositiveInteger(
      values,
      'LWM2M_REGISTRATION_GRACE_MS',
      15_000,
    ),
    LWM2M_RETRY_BASE_MS: parsePositiveInteger(
      values,
      'LWM2M_RETRY_BASE_MS',
      5000,
    ),
    LWM2M_RETRY_MAX_MS: parsePositiveInteger(
      values,
      'LWM2M_RETRY_MAX_MS',
      60_000,
    ),
  };
}
