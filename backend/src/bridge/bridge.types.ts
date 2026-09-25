export interface BridgeHealth {
  status: string;
}

export interface BridgeDeviceState {
  uplink_counter?: number | null;
  transmission_interval_seconds?: number | null;
  battery_mv?: number | null;
  battery_percent?: number | null;
  movement_name?: string | null;
  speed_percent?: number | null;
  front_distance_cm?: number | null;
  rear_distance_cm?: number | null;
  pitch_degrees?: number | null;
  roll_degrees?: number | null;
  temperature_c?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  gps_available?: boolean | null;
  ambient_temperature_c?: number | null;
  ambient_humidity_percent?: number | null;
  dht_available?: boolean | null;
  local_panic_active?: boolean | null;
  remote_alert_active?: boolean | null;
  [key: string]: unknown;
}

export interface BridgeDevice {
  device_id: string;
  endpoint: string;
  dev_eui: string | null;
  last_seen: string;
  rssi: number | null;
  snr: number | null;
  state: BridgeDeviceState;
}

export interface BridgeOperation {
  device_id: string;
  transaction_id: number;
  resource_path: string;
  requested_value: number;
  status: string;
  command_status: number | null;
  created_at: string;
  updated_at: string;
}
