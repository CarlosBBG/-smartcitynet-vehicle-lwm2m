package net.smartcitynet.leshan;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/** API HTTP local para el ciclo de vida de clientes virtuales. */
final class VirtualClientManagerHttpServer implements AutoCloseable {
    private static final int MAX_BODY_BYTES = 16 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final SmartCityNetVirtualClientManager manager;
    private final HttpServer server;
    private final ExecutorService executor;

    VirtualClientManagerHttpServer(
            SmartCityNetVirtualClientManager manager,
            String host,
            int port) throws IOException {
        this.manager = manager;
        this.server = HttpServer.create(new InetSocketAddress(host, port), 0);
        this.executor = Executors.newCachedThreadPool(runnable -> {
            Thread thread = new Thread(runnable, "smartcitynet-manager-http");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(executor);
        server.createContext("/", this::handle);
    }

    void start() {
        server.start();
    }

    @Override
    public void close() {
        server.stop(0);
        executor.shutdownNow();
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            if ("GET".equals(method) && "/health".equals(path)) {
                ObjectNode response = JSON.createObjectNode();
                response.put("status", "ok");
                response.put("clientCount", manager.getClients().size());
                response.put("runningClients", manager.runningClientCount());
                send(exchange, 200, response);
                return;
            }
            if ("GET".equals(method) && "/clients".equals(path)) {
                send(exchange, 200, clientsJson());
                return;
            }
            if ("POST".equals(method) && "/clients".equals(path)) {
                createClient(exchange);
                return;
            }
            if ("DELETE".equals(method) && path.startsWith("/clients/")) {
                String encodedEndpoint = exchange.getRequestURI().getRawPath()
                        .substring("/clients/".length());
                if (encodedEndpoint.isBlank() || encodedEndpoint.contains("/")) {
                    throw new SmartCityNetVirtualClientManager.ManagerException(
                            400,
                            "INVALID_LWM2M_ENDPOINT",
                            "Debe indicar un único endpoint");
                }
                String endpoint = URLDecoder.decode(encodedEndpoint, StandardCharsets.UTF_8);
                VirtualClientInstance.Status status = manager.stopClient(endpoint);
                send(exchange, 200, statusJson(status));
                return;
            }
            sendError(exchange, 404, "NOT_FOUND", "Ruta no encontrada");
        } catch (SmartCityNetVirtualClientManager.ManagerException error) {
            sendError(exchange, error.statusCode(), error.code(), error.getMessage());
        } catch (JsonProcessingException error) {
            sendError(exchange, 400, "INVALID_JSON", "El body no contiene JSON válido");
        } catch (Exception error) {
            sendError(
                    exchange,
                    500,
                    "INTERNAL_ERROR",
                    error.getMessage() == null ? "Error interno" : error.getMessage());
        } finally {
            exchange.close();
        }
    }

    private void createClient(HttpExchange exchange) throws Exception {
        byte[] body = exchange.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) {
            throw new SmartCityNetVirtualClientManager.ManagerException(
                    413,
                    "REQUEST_TOO_LARGE",
                    "El body supera el límite permitido");
        }
        JsonNode request = JSON.readTree(body);
        if (request == null || !request.isObject()) {
            throw new SmartCityNetVirtualClientManager.ManagerException(
                    400,
                    "INVALID_REQUEST",
                    "El body debe ser un objeto JSON");
        }
        String deviceId = request.path("deviceId").asText(null);
        String endpoint = request.path("endpoint").asText(null);
        SmartCityNetVirtualClientManager.StartResult result =
                manager.startClient(deviceId, endpoint);
        ObjectNode response = statusJson(result.instance().getStatus());
        response.put("created", result.created());
        send(exchange, result.created() ? 201 : 200, response);
    }

    private ArrayNode clientsJson() {
        ArrayNode result = JSON.createArrayNode();
        manager.getClients().forEach(status -> result.add(statusJson(status)));
        return result;
    }

    private static ObjectNode statusJson(VirtualClientInstance.Status status) {
        ObjectNode result = JSON.createObjectNode();
        result.put("deviceId", status.deviceId());
        result.put("endpoint", status.endpoint());
        result.put("state", status.state().name());
        result.put("registered", status.registered());
        if (status.startedAt() == null) {
            result.putNull("startedAt");
        } else {
            result.put("startedAt", status.startedAt().toString());
        }
        if (status.lastError() == null) {
            result.putNull("lastError");
        } else {
            result.put("lastError", status.lastError());
        }
        return result;
    }

    private static void sendError(
            HttpExchange exchange,
            int status,
            String code,
            String message) throws IOException {
        ObjectNode response = JSON.createObjectNode();
        response.put("statusCode", status);
        response.put("code", code);
        response.put("message", message);
        send(exchange, status, response);
    }

    private static void send(HttpExchange exchange, int status, JsonNode data)
            throws IOException {
        byte[] body = JSON.writeValueAsBytes(data);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
    }
}
