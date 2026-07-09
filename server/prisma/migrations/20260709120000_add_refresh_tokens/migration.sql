ALTER TABLE "AuthSession"
ADD COLUMN "refreshTokenHash" TEXT,
ADD COLUMN "refreshExpiresAt" TIMESTAMP(3);

CREATE INDEX "AuthSession_refreshExpiresAt_idx" ON "AuthSession"("refreshExpiresAt");
