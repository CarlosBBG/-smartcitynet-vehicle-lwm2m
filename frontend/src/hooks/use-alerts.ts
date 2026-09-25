import { useQuery } from '@tanstack/react-query';

import { getAlerts } from '../services/alerts.service';
import type { AlertsQuery } from '../types/alert';

export const alertKeys = {
  all: ['alerts'] as const,
  list: (query: AlertsQuery) => ['alerts', query] as const,
};

export function useAlerts(query: AlertsQuery = {}) {
  return useQuery({
    queryKey: alertKeys.list(query),
    queryFn: () => getAlerts(query),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
}
