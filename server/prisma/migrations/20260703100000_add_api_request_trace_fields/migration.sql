-- AlterTable
ALTER TABLE "ApiRequestLog" ADD COLUMN "controller" TEXT,
ADD COLUMN "handler" TEXT,
ADD COLUMN "trace" JSONB;

-- CreateIndex
CREATE INDEX "ApiRequestLog_controller_handler_startedAt_idx" ON "ApiRequestLog"("controller", "handler", "startedAt");
