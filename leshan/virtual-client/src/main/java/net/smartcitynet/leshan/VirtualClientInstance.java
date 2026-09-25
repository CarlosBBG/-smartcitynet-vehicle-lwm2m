package net.smartcitynet.leshan;

import static org.eclipse.leshan.client.object.Security.noSec;

import java.io.File;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

import org.eclipse.leshan.client.LeshanClient;
import org.eclipse.leshan.client.LeshanClientBuilder;
import org.eclipse.leshan.client.object.Device;
import org.eclipse.leshan.client.object.Server;
import org.eclipse.leshan.client.resource.LwM2mObjectEnabler;
import org.eclipse.leshan.client.resource.ObjectsInitializer;
import org.eclipse.leshan.core.model.LwM2mModelRepository;
import org.eclipse.leshan.core.model.ObjectLoader;
import org.eclipse.leshan.core.model.ObjectModel;
import org.eclipse.leshan.core.request.BindingMode;
import org.eclipse.leshan.transport.californium.client.endpoint.CaliforniumClientEndpointsProvider;

/** Una representación LwM2M aislada de un vehículo conocido por el Bridge. */
public final class VirtualClientInstance {
    public enum State {
        CREATED,
        PROVISIONING,
        RUNNING,
        STOPPED,
        ERROR
    }

    public record Status(
            String deviceId,
            String endpoint,
            State state,
            boolean registered,
            Instant startedAt,
            String lastError) {
    }

    private final String deviceId;
    private final String endpoint;
    private final String bridgeUrl;
    private final String leshanServerUrl;
    private final File modelsDirectory;
    private final Duration registrationTimeout;

    private volatile State state = State.CREATED;
    private volatile Instant startedAt;
    private volatile String lastError;
    private SmartCityNetVirtualClient.SmartCityNetManagement management;
    private LeshanClient client;

    public VirtualClientInstance(
            String deviceId,
            String endpoint,
            String bridgeUrl,
            String leshanServerUrl,
            File modelsDirectory,
            Duration registrationTimeout) {
        this.deviceId = deviceId;
        this.endpoint = endpoint;
        this.bridgeUrl = bridgeUrl;
        this.leshanServerUrl = leshanServerUrl;
        this.modelsDirectory = modelsDirectory;
        this.registrationTimeout = registrationTimeout;
    }

    public synchronized void start() throws Exception {
        if (state == State.RUNNING) {
            return;
        }
        if (state == State.PROVISIONING) {
            throw new IllegalStateException("El cliente ya se está aprovisionando");
        }

        state = State.PROVISIONING;
        lastError = null;
        try {
            SmartCityNetVirtualClient.BridgeApi bridge =
                    new SmartCityNetVirtualClient.BridgeApi(bridgeUrl, deviceId);
            management = new SmartCityNetVirtualClient.SmartCityNetManagement(bridge);

            List<ObjectModel> models = new ArrayList<>(ObjectLoader.loadAllDefault());
            models.addAll(ObjectLoader.loadObjectsFromDir(modelsDirectory, true));
            LwM2mModelRepository repository = new LwM2mModelRepository(models);
            ObjectsInitializer initializer = new ObjectsInitializer(repository.getLwM2mModel());
            initializer.setInstancesForObject(
                    0,
                    noSec(leshanServerUrl, SmartCityNetVirtualClient.SERVER_ID));
            initializer.setInstancesForObject(
                    1,
                    new Server(
                            SmartCityNetVirtualClient.SERVER_ID,
                            SmartCityNetVirtualClient.REGISTRATION_LIFETIME_SECONDS,
                            EnumSet.of(BindingMode.U),
                            false,
                            BindingMode.U));
            initializer.setInstancesForObject(
                    3,
                    new Device("SmartCityNet", "Heltec WiFi LoRa 32 V3", bridge.devEui()));
            initializer.setFactoryForObject(
                    SmartCityNetVirtualClient.OBJECT_SMARTCITYNET,
                    (model, id, usedIds) -> management);
            initializer.setInstancesForObject(
                    SmartCityNetVirtualClient.OBJECT_SMARTCITYNET,
                    management);

            List<LwM2mObjectEnabler> objects = initializer.createAll();
            CaliforniumClientEndpointsProvider endpoints =
                    new CaliforniumClientEndpointsProvider.Builder().build();
            client = new LeshanClientBuilder(endpoint)
                    .setObjects(objects)
                    .setEndpointsProviders(endpoints)
                    .build();
            client.start();
            awaitRegistration();
            startedAt = Instant.now();
            state = State.RUNNING;
        } catch (Exception error) {
            lastError = error.getMessage();
            state = State.ERROR;
            destroyResources();
            throw error;
        }
    }

    public synchronized void destroy() {
        destroyResources();
        state = State.STOPPED;
    }

    public Status getStatus() {
        LeshanClient currentClient = client;
        boolean registered = currentClient != null
                && !currentClient.getRegisteredServers().isEmpty();
        return new Status(deviceId, endpoint, state, registered, startedAt, lastError);
    }

    public String deviceId() {
        return deviceId;
    }

    public String endpoint() {
        return endpoint;
    }

    private void awaitRegistration() throws InterruptedException {
        long deadline = System.nanoTime() + registrationTimeout.toNanos();
        while (System.nanoTime() < deadline) {
            if (!client.getRegisteredServers().isEmpty()) {
                return;
            }
            Thread.sleep(100);
        }
        throw new IllegalStateException(
                "Leshan no confirmó el registro de " + endpoint
                        + " en " + registrationTimeout.toMillis() + " ms");
    }

    private void destroyResources() {
        if (management != null) {
            management.destroy();
            management = null;
        }
        if (client != null) {
            client.destroy(true);
            client = null;
        }
    }
}
