-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('PENDING_DISCOVERY', 'ONLINE', 'OFFLINE', 'LWM2M_DISCONNECTED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('requested', 'published', 'ttn_queued', 'ttn_sent', 'lorawan_acknowledged', 'acknowledged', 'rejected', 'timed_out', 'ttn_failed', 'publish_failed');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOCAL_PANIC', 'LOW_BATTERY', 'VEHICLE_OFFLINE', 'LWM2M_DISCONNECTED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "devEui" TEXT,
    "lwm2mEndpoint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "VehicleStatus" NOT NULL DEFAULT 'PENDING_DISCOVERY',
    "lastSeen" TIMESTAMP(3),
    "lastUplinkCounter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Telemetry" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "uplinkCounter" INTEGER,
    "transmissionIntervalSeconds" INTEGER,
    "batteryMv" INTEGER,
    "batteryPercent" INTEGER,
    "rssi" INTEGER,
    "snr" DOUBLE PRECISION,
    "movement" TEXT,
    "speedPercent" INTEGER,
    "frontDistanceCm" INTEGER,
    "rearDistanceCm" INTEGER,
    "pitchDegrees" DOUBLE PRECISION,
    "rollDegrees" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gpsAvailable" BOOLEAN NOT NULL DEFAULT false,
    "ambientTemperatureC" DOUBLE PRECISION,
    "ambientHumidityPercent" DOUBLE PRECISION,
    "dhtAvailable" BOOLEAN NOT NULL DEFAULT false,
    "localPanicActive" BOOLEAN NOT NULL DEFAULT false,
    "remoteAlertActive" BOOLEAN NOT NULL DEFAULT false,
    "rawState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "resourcePath" TEXT NOT NULL,
    "requestedValue" JSONB NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'requested',
    "commandStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "vehicleId" UUID,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_enabled_idx" ON "User"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_deviceId_key" ON "Vehicle"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_devEui_key" ON "Vehicle"("devEui");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_lwm2mEndpoint_key" ON "Vehicle"("lwm2mEndpoint");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "Vehicle_enabled_deletedAt_idx" ON "Vehicle"("enabled", "deletedAt");

-- CreateIndex
CREATE INDEX "Vehicle_lastSeen_idx" ON "Vehicle"("lastSeen");

-- CreateIndex
CREATE INDEX "Telemetry_vehicleId_idx" ON "Telemetry"("vehicleId");

-- CreateIndex
CREATE INDEX "Telemetry_receivedAt_idx" ON "Telemetry"("receivedAt");

-- CreateIndex
CREATE INDEX "Telemetry_vehicleId_receivedAt_idx" ON "Telemetry"("vehicleId", "receivedAt");

-- CreateIndex
CREATE INDEX "Telemetry_vehicleId_uplinkCounter_idx" ON "Telemetry"("vehicleId", "uplinkCounter");

-- CreateIndex
CREATE INDEX "Operation_vehicleId_idx" ON "Operation"("vehicleId");

-- CreateIndex
CREATE INDEX "Operation_status_idx" ON "Operation"("status");

-- CreateIndex
CREATE INDEX "Operation_createdAt_idx" ON "Operation"("createdAt");

-- CreateIndex
CREATE INDEX "Operation_vehicleId_transactionId_createdAt_idx" ON "Operation"("vehicleId", "transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_vehicleId_idx" ON "Alert"("vehicleId");

-- CreateIndex
CREATE INDEX "Alert_active_severity_idx" ON "Alert"("active", "severity");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- AddForeignKey
ALTER TABLE "Telemetry" ADD CONSTRAINT "Telemetry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_acknowledgedBy_fkey" FOREIGN KEY ("acknowledgedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
