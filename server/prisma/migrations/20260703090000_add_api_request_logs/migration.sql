-- CreateTable
CREATE TABLE "ApiRequestLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "route" TEXT,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "query" JSONB,
    "params" JSONB,
    "body" JSONB,
    "errorName" TEXT,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiRequestLog_requestId_key" ON "ApiRequestLog"("requestId");

-- CreateIndex
CREATE INDEX "ApiRequestLog_startedAt_idx" ON "ApiRequestLog"("startedAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_workspaceId_startedAt_idx" ON "ApiRequestLog"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_userId_startedAt_idx" ON "ApiRequestLog"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_statusCode_startedAt_idx" ON "ApiRequestLog"("statusCode", "startedAt");
