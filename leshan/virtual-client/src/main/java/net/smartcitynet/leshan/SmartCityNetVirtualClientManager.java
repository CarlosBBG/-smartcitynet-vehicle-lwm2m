package net.smartcitynet.leshan;

import java.io.File;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CountDownLatch;
import java.util.regex.Pattern;

/** Administra varios clientes LwM2M virtuales dentro de un único proceso. */
public final class SmartCityNetVirtualClientManager implements AutoCloseable {
    private static final Pattern DEVICE_ID =
            Pattern.compile("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$");
    private static final Pattern ENDPOINT =
            Pattern.compile("^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$");

    public record StartResult(VirtualClientInstance instance, boolean created) {
    }

    public static final class ManagerException extends Exception {
        private static final long serialVersionUID = 1L;
        private final int statusCode;
        private final String code;

        ManagerException(int statusCode, String code, String message) {
            super(message);
            this.statusCode = statusCode;
            this.code = code;
        }

        public int statusCode() {
            return statusCode;
        }

        public String code() {
            return code;
        }
    }

    private record ProvisioningTask(
            String deviceId,
            CompletableFuture<VirtualClientInstance> future) {
    }

    private final Object lock = new Object();
    private final Map<String, VirtualClientInstance> clients = new HashMap<>();
    private final Map<String, ProvisioningTask> provisioning = new HashMap<>();
    private final String bridgeUrl;
    private final String leshanServerUrl;
    private final File modelsDirectory;
    private final Duration registrationTimeout;

    public SmartCityNetVirtualClientManager(
            String bridgeUrl,
            String leshanServerUrl,
            File modelsDirectory,
            Duration registrationTimeout) {
        this.bridgeUrl = bridgeUrl;
        this.leshanServerUrl = leshanServerUrl;
        this.modelsDirectory = modelsDirectory;
        this.registrationTimeout = registrationTimeout;
    }

    public StartResult startClient(String deviceId, String endpoint) throws ManagerException {
        validateIdentity(deviceId, endpoint);

        ProvisioningTask task;
        boolean taskOwner = false;
        synchronized (lock) {
            VirtualClientInstance existing = clients.get(endpoint);
            if (existing != null) {
                if (!existing.deviceId().equals(deviceId)) {
                    throw conflict(
                            "ENDPOINT_ALREADY_MANAGED",
                            "El endpoint ya representa otro deviceId");
                }
                return new StartResult(existing, false);
            }

            task = provisioning.get(endpoint);
            if (task != null) {
                if (!task.deviceId().equals(deviceId)) {
                    throw conflict(
                            "ENDPOINT_PROVISIONING_CONFLICT",
                            "El endpoint se está creando para otro deviceId");
                }
            } else {
                assertDeviceIdAvailable(deviceId, endpoint);
                task = new ProvisioningTask(deviceId, new CompletableFuture<>());
                provisioning.put(endpoint, task);
                taskOwner = true;
            }
        }

        if (!taskOwner) {
            try {
                return new StartResult(task.future().join(), false);
            } catch (CompletionException error) {
                Throwable cause = error.getCause();
                if (cause instanceof ManagerException managerError) {
                    throw managerError;
                }
                throw new ManagerException(
                        502,
                        "LWM2M_CLIENT_START_FAILED",
                        cause == null ? error.getMessage() : cause.getMessage());
            }
        }

        try {
            VirtualClientInstance instance = new VirtualClientInstance(
                    deviceId,
                    endpoint,
                    bridgeUrl,
                    leshanServerUrl,
                    modelsDirectory,
                    registrationTimeout);
            instance.start();
            synchronized (lock) {
                clients.put(endpoint, instance);
                provisioning.remove(endpoint);
            }
            task.future().complete(instance);
            return new StartResult(instance, true);
        } catch (Exception error) {
            ManagerException mapped = mapProvisioningError(error);
            synchronized (lock) {
                provisioning.remove(endpoint);
            }
            task.future().completeExceptionally(mapped);
            throw mapped;
        }
    }

    public VirtualClientInstance.Status stopClient(String endpoint) throws ManagerException {
        VirtualClientInstance instance;
        synchronized (lock) {
            if (provisioning.containsKey(endpoint)) {
                throw conflict(
                        "LWM2M_CLIENT_PROVISIONING",
                        "El cliente todavía se está aprovisionando");
            }
            instance = clients.remove(endpoint);
        }
        if (instance == null) {
            throw new ManagerException(
                    404,
                    "LWM2M_CLIENT_NOT_FOUND",
                    "No existe un cliente para el endpoint solicitado");
        }
        instance.destroy();
        return instance.getStatus();
    }

    public List<VirtualClientInstance.Status> getClients() {
        synchronized (lock) {
            List<VirtualClientInstance.Status> statuses = new ArrayList<>();
            clients.values().stream()
                    .map(VirtualClientInstance::getStatus)
                    .sorted(Comparator.comparing(VirtualClientInstance.Status::endpoint))
                    .forEach(statuses::add);
            provisioning.forEach((endpoint, task) -> statuses.add(
                    new VirtualClientInstance.Status(
                            task.deviceId(),
                            endpoint,
                            VirtualClientInstance.State.PROVISIONING,
                            false,
                            null,
                            null)));
            statuses.sort(Comparator.comparing(VirtualClientInstance.Status::endpoint));
            return List.copyOf(statuses);
        }
    }

    public int runningClientCount() {
        return (int) getClients().stream()
                .filter(status -> status.state() == VirtualClientInstance.State.RUNNING)
                .count();
    }

    @Override
    public void close() {
        List<VirtualClientInstance> snapshot;
        synchronized (lock) {
            snapshot = List.copyOf(clients.values());
            clients.clear();
        }
        snapshot.forEach(VirtualClientInstance::destroy);
    }

    private void assertDeviceIdAvailable(String deviceId, String endpoint)
            throws ManagerException {
        boolean alreadyManaged = clients.values().stream()
                .anyMatch(instance -> instance.deviceId().equals(deviceId)
                        && !instance.endpoint().equals(endpoint));
        boolean beingProvisioned = provisioning.entrySet().stream()
                .anyMatch(entry -> entry.getValue().deviceId().equals(deviceId)
                        && !entry.getKey().equals(endpoint));
        if (alreadyManaged || beingProvisioned) {
            throw conflict(
                    "DEVICE_ALREADY_MANAGED",
                    "El deviceId ya está asociado a otro endpoint");
        }
    }

    private static void validateIdentity(String deviceId, String endpoint)
            throws ManagerException {
        if (deviceId == null || !DEVICE_ID.matcher(deviceId).matches()) {
            throw new ManagerException(
                    400,
                    "INVALID_DEVICE_ID",
                    "deviceId debe usar minúsculas, números y guiones");
        }
        if (endpoint == null || !ENDPOINT.matcher(endpoint).matches()) {
            throw new ManagerException(
                    400,
                    "INVALID_LWM2M_ENDPOINT",
                    "endpoint contiene caracteres no permitidos");
        }
    }

    private static ManagerException mapProvisioningError(Exception error) {
        if (error instanceof SmartCityNetVirtualClient.BridgeRequestException bridgeError) {
            if (bridgeError.statusCode() == 404) {
                return new ManagerException(
                        404,
                        "DEVICE_NOT_DISCOVERED",
                        "El dispositivo todavía no existe en el Bridge");
            }
            return new ManagerException(
                    502,
                    "BRIDGE_UNAVAILABLE",
                    bridgeError.getMessage());
        }
        return new ManagerException(
                502,
                "LWM2M_CLIENT_START_FAILED",
                error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
    }

    private static ManagerException conflict(String code, String message) {
        return new ManagerException(409, code, message);
    }

    public static void main(String[] args) throws Exception {
        String bridgeUrl = SmartCityNetVirtualClient.env(
                "BRIDGE_API_URL",
                "http://127.0.0.1:8081");
        String leshanUrl = SmartCityNetVirtualClient.env(
                "LESHAN_SERVER_URL",
                "coap://127.0.0.1:5683");
        File modelsDirectory = new File(SmartCityNetVirtualClient.env(
                "LESHAN_MODELS_DIR",
                "models"));
        Duration registrationTimeout = Duration.ofMillis(Long.parseLong(
                SmartCityNetVirtualClient.env("LWM2M_REGISTRATION_GRACE_MS", "15000")));
        String host = SmartCityNetVirtualClient.env("LWM2M_MANAGER_HOST", "127.0.0.1");
        int port = Integer.parseInt(SmartCityNetVirtualClient.env("LWM2M_MANAGER_PORT", "8090"));

        SmartCityNetVirtualClientManager manager = new SmartCityNetVirtualClientManager(
                bridgeUrl,
                leshanUrl,
                modelsDirectory,
                registrationTimeout);
        VirtualClientManagerHttpServer api =
                new VirtualClientManagerHttpServer(manager, host, port);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            api.close();
            manager.close();
        }, "smartcitynet-manager-shutdown"));
        api.start();
        System.out.printf(
                "Virtual Client Manager iniciado en http://%s:%d (Leshan=%s, Bridge=%s)%n",
                host,
                port,
                leshanUrl,
                bridgeUrl);
        new CountDownLatch(1).await();
    }
}
