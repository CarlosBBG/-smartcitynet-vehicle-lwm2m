-- Guarantee at most one active alert of each rule type per vehicle.
ALTER TABLE "Alert" ADD COLUMN "ruleKey" TEXT;

-- Resolve older duplicates before assigning the stable key.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "vehicleId", "type"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS position
  FROM "Alert"
  WHERE "active" = true AND "vehicleId" IS NOT NULL
)
UPDATE "Alert"
SET "active" = false, "resolvedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

UPDATE "Alert"
SET "ruleKey" = CAST("vehicleId" AS TEXT) || ':' || CAST("type" AS TEXT)
WHERE "active" = true AND "vehicleId" IS NOT NULL;

CREATE UNIQUE INDEX "Alert_ruleKey_key" ON "Alert"("ruleKey");
