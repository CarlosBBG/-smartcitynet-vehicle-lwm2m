#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repository_dir=$(cd "$script_dir/.." && pwd)
backend_env="$repository_dir/backend/.env"

if [[ ! -f "$backend_env" ]]; then
  echo "Falta backend/.env. Créelo a partir de backend/.env.example." >&2
  exit 1
fi

for command_name in curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Falta el comando requerido: $command_name" >&2
    exit 1
  fi
done

env_value() {
  local key=$1
  sed -n "s/^${key}=//p" "$backend_env" | tail -n 1
}

admin_email=${SMARTCITYNET_ADMIN_EMAIL:-$(env_value ADMIN_INITIAL_EMAIL)}
admin_password=${SMARTCITYNET_ADMIN_PASSWORD:-$(env_value ADMIN_INITIAL_PASSWORD)}
backend_port=${PORT:-$(env_value PORT)}
backend_url=${BACKEND_URL:-http://127.0.0.1:${backend_port:-3000}/api}
bridge_url=${BRIDGE_URL:-$(env_value BRIDGE_URL)}
leshan_url=${LESHAN_URL:-$(env_value LESHAN_URL)}
manager_url=${LWM2M_MANAGER_URL:-$(env_value LWM2M_MANAGER_URL)}
frontend_url=${FRONTEND_URL:-$(env_value FRONTEND_URL)}
bridge_url=${bridge_url:-http://127.0.0.1:8081}
leshan_url=${leshan_url:-http://127.0.0.1:8080}
manager_url=${manager_url:-http://127.0.0.1:8090}
frontend_url=${frontend_url:-http://localhost:5173}

request_json() {
  curl --fail --silent --show-error --max-time 15 "$@"
}

login_body=$(jq -n \
  --arg email "$admin_email" \
  --arg password "$admin_password" \
  '{email: $email, password: $password}')
access_token=$(request_json \
  -X POST "$backend_url/auth/login" \
  -H 'Content-Type: application/json' \
  --data "$login_body" | jq -er '.accessToken')

bridge_devices=$(request_json "$bridge_url/devices")
manager_clients=$(request_json "$manager_url/clients")
leshan_clients=$(request_json "$leshan_url/api/clients")
vehicles=$(request_json \
  "$backend_url/vehicles" \
  -H "Authorization: Bearer $access_token")

matched=0
located=0
printf '%-24s %-38s %-10s %-12s %-10s %-9s\n' \
  'DEVICE ID' 'ENDPOINT LwM2M' 'POSTGRES' 'MANAGER' 'LESHAN' 'GPS'
printf '%-24s %-38s %-10s %-12s %-10s %-9s\n' \
  '------------------------' '--------------------------------------' '----------' '------------' '----------' '---------'

while IFS= read -r device_id; do
  vehicle=$(jq -cer --arg id "$device_id" '.[] | select(.deviceId == $id)' <<<"$vehicles" || true)
  [[ -n "$vehicle" ]] || continue

  endpoint=$(jq -r '.lwm2mEndpoint' <<<"$vehicle")
  vehicle_uuid=$(jq -r '.id' <<<"$vehicle")
  bridge_endpoint=$(jq -r --arg id "$device_id" \
    '.[] | select(.device_id == $id) | .endpoint' <<<"$bridge_devices")
  manager_ok=$(jq -r --arg endpoint "$endpoint" \
    '[.[] | select(.endpoint == $endpoint and .state == "RUNNING" and .registered == true)] | length == 1' \
    <<<"$manager_clients")
  leshan_ok=$(jq -r --arg endpoint "$endpoint" \
    '[.[] | select(.endpoint == $endpoint)] | length == 1' <<<"$leshan_clients")
  latest=$(request_json \
    "$backend_url/vehicles/$vehicle_uuid/telemetry/latest" \
    -H "Authorization: Bearer $access_token")
  telemetry_history=$(request_json \
    "$backend_url/vehicles/$vehicle_uuid/telemetry?limit=1&page=1" \
    -H "Authorization: Bearer $access_token")
  operations=$(request_json \
    "$backend_url/vehicles/$vehicle_uuid/operations" \
    -H "Authorization: Bearer $access_token")
  lwm2m_details=$(request_json \
    "$backend_url/vehicles/$vehicle_uuid/lwm2m" \
    -H "Authorization: Bearer $access_token")
  if ! jq -e '.items | type == "array"' <<<"$telemetry_history" >/dev/null ||
     ! jq -e 'type == "array"' <<<"$operations" >/dev/null ||
     ! jq -e --arg endpoint "$endpoint" \
       '.registered == true and .endpoint == $endpoint and (.resources | type == "array")' \
       <<<"$lwm2m_details" >/dev/null; then
    echo "La API V2 no devuelve histórico, operaciones o recursos LwM2M válidos para $device_id." >&2
    exit 1
  fi
  gps_ok=$(jq -r \
    '.gpsAvailable == true and (.latitude | type) == "number" and (.longitude | type) == "number"' \
    <<<"$latest")

  if [[ "$bridge_endpoint" != "$endpoint" || "$manager_ok" != true || "$leshan_ok" != true ]]; then
    echo "La identidad de $device_id no coincide en todas las capas." >&2
    exit 1
  fi

  ((matched += 1))
  [[ "$gps_ok" == true ]] && ((located += 1))
  printf '%-24s %-38s %-10s %-12s %-10s %-9s\n' \
    "$device_id" "$endpoint" 'sí' 'RUNNING' 'registrado' "$gps_ok"
done < <(jq -r '.[].device_id' <<<"$bridge_devices")

alerts=$(request_json \
  "$backend_url/alerts?limit=5&page=1" \
  -H "Authorization: Bearer $access_token")
users=$(request_json \
  "$backend_url/users" \
  -H "Authorization: Bearer $access_token")
if ! jq -e '(.items | type == "array") and (.summary.active | type == "number")' \
  <<<"$alerts" >/dev/null; then
  echo "La API V2 no devuelve la bandeja de alertas esperada." >&2
  exit 1
fi
if ! jq -e 'type == "array" and any(.[]; .role == "ADMIN" and .enabled == true)' \
  <<<"$users" >/dev/null; then
  echo "La API V2 no devuelve usuarios ni una cuenta administradora activa." >&2
  exit 1
fi

if (( matched < 2 )); then
  echo "Se esperaban al menos dos vehículos presentes en todas las capas; encontrados: $matched." >&2
  exit 1
fi
if (( located < 2 )); then
  echo "Se esperaban al menos dos posiciones GPS válidas para el mapa; encontradas: $located." >&2
  exit 1
fi

frontend_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-time 15 "$frontend_url")
if [[ "$frontend_status" != 200 ]]; then
  echo "El frontend respondió HTTP $frontend_status en $frontend_url." >&2
  exit 1
fi

echo
echo "Verificación multi-vehículo superada: $matched vehículos y $located posiciones GPS."
echo "Frontend disponible en $frontend_url."
echo "Históricos, operaciones, recursos LwM2M, alertas y usuarios disponibles sin Node-RED."
