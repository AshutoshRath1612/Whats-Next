ALTER TABLE "TimeEntry" ADD COLUMN "durationSec" INTEGER NOT NULL DEFAULT 0;

UPDATE "TimeEntry"
SET "durationSec" = "durationMin" * 60
WHERE "durationMin" > 0 AND "durationSec" = 0;
