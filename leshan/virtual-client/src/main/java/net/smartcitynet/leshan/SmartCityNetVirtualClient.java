package net.smartcitynet.leshan;

import static org.eclipse.leshan.client.object.Security.noSec;

import java.io.File;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.eclipse.leshan.client.LeshanClient;
import org.eclipse.leshan.client.LeshanClientBuilder;
import org.eclipse.leshan.client.object.Device;
import org.eclipse.leshan.client.object.Server;
import org.eclipse.leshan.client.resource.BaseInstanceEnabler;
import org.eclipse.leshan.client.resource.LwM2mObjectEnabler;
import org.eclipse.leshan.client.resource.ObjectsInitializer;
import org.eclipse.leshan.client.servers.LwM2mServer;
import org.eclipse.leshan.core.Destroyable;
import org.eclipse.leshan.core.model.LwM2mModelRepository;
import org.eclipse.leshan.core.model.ObjectLoader;
import org.eclipse.leshan.core.model.ObjectModel;
import org.eclipse.leshan.core.node.LwM2mResource;
import org.eclipse.leshan.core.request.BindingMode;
import org.eclipse.leshan.core.ResponseCode;
import org.eclipse.leshan.core.response.ReadResponse;
import org.eclipse.leshan.core.response.WriteResponse;
import org.eclipse.leshan.transport.californium.client.endpoint.CaliforniumClientEndpointsProvider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Cliente LwM2M virtual que representa en Leshan el device twin mantenido por
 * SmartCityNet Bridge. La Heltec no ejecuta CoAP: este proceso adapta entre
 * LwM2M/CoAP y la API HTTP que termina generando downlinks LoRaWAN.
 */
public final class SmartCityNetVirtualClient {
    private static final int OBJECT_SMARTCITYNET = 32769;
    private static final int SERVER_ID = 123;
    private static final long REGISTRATION_LIFETIME_SECONDS = 300;

    private SmartCityNetVirtualClient() {
    }

    public static void main(String[] args) throws Exception {
        String serverUri = env("LESHAN_SERVER_URL", "coap://127.0.0.1:5683");
        String bridgeApi = env("BRIDGE_API_URL", "http://127.0.0.1:8081");
        String deviceId = env("DEVICE_ID", "heltec-labredes");
        String endpoint = env("LESHAN_ENDPOINT", "smartcitynet-" + deviceId);
        File modelsDirectory = new File(env("LESHAN_MODELS_DIR", "models"));

        BridgeApi bridge = new BridgeApi(bridgeApi, deviceId);
        SmartCityNetManagement management = new SmartCityNetManagement(bridge);

        List<ObjectModel> models = new ArrayList<>(ObjectLoader.loadAllDefault());
        models.addAll(ObjectLoader.loadObjectsFromDir(modelsDirectory, true));
        LwM2mModelRepository repository = new LwM2mModelRepository(models);
        ObjectsInitializer initializer = new ObjectsInitializer(repository.getLwM2mModel());

        initializer.setInstancesForObject(0, noSec(serverUri, SERVER_ID));
        initializer.setInstancesForObject(
                1,
                new Server(
                        SERVER_ID,
                        REGISTRATION_LIFETIME_SECONDS,
                        EnumSet.of(BindingMode.U),
                        false,
                        BindingMode.U));
        initializer.setInstancesForObject(
                3,
                new Device("SmartCityNet", "Heltec WiFi LoRa 32 V3", bridge.devEui()));
        // El objeto es de instancia única. La factory solo satisface el contrato
        // de ObjectsInitializer; Leshan no emitirá Create sobre este objeto.
        initializer.setFactoryForObject(OBJECT_SMARTCITYNET, (model, id, usedIds) -> management);
        initializer.setInstancesForObject(OBJECT_SMARTCITYNET, management);

        List<LwM2mObjectEnabler> objects = initializer.createAll();
        CaliforniumClientEndpointsProvider endpoints =
                new CaliforniumClientEndpointsProvider.Builder().build();
        LeshanClient client = new LeshanClientBuilder(endpoint)
                .setObjects(objects)
                .setEndpointsProviders(endpoints)
                .build();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            management.destroy();
            client.destroy(true);
        }, "smartcitynet-shutdown"));

        client.start();
        System.out.printf(
                "Cliente LwM2M virtual iniciado: endpoint=%s servidor=%s bridge=%s%n",
                endpoint,
                serverUri,
                bridgeApi);
        new CountDownLatch(1).await();
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private record Snapshot(
            long transmissionInterval,
            long uplinkCounter,
            long batteryMv,
            long batteryPercent,
            long lastCommandStatus,
            long lastTransactionId,
            long rssi,
            double snr,
            Date lastSeen,
            String operationState,
            String devEui,
            boolean remoteAlert,
            boolean localPanic,
            String movement,
            long speed,
            long frontDistance,
            long rearDistance,
            double pitch,
            double roll,
            double temperature,
            long actuatorFlags,
            long eventFlags,
            String eventSummary,
            boolean mpuAvailable,
            boolean frontLight,
            boolean rearLight,
            boolean parkingLights,
            boolean leftIndicator,
            boolean rightIndicator,
            double latitude,
            double longitude,
            boolean gpsAvailable,
            double ambientTemperature,
            double ambientHumidity,
            boolean dhtAvailable) {
    }

    private static final class BridgeApi {
        private static final ObjectMapper JSON = new ObjectMapper();

        private final HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        private final String baseUrl;
        private final String deviceId;
        private final String encodedDeviceId;

        BridgeApi(String baseUrl, String deviceId) {
            this.baseUrl = baseUrl.replaceAll("/+$", "");
            this.deviceId = deviceId;
            this.encodedDeviceId = URLEncoder.encode(deviceId, StandardCharsets.UTF_8);
        }

        String devEui() throws Exception {
            return snapshot().devEui();
        }

        Snapshot snapshot() throws Exception {
            JsonNode device = get("/devices/" + encodedDeviceId);
            JsonNode state = device.path("state");
            String operationState = "none";
            JsonNode operations = get("/operations");
            if (operations.isArray()) {
                for (JsonNode operation : operations) {
                    if (deviceId.equals(operation.path("device_id").asText())) {
                        operationState = operation.path("status").asText("unknown");
                        break;
                    }
                }
            }
            return new Snapshot(
                    state.path("transmission_interval_seconds").asLong(),
                    state.path("uplink_counter").asLong(),
                    state.path("battery_mv").asLong(),
                    state.path("battery_percent").asLong(),
                    state.path("last_command_status").asLong(),
                    state.path("last_transaction_id").asLong(),
                    device.path("rssi").asLong(),
                    device.path("snr").asDouble(),
                    Date.from(Instant.parse(device.path("last_seen").asText())),
                    operationState,
                    device.path("dev_eui").asText(),
                    state.path("remote_alert_active").asBoolean(false),
                    state.path("local_panic_active").asBoolean(false),
                    state.path("movement_name").asText("unknown"),
                    state.path("speed_percent").asLong(),
                    state.path("front_distance_cm").asLong(),
                    state.path("rear_distance_cm").asLong(),
                    state.path("pitch_degrees").asDouble(),
                    state.path("roll_degrees").asDouble(),
                    state.path("temperature_c").asDouble(),
                    state.path("actuator_flags").asLong(),
                    state.path("event_flags").asLong(),
                    state.path("event_summary").asText("unknown"),
                    state.path("mpu_available").asBoolean(false),
                    state.path("front_light_on").asBoolean(false),
                    state.path("rear_light_on").asBoolean(false),
                    state.path("parking_lights_on").asBoolean(false),
                    state.path("left_indicator_on").asBoolean(false),
                    state.path("right_indicator_on").asBoolean(false),
                    state.path("latitude").asDouble(),
                    state.path("longitude").asDouble(),
                    state.path("gps_available").asBoolean(false),
                    state.path("ambient_temperature_c").asDouble(),
                    state.path("ambient_humidity_percent").asDouble(),
                    state.path("dht_available").asBoolean(false));
        }

        void setTransmissionInterval(long seconds) throws Exception {
            ObjectNode body = JSON.createObjectNode().put("value", seconds);
            HttpRequest request = HttpRequest.newBuilder(
                            URI.create(baseUrl + "/devices/" + encodedDeviceId + "/transmission-interval"))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 202) {
                throw new BridgeRequestException(
                        response.statusCode(),
                        "Bridge rechazo la escritura: HTTP " + response.statusCode() + " " + response.body());
            }
        }

        void setRemoteAlert(boolean active) throws Exception {
            ObjectNode body = JSON.createObjectNode().put("value", active);
            HttpRequest request = HttpRequest.newBuilder(
                            URI.create(baseUrl + "/devices/" + encodedDeviceId + "/alert"))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 202) {
                throw new BridgeRequestException(
                        response.statusCode(),
                        "Bridge rechazo la alerta: HTTP " + response.statusCode() + " " + response.body());
            }
        }

        void setVehicleLight(String light, boolean active) throws Exception {
            ObjectNode body = JSON.createObjectNode().put("value", active);
            HttpRequest request = HttpRequest.newBuilder(
                            URI.create(baseUrl + "/devices/" + encodedDeviceId + "/lights/" + light))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 202) {
                throw new BridgeRequestException(
                        response.statusCode(),
                        "Bridge rechazo la luz " + light + ": HTTP "
                                + response.statusCode() + " " + response.body());
            }
        }

        private JsonNode get(String path) throws Exception {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IllegalStateException(
                        "Bridge no disponible: HTTP " + response.statusCode() + " " + response.body());
            }
            return JSON.readTree(response.body());
        }
    }

    private static final class BridgeRequestException extends Exception {
        private final int statusCode;

        BridgeRequestException(int statusCode, String message) {
            super(message);
            this.statusCode = statusCode;
        }

        int statusCode() {
            return statusCode;
        }
    }

    private static final class SmartCityNetManagement extends BaseInstanceEnabler implements Destroyable {
        private final BridgeApi bridge;
        private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "smartcitynet-device-twin-poller");
            thread.setDaemon(true);
            return thread;
        });
        private volatile Snapshot current;

        SmartCityNetManagement(BridgeApi bridge) throws Exception {
            this.bridge = bridge;
            this.current = bridge.snapshot();
            poller.scheduleWithFixedDelay(this::refresh, 2, 2, TimeUnit.SECONDS);
        }

        @Override
        public ReadResponse read(LwM2mServer server, int resourceId) {
            Snapshot value = current;
            return switch (resourceId) {
                case 0 -> ReadResponse.success(resourceId, value.transmissionInterval());
                case 1 -> ReadResponse.success(resourceId, value.uplinkCounter());
                case 2 -> ReadResponse.success(resourceId, value.batteryMv());
                case 3 -> ReadResponse.success(resourceId, value.batteryPercent());
                case 4 -> ReadResponse.success(resourceId, value.lastCommandStatus());
                case 5 -> ReadResponse.success(resourceId, value.lastTransactionId());
                case 6 -> ReadResponse.success(resourceId, value.rssi());
                case 7 -> ReadResponse.success(resourceId, value.snr());
                case 8 -> ReadResponse.success(resourceId, value.lastSeen());
                case 9 -> ReadResponse.success(resourceId, value.operationState());
                case 10 -> ReadResponse.success(resourceId, value.devEui());
                case 11 -> ReadResponse.success(resourceId, value.remoteAlert());
                case 12 -> ReadResponse.success(resourceId, value.movement());
                case 13 -> ReadResponse.success(resourceId, value.speed());
                case 14 -> ReadResponse.success(resourceId, value.frontDistance());
                case 15 -> ReadResponse.success(resourceId, value.rearDistance());
                case 16 -> ReadResponse.success(resourceId, value.pitch());
                case 17 -> ReadResponse.success(resourceId, value.roll());
                case 18 -> ReadResponse.success(resourceId, value.temperature());
                case 19 -> ReadResponse.success(resourceId, value.actuatorFlags());
                case 20 -> ReadResponse.success(resourceId, value.eventFlags());
                case 21 -> ReadResponse.success(resourceId, value.eventSummary());
                case 22 -> ReadResponse.success(resourceId, value.mpuAvailable());
                case 23 -> ReadResponse.success(resourceId, value.frontLight());
                case 24 -> ReadResponse.success(resourceId, value.rearLight());
                case 25 -> ReadResponse.success(resourceId, value.parkingLights());
                case 26 -> ReadResponse.success(resourceId, value.latitude());
                case 27 -> ReadResponse.success(resourceId, value.longitude());
                case 28 -> ReadResponse.success(resourceId, value.gpsAvailable());
                case 29 -> ReadResponse.success(resourceId, value.ambientTemperature());
                case 30 -> ReadResponse.success(resourceId, value.ambientHumidity());
                case 31 -> ReadResponse.success(resourceId, value.dhtAvailable());
                case 32 -> ReadResponse.success(resourceId, value.leftIndicator());
                case 33 -> ReadResponse.success(resourceId, value.rightIndicator());
                case 34 -> ReadResponse.success(resourceId, value.localPanic());
                default -> super.read(server, resourceId);
            };
        }

        @Override
        public WriteResponse write(
                LwM2mServer server,
                boolean replace,
                int resourceId,
                LwM2mResource value) {
            Object rawValue = value.getValue();
            try {
                if (resourceId == 0) {
                    if (!(rawValue instanceof Number)) {
                        return WriteResponse.badRequest("Transmission Interval debe ser numerico");
                    }
                    long seconds = ((Number) rawValue).longValue();
                    if (seconds < 15 || seconds > 86_400) {
                        return WriteResponse.badRequest("Transmission Interval fuera de rango: 15..86400 s");
                    }
                    bridge.setTransmissionInterval(seconds);
                } else if (resourceId == 11) {
                    if (!(rawValue instanceof Boolean)) {
                        return WriteResponse.badRequest("Remote Alert debe ser booleano");
                    }
                    bridge.setRemoteAlert((Boolean) rawValue);
                } else if ((resourceId >= 23 && resourceId <= 25)
                        || resourceId == 32 || resourceId == 33) {
                    if (!(rawValue instanceof Boolean)) {
                        return WriteResponse.badRequest("El estado de la luz debe ser booleano");
                    }
                    String light = switch (resourceId) {
                        case 23 -> "front";
                        case 24 -> "rear";
                        case 25 -> "parking";
                        case 32 -> "left";
                        case 33 -> "right";
                        default -> throw new IllegalStateException("Recurso de luz inesperado");
                    };
                    bridge.setVehicleLight(light, (Boolean) rawValue);
                } else {
                    return WriteResponse.methodNotAllowed();
                }
                refresh();
                return WriteResponse.success();
            } catch (BridgeRequestException error) {
                if (error.statusCode() == 404) {
                    return WriteResponse.notFound();
                }
                if (error.statusCode() == 409) {
                    return new WriteResponse(ResponseCode.PRECONDITION_FAILED, error.getMessage());
                }
                if (error.statusCode() >= 400 && error.statusCode() < 500) {
                    return WriteResponse.badRequest(error.getMessage());
                }
                return WriteResponse.internalServerError(error.getMessage());
            } catch (Exception error) {
                return WriteResponse.internalServerError(error.getMessage());
            }
        }

        private void refresh() {
            try {
                Snapshot previous = current;
                Snapshot updated = bridge.snapshot();
                current = updated;
                if (previous == null) {
                    return;
                }
                notifyIfChanged(0, previous.transmissionInterval(), updated.transmissionInterval());
                notifyIfChanged(1, previous.uplinkCounter(), updated.uplinkCounter());
                notifyIfChanged(2, previous.batteryMv(), updated.batteryMv());
                notifyIfChanged(3, previous.batteryPercent(), updated.batteryPercent());
                notifyIfChanged(4, previous.lastCommandStatus(), updated.lastCommandStatus());
                notifyIfChanged(5, previous.lastTransactionId(), updated.lastTransactionId());
                notifyIfChanged(6, previous.rssi(), updated.rssi());
                notifyIfChanged(7, previous.snr(), updated.snr());
                notifyIfChanged(8, previous.lastSeen(), updated.lastSeen());
                notifyIfChanged(9, previous.operationState(), updated.operationState());
                notifyIfChanged(10, previous.devEui(), updated.devEui());
                notifyIfChanged(11, previous.remoteAlert(), updated.remoteAlert());
                notifyIfChanged(12, previous.movement(), updated.movement());
                notifyIfChanged(13, previous.speed(), updated.speed());
                notifyIfChanged(14, previous.frontDistance(), updated.frontDistance());
                notifyIfChanged(15, previous.rearDistance(), updated.rearDistance());
                notifyIfChanged(16, previous.pitch(), updated.pitch());
                notifyIfChanged(17, previous.roll(), updated.roll());
                notifyIfChanged(18, previous.temperature(), updated.temperature());
                notifyIfChanged(19, previous.actuatorFlags(), updated.actuatorFlags());
                notifyIfChanged(20, previous.eventFlags(), updated.eventFlags());
                notifyIfChanged(21, previous.eventSummary(), updated.eventSummary());
                notifyIfChanged(22, previous.mpuAvailable(), updated.mpuAvailable());
                notifyIfChanged(23, previous.frontLight(), updated.frontLight());
                notifyIfChanged(24, previous.rearLight(), updated.rearLight());
                notifyIfChanged(25, previous.parkingLights(), updated.parkingLights());
                notifyIfChanged(26, previous.latitude(), updated.latitude());
                notifyIfChanged(27, previous.longitude(), updated.longitude());
                notifyIfChanged(28, previous.gpsAvailable(), updated.gpsAvailable());
                notifyIfChanged(29, previous.ambientTemperature(), updated.ambientTemperature());
                notifyIfChanged(30, previous.ambientHumidity(), updated.ambientHumidity());
                notifyIfChanged(31, previous.dhtAvailable(), updated.dhtAvailable());
                notifyIfChanged(32, previous.leftIndicator(), updated.leftIndicator());
                notifyIfChanged(33, previous.rightIndicator(), updated.rightIndicator());
                notifyIfChanged(34, previous.localPanic(), updated.localPanic());
            } catch (Exception error) {
                System.err.println("No se pudo actualizar el device twin: " + error.getMessage());
            }
        }

        private void notifyIfChanged(int resourceId, Object previous, Object updated) {
            if (!Objects.equals(previous, updated)) {
                fireResourceChange(resourceId);
            }
        }

        @Override
        public void destroy() {
            poller.shutdownNow();
        }
    }

}
