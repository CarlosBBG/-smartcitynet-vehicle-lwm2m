-- Store a stable identifier for operations imported from the Bridge.
ALTER TABLE "Operation" ADD COLUMN "bridgeKey" TEXT;

CREATE UNIQUE INDEX "Operation_bridgeKey_key" ON "Operation"("bridgeKey");
