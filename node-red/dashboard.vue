<template>
  <main class="dash">
    <div class="dashboard-shell">
    <header class="masthead">
      <div class="identity">
        <div>
          <h1>Vehículo Heltec</h1>
          <p class="endpoint">{{ device?.endpoint || 'Esperando registro LwM2M' }}</p>
        </div>
      </div>
      <div :class="['connection', online ? 'online' : 'offline']" role="status">
        <span class="status-light" aria-hidden="true"></span>
        <div>
          <strong>{{ online ? 'Conectado' : 'Sin datos recientes' }}</strong>
          <small>{{ dataAgeText }}</small>
        </div>
      </div>
    </header>

    <div v-if="device && !online" class="notice warning" role="status">
      Se muestra el último estado almacenado. Las mediciones pueden haber cambiado desde {{ lastSeen }}.
    </div>
    <div v-else-if="!device" class="notice" role="status">
      Esperando datos del Bridge. Comprueba que DEVICE_ID coincida con el vehículo.
    </div>

    <section v-if="panicActive" class="panic-alert" role="alert" aria-live="assertive">
      <span class="panic-mark" aria-hidden="true">!</span>
      <div>
        <strong>Botón de pánico activado</strong>
        <p>El vehículo está detenido y los motores permanecen bloqueados.</p>
      </div>
      <span class="panic-time">Recibido {{ dataAgeText.toLowerCase() }}</span>
    </section>

    <div class="overview-layout">
    <section class="cockpit" aria-label="Estado visual del vehículo">
      <div class="instrument-stack left-stack">
        <article class="instrument battery-instrument">
          <div class="radial-gauge" :style="{ '--battery': `${batteryPercent * 3.6}deg` }">
            <div>
              <strong>{{ batteryAvailable ? batteryPercent : '—' }}</strong>
              <small>{{ batteryAvailable ? '%' : '' }}</small>
            </div>
          </div>
          <div class="instrument-copy">
            <span class="metric-label">Energía</span>
            <strong>{{ batteryAvailable ? `${batteryVoltage} V` : 'Sin lectura' }}</strong>
            <small v-if="batteryAvailable">Paquete 3S · {{ batteryPercent }} %</small>
          </div>
        </article>

        <article class="instrument signal-instrument">
          <div class="signal-bars" aria-hidden="true">
            <span v-for="bar in 4" :key="bar" :class="{ active: bar <= signalBars }"></span>
          </div>
          <div class="instrument-copy">
            <span class="metric-label">Enlace LoRaWAN</span>
            <strong>{{ device?.rssi != null ? `${device.rssi} dBm` : 'Sin datos' }}</strong>
            <small>{{ signalQuality }} · SNR {{ formatNumber(device?.snr, 2) }} dB</small>
          </div>
        </article>
      </div>

      <figure class="vehicle-map">
        <div class="map-heading">
          <span>Vista superior</span>
          <span>{{ activeLightCount }} {{ activeLightCount === 1 ? 'función de luz activa' : 'funciones de luz activas' }}</span>
        </div>

        <svg class="vehicle-svg" viewBox="0 0 280 390" role="img" aria-label="Vista superior y sensores del vehículo">
          <g class="range-zone front-zone">
            <path d="M70 100 Q140 35 210 100" />
            <path d="M89 116 Q140 68 191 116" />
            <text x="140" y="58" text-anchor="middle">{{ formatDistance(state.front_distance_cm) }}</text>
          </g>
          <g class="range-zone rear-zone">
            <path d="M70 290 Q140 355 210 290" />
            <path d="M89 274 Q140 322 191 274" />
            <text x="140" y="354" text-anchor="middle">{{ formatDistance(state.rear_distance_cm) }}</text>
          </g>

          <g class="wheels">
            <rect x="68" y="132" width="18" height="48" rx="7" />
            <rect x="194" y="132" width="18" height="48" rx="7" />
            <rect x="68" y="220" width="18" height="48" rx="7" />
            <rect x="194" y="220" width="18" height="48" rx="7" />
          </g>
          <g :class="['car-shell', vehicleLocked ? 'locked' : 'ready']">
            <g :class="['light-group', 'front-lighting', { active: frontLightOn }]">
              <path class="light-beam" d="M106 108 L68 59 Q88 46 113 58 Z" />
              <path class="light-beam" d="M174 108 L212 59 Q192 46 167 58 Z" />
            </g>
            <g :class="['light-group', 'rear-lighting', { active: rearLightOn }]">
              <path class="light-beam" d="M110 266 L76 326 Q92 338 116 324 Z" />
              <path class="light-beam" d="M170 266 L204 326 Q188 338 164 324 Z" />
            </g>
            <path class="body" d="M112 91 Q140 75 168 91 L188 139 L181 276 Q140 302 99 276 L92 139 Z" />
            <path class="glass front-glass" d="M111 119 Q140 101 169 119 L177 153 L103 153 Z" />
            <path class="glass rear-glass" d="M103 221 L177 221 L172 264 Q140 280 108 264 Z" />
            <path class="roof" d="M105 166 L175 166 L177 208 L103 208 Z" />
            <path class="center-line" d="M140 169 L140 205" />
            <g :class="['light-group', 'front-lighting', { active: frontLightOn }]">
              <circle class="vehicle-light" cx="108" cy="107" r="5" />
              <circle class="vehicle-light" cx="172" cy="107" r="5" />
            </g>
            <g :class="['light-group', 'rear-lighting', { active: rearLightOn }]">
              <circle class="vehicle-light" cx="111" cy="269" r="5" />
              <circle class="vehicle-light" cx="169" cy="269" r="5" />
            </g>
            <g :class="['light-group', 'indicator-lighting', 'left-indicator', { active: parkingLightsOn || leftIndicatorOn }]">
              <circle class="vehicle-light" cx="98" cy="139" r="3.5" />
              <circle class="vehicle-light" cx="102" cy="257" r="3.5" />
            </g>
            <g :class="['light-group', 'indicator-lighting', 'right-indicator', { active: parkingLightsOn || rightIndicatorOn }]">
              <circle class="vehicle-light" cx="182" cy="139" r="3.5" />
              <circle class="vehicle-light" cx="178" cy="257" r="3.5" />
            </g>
          </g>
        </svg>

        <div class="light-controls" role="group" aria-label="Control remoto de luces">
          <button v-for="light in lights" :key="light.id" type="button"
            :class="['light-control', `light-${light.id}`, { active: light.active }]"
            :aria-pressed="light.active"
            :disabled="controlsLocked || !device"
            @click="requestLight(light.id, !light.active)">
            <span class="light-dot" aria-hidden="true"></span>
            <span class="light-copy">
              <strong>{{ light.label }}</strong>
              <small>{{ busy && requestedAction === `light-${light.id}` ? 'Enviando…' : (light.active ? 'Encendida' : 'Apagada') }}</small>
            </span>
            <span class="light-action">{{ light.active ? 'Apagar' : 'Encender' }}</span>
          </button>
        </div>
        <div v-if="feedback.text && feedback.action?.startsWith('light-')"
          :class="['light-feedback', feedback.ok ? 'success' : 'error']" role="status">
          {{ feedback.text }}
        </div>
      </figure>

      <div class="instrument-stack right-stack">
        <article class="instrument motion-instrument">
          <div :class="['motion-pad', movementKey]" aria-hidden="true">
            <span class="dir nw">↖</span><span class="dir n">↑</span><span class="dir ne">↗</span>
            <span class="dir w">←</span><span class="dir center">•</span><span class="dir e">→</span>
            <span class="dir sw">↙</span><span class="dir s">↓</span><span class="dir se">↘</span>
          </div>
          <div class="instrument-copy">
            <span class="metric-label">Movimiento</span>
            <strong>{{ movementLabel }}</strong>
            <small>Velocidad {{ stateValue('speed_percent', '—') }} %</small>
          </div>
        </article>

        <article :class="['instrument', 'lock-instrument', vehicleLocked ? 'danger' : 'safe']">
          <span class="lock-symbol" aria-hidden="true">{{ vehicleLocked ? '×' : '✓' }}</span>
          <div class="instrument-copy">
            <span class="metric-label">Seguridad</span>
            <strong>{{ panicActive ? 'Pánico local' : (alertActive ? 'Bloqueo remoto' : 'Libre') }}</strong>
            <small>Motores {{ vehicleLocked ? 'bloqueados' : 'habilitados' }}</small>
          </div>
        </article>
      </div>
    </section>

    <section class="workspace" aria-label="Lecturas del vehículo">
      <article class="module">
        <div class="module-heading">
          <div>
            <h2>Sensores</h2>
          </div>
          <span :class="['tag', mpuAvailable ? 'ok' : 'warn']">
            MPU {{ mpuAvailable ? 'disponible' : 'sin lectura' }}
          </span>
        </div>

        <section :class="['environment-panel', { unavailable: !dhtAvailable }]" aria-label="Medición ambiental DHT11">
          <div class="environment-header">
            <strong>Ambiente</strong>
            <span>DHT11 · {{ dhtAvailable ? 'lectura válida' : 'sin lectura' }}</span>
          </div>
          <div class="environment-readings">
            <div class="environment-reading temperature-reading">
              <span class="environment-label">Temperatura</span>
              <strong>{{ formatEnvironment(ambientTemperature) }}<small>{{ dhtAvailable ? '°C' : '' }}</small></strong>
              <div class="environment-scale" aria-hidden="true">
                <span :style="{ width: `${temperatureScale}%` }"></span>
              </div>
            </div>
            <div class="environment-reading humidity-reading">
              <span class="environment-label">Humedad</span>
              <strong>{{ formatEnvironment(ambientHumidity) }}<small>{{ dhtAvailable ? '%' : '' }}</small></strong>
              <div class="environment-scale" aria-hidden="true">
                <span :style="{ width: `${humidityScale}%` }"></span>
              </div>
            </div>
          </div>
          <p v-if="!dhtAvailable">Comprueba la conexión del DHT11 en GPIO33.</p>
        </section>

        <div class="data-list">
          <div><span>Distancia frontal</span><strong>{{ formatDistance(state.front_distance_cm) }}</strong></div>
          <div><span>Distancia trasera</span><strong>{{ formatDistance(state.rear_distance_cm) }}</strong></div>
          <div><span>Pitch</span><strong>{{ formatMpu(state.pitch_degrees, '°') }}</strong></div>
          <div><span>Roll</span><strong>{{ formatMpu(state.roll_degrees, '°') }}</strong></div>
          <div><span>Temperatura MPU6050</span><strong>{{ formatMpu(state.temperature_c, ' °C') }}</strong></div>
        </div>

        <p v-if="device && !mpuAvailable" class="inline-warning">
          Los valores del MPU se ocultan porque no existe una lectura válida.
        </p>
      </article>

      <article class="module status-module">
        <div class="module-heading">
          <div>
            <h2>Estado</h2>
          </div>
          <span :class="['tag', eventSeverity]">{{ eventSummary }}</span>
        </div>

        <div v-if="events.length" class="event-list">
          <span v-for="event in events" :key="event">{{ eventLabel(event) }}</span>
        </div>

        <div class="data-list compact">
          <div><span>Uplinks</span><strong>#{{ stateValue('uplink_counter', '—') }}</strong></div>
          <div><span>Intervalo</span><strong>{{ stateValue('transmission_interval_seconds', '—') }} s</strong></div>
          <div><span>Último dato</span><strong>{{ lastSeen }}</strong></div>
        </div>
      </article>
    </section>
    </div>

    <section class="location-panel" aria-labelledby="location-title">
      <div class="location-heading">
        <div>
          <h2 id="location-title">Ubicación del vehículo</h2>
          <p>Última posición recibida por LoRaWAN</p>
        </div>
        <span :class="['tag', gpsAvailable ? 'ok' : 'warn']">
          GPS {{ gpsAvailable ? 'con posición' : 'esperando señal' }}
        </span>
      </div>

      <div class="location-body">
        <div v-if="gpsAvailable" class="map-frame">
          <iframe
            :key="`${latitude},${longitude}`"
            :src="mapUrl"
            title="Mapa de la ubicación del vehículo"
            loading="lazy"
            referrerpolicy="no-referrer">
          </iframe>
          <span class="map-fix" aria-hidden="true"></span>
        </div>

        <div v-else class="map-empty" role="status">
          <div class="gps-orbit" aria-hidden="true"><span></span></div>
          <strong>Buscando una posición válida</strong>
          <p>Coloca la antena GPS con vista despejada al cielo y espera el próximo uplink.</p>
        </div>

        <aside class="coordinate-panel" aria-label="Coordenadas GPS">
          <span class="coordinate-label">Latitud</span>
          <strong>{{ gpsAvailable ? formatCoordinate(latitude) : '—' }}</strong>
          <span class="coordinate-label">Longitud</span>
          <strong>{{ gpsAvailable ? formatCoordinate(longitude) : '—' }}</strong>
          <div class="location-meta">
            <span>Actualizada</span>
            <b>{{ gpsAvailable ? lastSeen : 'Sin posición' }}</b>
          </div>
          <a v-if="gpsAvailable" :href="mapLink" target="_blank" rel="noopener noreferrer">
            Abrir en OpenStreetMap
          </a>
        </aside>
      </div>
    </section>

    <section class="workspace command-space" aria-label="Administración remota">
      <article class="module">
        <div class="module-heading admin-heading">
          <div>
            <h2>Administración</h2>
            <p>Control remoto mediante Leshan</p>
          </div>
        </div>

        <p v-if="!online" class="inline-warning">
          Sin telemetría reciente. El comando puede quedar pendiente hasta el próximo uplink.
        </p>

        <div class="control-block alarm-control">
          <div class="control-label">
            <label>Bloqueo de motores</label>
            <small>Alarma remota</small>
          </div>
          <div class="button-row">
            <button class="button button-danger" type="button"
              :disabled="controlsLocked || !device || alertActive" @click="requestAlert(true)">
              {{ busy && requestedAction === 'alert' ? 'Enviando…' : 'Bloquear' }}
            </button>
            <button class="button button-secondary" type="button"
              :disabled="controlsLocked || !device || !alertActive" @click="requestAlert(false)">
              Desbloquear
            </button>
          </div>
        </div>

        <div class="control-block">
          <div class="control-label">
            <label for="telemetry-interval">Intervalo de telemetría</label>
            <small>15 s–24 h</small>
          </div>
          <div class="interval-row">
            <div class="number-input">
              <input id="telemetry-interval" v-model.number="interval" type="number" min="15" max="86400" step="1">
              <span>segundos</span>
            </div>
            <button class="button button-primary" type="button"
              :disabled="controlsLocked || !device" @click="requestInterval">
              {{ busy && requestedAction === 'interval' ? 'Aplicando…' : 'Aplicar' }}
            </button>
          </div>
        </div>

        <div v-if="feedback.text && !feedback.action?.startsWith('light-')"
          :class="['feedback', feedback.ok ? 'success' : 'error']" role="status">
          {{ feedback.text }}
        </div>
      </article>

      <article class="module operation-module">
        <div class="module-heading">
          <div>
            <h2>Última operación</h2>
            <p>Seguimiento del último comando</p>
          </div>
          <span v-if="operation" :class="['tag', operationClass]">{{ operationStatusLabel }}</span>
        </div>

        <template v-if="operation">
          <div class="data-list compact">
            <div><span>Transacción</span><strong>#{{ operation.transaction_id }}</strong></div>
            <div><span>Recurso</span><strong>{{ operationResourceLabel }}</strong></div>
            <div><span>Valor solicitado</span><strong>{{ operationValueLabel }}</strong></div>
            <div><span>Actualización</span><strong>{{ operationUpdatedAt }}</strong></div>
          </div>

          <p class="operation-note">La confirmación de la Heltec verifica el cambio físico.</p>
        </template>

        <div v-else class="empty">
          No existen operaciones para este dispositivo.
        </div>
      </article>
    </section>

    </div>
  </main>
</template>

<script>
export default {
  data () {
    return {
      device: null,
      operation: null,
      interval: 40,
      busy: false,
      requestedAction: '',
      requestBaselineTransaction: null,
      feedback: { ok: true, text: '' }
    }
  },
  computed: {
    state () { return this.device?.state || {} },
    events () { return Array.isArray(this.state.events) ? this.state.events : [] },
    alertActive () { return this.state.remote_alert_active === true },
    panicActive () { return this.state.local_panic_active === true },
    vehicleLocked () { return this.alertActive || this.panicActive },
    frontLightOn () { return this.booleanState('front_light_on', 0) },
    rearLightOn () { return this.booleanState('rear_light_on', 4) },
    parkingLightsOn () { return this.booleanState('parking_lights_on', 3) },
    leftIndicatorOn () { return this.booleanState('left_indicator_on', 6) },
    rightIndicatorOn () { return this.booleanState('right_indicator_on', 7) },
    activeLightCount () {
      return [
        this.frontLightOn,
        this.rearLightOn,
        this.parkingLightsOn,
        this.leftIndicatorOn,
        this.rightIndicatorOn
      ].filter(Boolean).length
    },
    lights () {
      return [
        { id: 'front', label: 'Frontal', active: this.frontLightOn },
        { id: 'rear', label: 'Trasera', active: this.rearLightOn },
        { id: 'parking', label: 'Parqueo', active: this.parkingLightsOn },
        { id: 'left', label: 'Izquierda', active: this.leftIndicatorOn },
        { id: 'right', label: 'Derecha', active: this.rightIndicatorOn }
      ]
    },
    mpuAvailable () { return this.state.mpu_available === true },
    ambientTemperature () { return Number(this.state.ambient_temperature_c) },
    ambientHumidity () { return Number(this.state.ambient_humidity_percent) },
    dhtAvailable () {
      return this.state.dht_available === true &&
        Number.isFinite(this.ambientTemperature) &&
        Number.isFinite(this.ambientHumidity) &&
        this.ambientHumidity >= 0 && this.ambientHumidity <= 100
    },
    temperatureScale () {
      if (!this.dhtAvailable) return 0
      return Math.max(0, Math.min(100, ((this.ambientTemperature + 10) / 60) * 100))
    },
    humidityScale () {
      return this.dhtAvailable ? Math.max(0, Math.min(100, this.ambientHumidity)) : 0
    },
    latitude () { return Number(this.state.latitude) },
    longitude () { return Number(this.state.longitude) },
    gpsAvailable () {
      return this.state.gps_available === true &&
        Number.isFinite(this.latitude) && Math.abs(this.latitude) <= 90 &&
        Number.isFinite(this.longitude) && Math.abs(this.longitude) <= 180
    },
    mapUrl () {
      if (!this.gpsAvailable) return ''
      const margin = 0.004
      const bbox = [
        this.longitude - margin,
        this.latitude - margin,
        this.longitude + margin,
        this.latitude + margin
      ].join(',')
      return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${this.latitude},${this.longitude}`)}`
    },
    mapLink () {
      if (!this.gpsAvailable) return '#'
      return `https://www.openstreetmap.org/?mlat=${this.latitude}&mlon=${this.longitude}#map=17/${this.latitude}/${this.longitude}`
    },
    batteryAvailable () { return this.stateNumber('battery_mv') > 0 },
    batteryPercent () { return Math.max(0, Math.min(100, this.stateNumber('battery_percent'))) },
    batteryVoltage () { return this.formatNumber(this.stateNumber('battery_mv') / 1000, 2) },
    signalBars () {
      const rssi = Number(this.device?.rssi)
      if (!Number.isFinite(rssi)) return 0
      if (rssi >= -85) return 4
      if (rssi >= -100) return 3
      if (rssi >= -112) return 2
      return 1
    },
    movementKey () {
      return String(this.state.movement_name || 'stopped').toLowerCase().replaceAll('_', '-')
    },
    movementLabel () {
      const value = String(this.state.movement_name || '').toLowerCase()
      const labels = {
        stopped: 'Detenido', detenido: 'Detenido',
        forward: 'Adelante', adelante: 'Adelante',
        backward: 'Atrás', reverse: 'Atrás', atras: 'Atrás', atrás: 'Atrás',
        left: 'Izquierda', izquierda: 'Izquierda',
        right: 'Derecha', derecha: 'Derecha',
        'forward-left': 'Adelante izquierda', 'forward-right': 'Adelante derecha',
        'backward-left': 'Atrás izquierda', 'backward-right': 'Atrás derecha'
      }
      return labels[value] || this.state.movement_name || 'Sin datos'
    },
    signalQuality () {
      const rssi = Number(this.device?.rssi)
      if (!Number.isFinite(rssi)) return 'Sin medición'
      if (rssi >= -80) return 'Excelente'
      if (rssi >= -95) return 'Buena'
      if (rssi >= -110) return 'Débil'
      return 'Crítica'
    },
    online () {
      if (!this.device?.last_seen) return false
      const age = Date.now() - Date.parse(this.device.last_seen)
      const expected = Number(this.state.transmission_interval_seconds || 40) * 2500
      return age >= 0 && age < Math.max(expected, 120000)
    },
    lastSeen () {
      if (!this.device?.last_seen) return 'Sin datos'
      return new Date(this.device.last_seen).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
    },
    dataAgeText () {
      if (!this.device?.last_seen) return 'Aún no se recibe telemetría'
      const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(this.device.last_seen)) / 1000))
      if (seconds < 60) return `Hace ${seconds} s`
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return `Hace ${minutes} min`
      const hours = Math.floor(minutes / 60)
      if (hours < 48) return `Hace ${hours} h`
      return this.lastSeen
    },
    eventSeverity () {
      const values = this.events.map(value => String(value).toLowerCase())
      if (values.some(value => ['local_panic', 'local-panic', 'collision', 'colision', 'rollover', 'volcamiento'].includes(value))) return 'critical'
      if (values.length > 0) return 'warn'
      return 'ok'
    },
    eventSummary () {
      if (this.eventSeverity === 'ok') return 'Normal'
      if (this.eventSeverity === 'critical') return 'Crítico'
      return 'Atención'
    },
    operationClass () {
      if (this.operation?.status === 'acknowledged') return 'ok'
      if (['rejected', 'lorawan_not_acknowledged', 'ttn_failed', 'publish_failed', 'timed_out'].includes(this.operation?.status)) return 'failed'
      return 'pending'
    },
    operationPending () {
      return ['requested', 'published', 'ttn_queued', 'ttn_sent', 'lorawan_acknowledged'].includes(this.operation?.status)
    },
    controlsLocked () {
      return this.busy || this.operationPending
    },
    operationStatusLabel () {
      const labels = {
        requested: 'Solicitada',
        published: 'Publicada',
        ttn_queued: 'En cola de TTN',
        ttn_sent: 'Enviada por TTN',
        lorawan_acknowledged: 'ACK LoRaWAN',
        acknowledged: 'Confirmada por la Heltec',
        rejected: 'Rechazada por la Heltec',
        lorawan_not_acknowledged: 'Sin ACK LoRaWAN',
        ttn_failed: 'Falló en TTN',
        publish_failed: 'No publicada',
        timed_out: 'Sin confirmación'
      }
      return labels[this.operation?.status] || this.operation?.status || 'Sin estado'
    },
    operationResourceLabel () {
      if (this.operation?.resource_path === '/32769/0/11') return 'Alerta remota'
      if (this.operation?.resource_path === '/32769/0/0') return 'Intervalo'
      if (this.operation?.resource_path === '/32769/0/23') return 'Luz frontal'
      if (this.operation?.resource_path === '/32769/0/24') return 'Luz trasera'
      if (this.operation?.resource_path === '/32769/0/25') return 'Luces de parqueo'
      if (this.operation?.resource_path === '/32769/0/32') return 'Direccional izquierda'
      if (this.operation?.resource_path === '/32769/0/33') return 'Direccional derecha'
      return this.operation?.resource_path || '—'
    },
    operationValueLabel () {
      if (this.operation?.resource_path === '/32769/0/11') {
        return Number(this.operation.requested_value) === 1 || this.operation.requested_value === true ? 'Activar' : 'Desactivar'
      }
      if (this.operation?.resource_path === '/32769/0/0') return `${this.operation.requested_value} segundos`
      if (['/32769/0/23', '/32769/0/24', '/32769/0/25', '/32769/0/32', '/32769/0/33'].includes(this.operation?.resource_path)) {
        return Number(this.operation.requested_value) === 1 || this.operation.requested_value === true ? 'Encender' : 'Apagar'
      }
      return this.operation?.requested_value ?? '—'
    },
    operationUpdatedAt () {
      const value = this.operation?.updated_at || this.operation?.created_at
      if (!value) return '—'
      const normalized = String(value).includes('T') ? value : `${value}Z`
      return new Date(normalized).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })
    }
  },
  watch: {
    msg: {
      immediate: true,
      deep: true,
      handler (message) {
        if (!message) return
        if (message.topic === 'state' && message.payload) {
          this.device = message.payload.device || null
          this.operation = message.payload.operation || null
          const current = Number(this.device?.state?.transmission_interval_seconds)
          if (Number.isFinite(current) && !this.busy) this.interval = current
          if (this.busy && this.operation) {
            const currentTransaction = Number(this.operation.transaction_id)
            const baseline = this.requestBaselineTransaction
            const isNewOperation = baseline === null || currentTransaction !== Number(baseline)
            if (isNewOperation && !this.operationPending) {
              const action = this.requestedAction
              const confirmed = this.operation.status === 'acknowledged'
              this.feedback = {
                ok: confirmed,
                action,
                text: confirmed
                  ? `La Heltec confirmó la operación #${currentTransaction}.`
                  : `La operación #${currentTransaction} terminó como ${this.operationStatusLabel}.`
              }
              this.busy = false
              this.requestedAction = ''
              this.requestBaselineTransaction = null
            }
          }
        }
        if (message.topic === 'feedback' && message.payload) {
          this.feedback = message.payload
          if (!message.payload.ok) {
            this.busy = false
            this.requestedAction = ''
            this.requestBaselineTransaction = null
          }
        }
      }
    }
  },
  methods: {
    stateValue (key, fallback) {
      const result = this.state[key]
      return result === undefined || result === null ? fallback : result
    },
    stateNumber (key) {
      const result = Number(this.state[key])
      return Number.isFinite(result) ? result : 0
    },
    booleanState (key, actuatorBit) {
      if (typeof this.state[key] === 'boolean') return this.state[key]
      const flags = Number(this.state.actuator_flags)
      return Number.isInteger(flags) && Boolean(flags & (1 << actuatorBit))
    },
    formatNumber (value, decimals = 1) {
      const number = Number(value)
      return Number.isFinite(number) ? number.toLocaleString('es-EC', { maximumFractionDigits: decimals }) : '—'
    },
    formatDistance (value) {
      const number = Number(value)
      if (!Number.isFinite(number) || number <= 0 || number >= 999) return 'Fuera de rango'
      return `${this.formatNumber(number, 0)} cm`
    },
    formatMpu (value, suffix) {
      if (!this.mpuAvailable) return '—'
      const number = Number(value)
      return Number.isFinite(number) ? `${this.formatNumber(number, 1)}${suffix}` : '—'
    },
    formatEnvironment (value) {
      if (!this.dhtAvailable) return '—'
      return this.formatNumber(value, 1)
    },
    formatCoordinate (value) {
      const number = Number(value)
      return Number.isFinite(number) ? `${number.toFixed(6)}°` : '—'
    },
    eventLabel (value) {
      const raw = String(value || '').trim()
      const key = raw.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')
      const labels = {
        normal: 'Normal', collision: 'Colisión', colision: 'Colisión', obstacle: 'Obstáculo', obstaculo: 'Obstáculo',
        rollover: 'Volcamiento', volcamiento: 'Volcamiento', 'right-turn': 'Curva derecha', 'curva-derecha': 'Curva derecha',
        'left-turn': 'Curva izquierda', 'curva-izquierda': 'Curva izquierda', ascent: 'Subida', subida: 'Subida', descent: 'Bajada', bajada: 'Bajada',
        'local-panic': 'Pánico local', 'remote-alert': 'Alerta remota'
      }
      return labels[key] || raw
    },
    requestAlert (active) {
      const action = active ? 'activar la alarma y bloquear los motores' : 'desactivar la alarma'
      if (!window.confirm(`¿Confirma que desea ${action}?`)) return
      this.busy = true
      this.requestedAction = 'alert'
      this.requestBaselineTransaction = this.operation?.transaction_id ?? null
      this.feedback = { ok: true, action: 'alert', text: 'Enviando la solicitud a Leshan…' }
      this.send({ action: 'alert', payload: active })
    },
    requestLight (light, active) {
      const labels = {
        front: 'frontal',
        rear: 'trasera',
        parking: 'de parqueo',
        left: 'direccional izquierda',
        right: 'direccional derecha'
      }
      if (!Object.hasOwn(labels, light)) return
      const action = `light-${light}`
      this.busy = true
      this.requestedAction = action
      this.requestBaselineTransaction = this.operation?.transaction_id ?? null
      this.feedback = {
        ok: true,
        action,
        text: `${active ? 'Encendiendo' : 'Apagando'} la luz ${labels[light]} mediante Leshan…`
      }
      this.send({ action, payload: active })
    },
    requestInterval () {
      const value = Number(this.interval)
      if (!Number.isInteger(value) || value < 15 || value > 86400) {
        this.feedback = { ok: false, action: 'interval', text: 'El intervalo debe ser un entero entre 15 y 86400 segundos.' }
        return
      }
      if (!window.confirm(`¿Cambiar el intervalo de transmisión a ${value} segundos?`)) return
      this.busy = true
      this.requestedAction = 'interval'
      this.requestBaselineTransaction = this.operation?.transaction_id ?? null
      this.feedback = { ok: true, action: 'interval', text: 'Enviando la solicitud a Leshan…' }
      this.send({ action: 'interval', payload: value })
    }
  }
}
</script>

<style>
.dash {
  --canvas: #dbe9e8;
  --workspace: #f4f7f6;
  --surface: #ffffff;
  --surface-raised: #eef3f2;
  --ink: #262536;
  --line: #d9e1e0;
  --line-strong: #bcc8c7;
  --text: #262536;
  --muted: #69757d;
  --mint: #45a99f;
  --mint-soft: #dff2ed;
  --cyan: #4ca9bd;
  --green: #66bd78;
  --magenta: #e8789a;
  --amber: #e5a43d;
  --coral: #f27968;
  --red: #d95868;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  background: var(--canvas);
  color: var(--text);
  font-family: "Ubuntu", "DejaVu Sans", Arial, sans-serif;
  font-size: 14px;
}

.dash *, .dash *::before, .dash *::after { box-sizing: border-box; }
.dash > * { width: 100%; }
.dashboard-shell { width: min(100%, 1560px); min-height: 100vh; margin: 0 auto; padding: clamp(22px, 2.5vw, 40px); background: var(--workspace); box-shadow: 0 0 32px rgb(38 37 54 / 9%); }
.dashboard-shell > * { width: 100%; }
.masthead { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 17px 20px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 3px 10px rgb(38 37 54 / 6%); }
.identity { min-width: 0; }
.masthead h1 { margin: 0; font-family: "Ubuntu", "DejaVu Sans", Arial, sans-serif; font-size: clamp(28px, 3vw, 36px); font-weight: 500; line-height: 1.05; letter-spacing: -.035em; }
.endpoint { overflow: hidden; margin: 8px 0 0; color: var(--muted); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.connection { display: flex; align-items: center; gap: 11px; min-width: 210px; padding: 10px 13px; border: 1px solid var(--line); border-radius: 6px; background: #f7f9f9; }
.status-light { width: 9px; height: 9px; flex: 0 0 9px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 4px rgb(217 88 104 / 12%); }
.connection.online .status-light { background: var(--green); box-shadow: 0 0 0 4px rgb(102 189 120 / 14%); }
.connection strong, .connection small { display: block; }
.connection strong { font-size: 14px; font-weight: 700; }
.connection small { margin-top: 3px; color: var(--muted); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 12px; }
.notice { margin-top: 14px; padding: 11px 14px; border: 1px solid #b9ddd6; border-left: 4px solid var(--mint); border-radius: 5px; background: #eaf6f3; color: #35645e; font-size: 13px; line-height: 1.5; }
.notice.warning { border-color: #efd9b0; border-left-color: var(--amber); background: #fff8eb; color: #795c28; }
.panic-alert { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; margin-top: 14px; padding: 13px 15px; border: 1px solid #d95868; border-left-width: 6px; border-radius: 6px; background: #fff0f2; color: #762d38; box-shadow: 0 4px 12px rgb(217 88 104 / 12%); }
.panic-mark { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: var(--red); color: #fff; font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 20px; font-weight: 700; }
.panic-alert strong { display: block; color: #762d38; font-size: 15px; font-weight: 700; }
.panic-alert p { margin: 3px 0 0; color: #91434e; font-size: 12px; line-height: 1.45; }
.panic-time { color: #91434e; font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 11px; text-align: right; }

.metric-label { display: block; color: var(--muted); font-size: 13px; font-weight: 500; }

.overview-layout { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 20px; }
.overview-layout > .cockpit, .overview-layout > .workspace { display: contents; }
.cockpit { display: contents; }
.instrument-stack { display: contents; }
.battery-instrument { grid-row: 1; grid-column: 1; }
.signal-instrument { grid-row: 1; grid-column: 2; }
.motion-instrument { grid-row: 1; grid-column: 3; }
.lock-instrument { grid-row: 1; grid-column: 4; }
.instrument { position: relative; display: flex; min-width: 0; min-height: 116px; align-items: center; gap: 15px; padding: 19px 16px 15px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); box-shadow: 0 3px 10px rgb(38 37 54 / 6%); overflow: hidden; }
.instrument::before { position: absolute; inset: 0 0 auto; height: 5px; background: var(--ink); content: ""; }
.battery-instrument::before { background: var(--coral); }
.motion-instrument::before { background: var(--green); }
.instrument-copy { min-width: 0; }
.instrument-copy strong, .instrument-copy small { display: block; }
.instrument-copy strong { overflow: hidden; margin-top: 8px; color: var(--text); font-family: "Ubuntu", "DejaVu Sans", Arial, sans-serif; font-size: clamp(18px, 2vw, 25px); font-weight: 500; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
.instrument-copy small { margin-top: 7px; color: var(--muted); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 11px; line-height: 1.45; }
.radial-gauge { position: relative; display: grid; width: 76px; height: 76px; flex: 0 0 76px; place-items: center; border-radius: 50%; background: conic-gradient(var(--coral) 0, var(--coral) var(--battery), #e5eaea 0); }
.radial-gauge::before { position: absolute; inset: 7px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); content: ""; }
.radial-gauge div { position: relative; display: flex; align-items: baseline; }
.radial-gauge strong { font-family: "Ubuntu", "DejaVu Sans", Arial, sans-serif; font-size: 27px; font-weight: 500; line-height: 1; }
.radial-gauge small { color: var(--muted); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 11px; }
.signal-bars { display: flex; width: 82px; height: 64px; flex: 0 0 82px; align-items: flex-end; justify-content: center; gap: 6px; }
.signal-bars span { width: 10px; border-radius: 5px 5px 1px 1px; background: #e0e6e5; }
.signal-bars span:nth-child(1) { height: 25%; }
.signal-bars span:nth-child(2) { height: 47%; }
.signal-bars span:nth-child(3) { height: 70%; }
.signal-bars span:nth-child(4) { height: 100%; }
.signal-bars span.active { background: var(--mint); }
.vehicle-map { position: relative; display: grid; min-width: 0; grid-row: 2 / span 2; grid-column: 1 / 4; grid-template-rows: auto minmax(280px, 1fr) auto auto; margin: 0; padding: 0 20px 16px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); box-shadow: 0 3px 10px rgb(38 37 54 / 6%); overflow: hidden; }
.map-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 -20px 14px; padding: 11px 14px; background: var(--ink); color: #fff; font-size: 13px; font-weight: 500; }
.vehicle-svg { display: block; width: min(100%, 720px); height: clamp(320px, 34vw, 420px); align-self: center; margin: 0 auto 14px; border-radius: 6px; background: var(--mint-soft); overflow: visible; }
.range-zone { fill: none; stroke: var(--mint); stroke-dasharray: 4 7; stroke-linecap: round; stroke-width: 1.4; opacity: .78; animation: sensorSweep 5s linear infinite; }
.range-zone text { fill: var(--mint); stroke: none; font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 13px; font-weight: 700; opacity: 1; }
.rear-zone { animation-direction: reverse; }
.wheels { fill: var(--ink); stroke: #666878; stroke-width: 2; }
.wheels, .car-shell { transform-box: fill-box; transform-origin: center; animation: vehicleFloat 3.6s ease-in-out infinite; }
.car-shell .body { fill: #ffffff; stroke: var(--ink); stroke-width: 2; filter: drop-shadow(0 7px 6px rgb(38 37 54 / 18%)); }
.car-shell .glass { fill: #cbd9d8; stroke: #7b8988; stroke-width: 1.5; }
.car-shell .roof { fill: #edf2f1; stroke: #7b8988; stroke-width: 1.5; }
.car-shell .center-line { fill: none; stroke: var(--mint); stroke-dasharray: 3 4; stroke-width: 1; opacity: .5; }
.light-beam { fill: var(--amber); opacity: 0; transition: opacity .2s ease; }
.rear-lighting .light-beam { fill: var(--red); }
.vehicle-light { fill: #bec8c7; stroke: #6b7474; stroke-width: 1; transition: fill .2s ease, filter .2s ease; }
.front-lighting.active .light-beam { opacity: .2; }
.rear-lighting.active .light-beam { opacity: .14; }
.front-lighting.active .vehicle-light { fill: #fff0bf; filter: drop-shadow(0 0 5px #fff0bf); }
.rear-lighting.active .vehicle-light { fill: var(--red); filter: drop-shadow(0 0 5px var(--red)); }
.indicator-lighting.active .vehicle-light { fill: var(--amber); filter: drop-shadow(0 0 5px var(--amber)); animation: parkingBlink .6s step-end infinite; }
.car-shell.locked .body { stroke: var(--red); }
.light-controls { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; padding-top: 14px; border-top: 1px solid var(--line); }
.light-control { appearance: none; display: grid; min-width: 0; min-height: 58px; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 6px; background: #f8faf9; color: var(--text); font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, background-color .15s; }
.light-control:hover:not(:disabled) { border-color: var(--line-strong); background: var(--surface-raised); }
.light-control:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
.light-control:disabled { cursor: not-allowed; opacity: .45; }
.light-control.active { border-color: #e7c06e; background: #fff7e7; }
.light-control.light-rear.active { border-color: #e4a0a9; background: #fff1f3; }
.light-dot { width: 9px; height: 9px; border: 1px solid #aeb8b7; border-radius: 50%; background: #dce3e2; }
.light-control.active .light-dot { border-color: #ffe1a3; background: var(--amber); box-shadow: 0 0 8px rgb(245 170 66 / 48%); }
.light-control.light-rear.active .light-dot { border-color: #ff9aad; background: var(--red); box-shadow: 0 0 8px rgb(255 98 123 / 45%); }
.light-copy { min-width: 0; }
.light-copy strong, .light-copy small { display: block; }
.light-copy strong { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.light-copy small { margin-top: 3px; color: var(--muted); font-size: 11px; }
.light-action { color: #37877f; font-size: 11px; font-weight: 700; }
.light-control.active .light-action { color: #9a6b1f; }
.light-control.light-rear.active .light-action { color: var(--red); }
.light-feedback { margin-top: 10px; padding: 9px 11px; border-left: 3px solid var(--mint); background: #eaf6f3; color: #35645e; font-size: 12px; line-height: 1.4; }
.light-feedback.error { border-left-color: var(--red); background: #fff0f2; color: #9a3f4a; }
.motion-pad { display: grid; width: 86px; height: 86px; flex: 0 0 86px; grid-template-columns: repeat(3, 1fr); place-items: center; }
.motion-pad .dir { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; color: var(--line-strong); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 14px; }
.motion-pad.stopped .center, .motion-pad.detenido .center, .motion-pad.forward .n, .motion-pad.adelante .n, .motion-pad.backward .s, .motion-pad.reverse .s, .motion-pad.atras .s, .motion-pad.atrás .s, .motion-pad.left .w, .motion-pad.izquierda .w, .motion-pad.right .e, .motion-pad.derecha .e, .motion-pad.forward-left .nw, .motion-pad.forward-right .ne, .motion-pad.backward-left .sw, .motion-pad.backward-right .se { background: var(--mint-soft); color: #2e8179; }
.lock-symbol { display: grid; width: 54px; height: 54px; flex: 0 0 54px; place-items: center; border: 2px solid var(--magenta); border-radius: 50%; color: var(--magenta); font-family: "Ubuntu", "DejaVu Sans", Arial, sans-serif; font-size: 27px; font-weight: 500; }
.lock-instrument.danger .lock-symbol { border-color: var(--red); color: var(--red); }

.location-panel { margin-top: 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); box-shadow: 0 3px 10px rgb(38 37 54 / 6%); overflow: hidden; }
.location-heading { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 18px; padding: 11px 16px; background: var(--ink); }
.location-heading h2 { margin: 0; color: #fff; font-size: 18px; font-weight: 500; letter-spacing: -.02em; }
.location-heading p { margin: 5px 0 0; color: #c7c7d0; font-size: 12px; }
.location-body { display: grid; min-height: 370px; grid-template-columns: minmax(0, 1fr) 290px; }
.map-frame { position: relative; min-width: 0; min-height: 370px; border-right: 1px solid var(--line); background: var(--mint-soft); overflow: hidden; }
.map-frame iframe { display: block; width: 100%; height: 100%; min-height: 370px; border: 0; filter: saturate(.82) contrast(.98); }
.map-fix { position: absolute; top: 15px; right: 15px; width: 12px; height: 12px; border: 3px solid #fff; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 7px rgb(102 189 120 / 22%); pointer-events: none; animation: gpsPulse 2s ease-out infinite; }
.map-empty { display: grid; min-height: 370px; place-content: center; justify-items: center; padding: 36px; border-right: 1px solid var(--line); background-color: var(--mint-soft); background-image: linear-gradient(rgb(69 169 159 / 10%) 1px, transparent 1px), linear-gradient(90deg, rgb(69 169 159 / 10%) 1px, transparent 1px); background-size: 32px 32px; text-align: center; }
.map-empty strong { margin-top: 20px; color: var(--text); font-size: 18px; font-weight: 500; }
.map-empty p { max-width: 430px; margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.gps-orbit { position: relative; width: 74px; height: 74px; border: 1px solid var(--mint); border-radius: 50%; }
.gps-orbit::before, .gps-orbit::after { position: absolute; inset: 10px -9px; border: 1px solid rgb(69 169 159 / 45%); border-radius: 50%; content: ""; transform: rotate(52deg); }
.gps-orbit::after { transform: rotate(-52deg); }
.gps-orbit span { position: absolute; inset: 26px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 7px rgb(69 169 159 / 15%); }
.coordinate-panel { display: flex; min-width: 0; flex-direction: column; padding: 28px 24px 22px; background: #f8faf9; }
.coordinate-label { margin-bottom: 7px; color: var(--muted); font-size: 12px; }
.coordinate-panel > strong { margin-bottom: 25px; color: var(--text); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: clamp(18px, 2vw, 24px); font-weight: 700; line-height: 1; overflow-wrap: anywhere; }
.location-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; margin-top: auto; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.location-meta b { color: var(--text); font-weight: 500; text-align: right; }
.coordinate-panel a { margin-top: 18px; padding: 11px 13px; border: 1px solid var(--mint); border-radius: 6px; color: #2e8179; font-size: 13px; font-weight: 700; text-align: center; text-decoration: none; }
.coordinate-panel a:hover { background: var(--mint-soft); }
.coordinate-panel a:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }

.workspace { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr); gap: 14px; margin-top: 14px; }
.overview-layout > .workspace .module:first-child { grid-row: 2; grid-column: 4; }
.overview-layout > .workspace .module:last-child { grid-row: 3; grid-column: 4; }
.module { min-width: 0; padding: 0 20px 20px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); box-shadow: 0 3px 10px rgb(38 37 54 / 6%); overflow: hidden; }
.module-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; min-height: 48px; margin: 0 -20px 13px; padding: 12px 16px; border: 0; background: var(--ink); }
.admin-heading { position: relative; z-index: 2; isolation: isolate; justify-content: flex-start; overflow: hidden; }
.admin-heading > div { min-width: 0; }
.admin-heading > :not(div) { display: none !important; }
.admin-heading::before, .admin-heading::after { display: none !important; content: none !important; }
.module h2 { margin: 0; color: #fff; font-family: "Ubuntu", "DejaVu Sans", Arial, sans-serif; font-size: 18px; font-weight: 500; line-height: 1.1; letter-spacing: -.02em; }
.module-heading p { margin: 5px 0 0; color: #c7c7d0; font-size: 12px; }
.tag { display: inline-flex; max-width: 58%; padding: 5px 8px; border: 1px solid #5b5a69; border-radius: 4px; color: #e4e4e8; font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 11px; font-weight: 700; line-height: 1.25; text-align: right; }
.tag.ok { border-color: #5c9b6a; color: #a8e5b3; }
.tag.warn, .tag.pending { border-color: #967638; color: #ffd68a; }
.tag.critical, .tag.failed { border-color: #9b4b58; color: #ff9eaa; }
.environment-panel { margin: 3px 0 14px; border: 1px solid var(--line); border-radius: 6px; background: #f8faf9; overflow: hidden; }
.environment-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 11px; border-bottom: 1px solid var(--line); }
.environment-header strong { color: var(--text); font-size: 13px; font-weight: 700; }
.environment-header span { color: var(--muted); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 10px; text-align: right; }
.environment-readings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.environment-reading { min-width: 0; padding: 13px 11px 12px; }
.environment-reading + .environment-reading { border-left: 1px solid var(--line); }
.environment-label { display: block; color: var(--muted); font-size: 11px; }
.environment-reading > strong { display: flex; align-items: baseline; gap: 3px; margin-top: 7px; color: var(--text); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: clamp(22px, 2.2vw, 29px); font-weight: 700; line-height: 1; }
.environment-reading > strong small { color: var(--muted); font-size: 11px; font-weight: 500; }
.environment-scale { height: 4px; margin-top: 11px; border-radius: 2px; background: #e2e8e7; overflow: hidden; }
.environment-scale span { display: block; height: 100%; border-radius: inherit; background: var(--coral); transition: width .3s ease; }
.humidity-reading .environment-scale span { background: var(--cyan); }
.environment-panel > p { margin: 0; padding: 9px 11px; border-top: 1px solid #efd9b0; background: #fff8eb; color: #795c28; font-size: 11px; line-height: 1.4; }
.environment-panel.unavailable .environment-reading { opacity: .55; }
.data-list { display: flex; flex-direction: column; }
.data-list > div { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 45px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.data-list > div:last-child { border-bottom: 0; }
.data-list span { color: var(--muted); font-size: 13px; }
.data-list strong { min-width: 0; color: var(--text); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 13px; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
.data-list.compact > div { min-height: 42px; padding: 8px 0; }
.inline-warning { margin: 13px 0 0; padding: 10px 12px; border-left: 3px solid var(--amber); border-radius: 5px; background: #fff8eb; color: #795c28; font-size: 12px; line-height: 1.5; }
.event-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.event-list span { padding: 5px 8px; border: 1px solid #e3a3ab; background: #fff1f3; color: #a54350; font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 11px; font-weight: 700; }

.command-space { align-items: stretch; }
.control-block { display: grid; grid-template-columns: minmax(130px, .55fr) minmax(0, 1fr); align-items: center; gap: 18px; padding: 14px 0; border-bottom: 1px solid var(--line); }
.control-block:last-of-type { border-bottom: 0; }
.control-label label, .control-label small { display: block; }
.control-label label { color: var(--text); font-size: 13px; font-weight: 700; }
.control-label small { margin-top: 5px; color: var(--muted); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 11px; }
.button-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.button { appearance: none; min-height: 42px; margin: 0; padding: 0 15px; border: 1px solid transparent; border-radius: 7px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: background-color .15s, border-color .15s, color .15s, opacity .15s; }
.button:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
.button:disabled { cursor: not-allowed; opacity: .28; }
.button-danger { border-color: var(--coral); background: var(--coral); color: #fff; }
.button-danger:not(:disabled):hover { border-color: #dc6656; background: #dc6656; color: #fff; }
.button-secondary { border-color: var(--line-strong); background: transparent; color: var(--text); }
.button-secondary:not(:disabled):hover { border-color: var(--muted); background: var(--surface-raised); }
.button-primary { background: var(--green); color: var(--ink); }
.button-primary:not(:disabled):hover { background: #86ce93; }
.interval-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: stretch; }
.number-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; min-width: 0; height: 42px; border: 1px solid var(--line-strong); border-radius: 7px; background: #fff; overflow: hidden; }
.number-input:focus-within { border-color: var(--mint); box-shadow: 0 0 0 2px rgb(69 169 159 / 12%); }
.number-input input { width: 100%; min-width: 0; height: 40px; padding: 0 12px; border: 0; outline: 0; background: transparent; color: var(--text); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 14px; }
.number-input span { padding: 0 11px; border-left: 1px solid var(--line); color: var(--muted); font-family: "Ubuntu Mono", "DejaVu Sans Mono", monospace; font-size: 11px; }
.feedback { margin-top: 12px; padding: 10px 12px; border-left: 3px solid var(--mint); border-radius: 5px; background: #eaf6f3; font-size: 12px; line-height: 1.5; }
.feedback.success { color: #35645e; }
.feedback.error { border-color: var(--red); background: #fff0f2; color: #9a3f4a; }
.operation-note { margin: 12px 0 0; padding: 10px 0 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.5; }
.empty { padding: 40px 0; color: var(--muted); font-size: 13px; text-align: center; }

@keyframes sensorSweep {
  to { stroke-dashoffset: -44; }
}

@keyframes vehicleFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes parkingBlink {
  50% { opacity: .3; }
}

@keyframes gpsPulse {
  70%, 100% { box-shadow: 0 0 0 15px rgb(102 189 120 / 0%); }
}

@media (max-width: 1050px) {
  .overview-layout { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .battery-instrument { grid-row: 1; grid-column: 1; }
  .signal-instrument { grid-row: 1; grid-column: 2; }
  .motion-instrument { grid-row: 2; grid-column: 1; }
  .lock-instrument { grid-row: 2; grid-column: 2; }
  .vehicle-map { grid-row: 3; grid-column: 1 / -1; }
  .overview-layout > .workspace .module:first-child { grid-row: 4; grid-column: 1; }
  .overview-layout > .workspace .module:last-child { grid-row: 4; grid-column: 2; }
  .light-controls { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .command-space { grid-template-columns: 1fr; }
  .location-body { grid-template-columns: 1fr; }
  .map-frame, .map-empty { min-height: 320px; border-right: 0; border-bottom: 1px solid var(--line); }
  .map-frame iframe { min-height: 320px; }
  .coordinate-panel { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px 18px; }
  .coordinate-panel > strong { margin-bottom: 10px; text-align: right; }
  .location-meta, .coordinate-panel a { grid-column: 1 / -1; }
}

@media (max-width: 700px) {
  .dashboard-shell { padding: 18px; }
  .masthead { align-items: flex-start; flex-direction: column; gap: 18px; }
  .connection { width: 100%; }
  .panic-alert { grid-template-columns: auto minmax(0, 1fr); }
  .panic-time { grid-column: 2; text-align: left; }
  .overview-layout { grid-template-columns: 1fr; }
  .vehicle-map { grid-row: 1; grid-column: 1; }
  .battery-instrument { grid-row: 2; grid-column: 1; }
  .signal-instrument { grid-row: 3; grid-column: 1; }
  .motion-instrument { grid-row: 4; grid-column: 1; }
  .lock-instrument { grid-row: 5; grid-column: 1; }
  .overview-layout > .workspace .module:first-child { grid-row: 6; grid-column: 1; }
  .overview-layout > .workspace .module:last-child { grid-row: 7; grid-column: 1; }
  .instrument { min-height: 0; }
}

@media (max-width: 520px) {
  .instrument { flex-direction: row; }
  .vehicle-svg { height: 310px; }
  .light-controls { grid-template-columns: 1fr; }
  .module { padding: 0 16px 16px; }
  .module-heading { margin: 0 -16px 13px; }
  .module-heading { flex-direction: column; gap: 8px; }
  .tag { max-width: 100%; text-align: left; }
  .control-block { grid-template-columns: 1fr; gap: 9px; }
  .interval-row { grid-template-columns: 1fr; }
  .button-primary { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .button { transition: none; }
  .environment-scale span { transition: none; }
  .range-zone, .wheels, .car-shell, .indicator-lighting.active .vehicle-light, .map-fix { animation: none; }
}
</style>
