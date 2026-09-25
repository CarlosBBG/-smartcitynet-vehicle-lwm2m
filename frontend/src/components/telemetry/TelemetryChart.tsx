import { Box, Typography } from '@mui/material';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ChartSample } from '../../utils/telemetry-chart';
import { SectionCard } from '../ui/SectionCard';

interface SeriesDefinition {
  key: string;
  label: string;
  color: string;
  unit: string;
}

interface TelemetryChartProps {
  title: string;
  subtitle: string;
  data: ChartSample[];
  series: SeriesDefinition[];
}

export function TelemetryChart({
  title,
  subtitle,
  data,
  series,
}: TelemetryChartProps) {
  return (
    <SectionCard sx={{ p: 2.25, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      <Typography variant="caption" color="text.secondary">
        {subtitle}
      </Typography>
      <Box sx={{ height: 255, mt: 2 }}>
        {data.length === 0 ? (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Sin lecturas en este período.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#e7e9ee" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" minTickGap={36} tick={{ fontSize: 11 }} stroke="#8a909d" />
                <YAxis tick={{ fontSize: 11 }} stroke="#8a909d" />
                <Tooltip
                  cursor={{ stroke: '#9aa5b4', strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 10, borderColor: '#dfe3e9', fontSize: 12 }}
                  formatter={(value, name) => {
                    const definition = series.find((item) => item.key === name);
                    const displayValue = value == null
                      ? 'Sin lectura'
                      : typeof value === 'number' ? value.toLocaleString('es-EC', { maximumFractionDigits: 2 }) : String(value);
                    return [value == null ? displayValue : `${displayValue} ${definition?.unit ?? ''}`.trim(), definition?.label ?? name];
                  }}
                />
                {series.map((item) => (
                  <Line
                    key={item.key}
                    type="linear"
                    dataKey={item.key}
                    name={item.key}
                    stroke={item.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
        {series.map((item) => (
          <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 18, height: 3, borderRadius: 4, bgcolor: item.color }} />
            <Typography variant="caption" color="text.secondary">
              {item.label} ({item.unit})
            </Typography>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
