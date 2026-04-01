-- CreateTable
CREATE TABLE "ScrapeJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "niche" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "radius" TEXT NOT NULL,
    "maxDepth" INTEGER NOT NULL,
    "claimedBy" TEXT,
    "claimedAt" DATETIME,
    "heartbeatAt" DATETIME,
    "errorMessage" TEXT,
    "statsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ScrapeJobEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrapeJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScrapeJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScrapeJob_actorUserId_createdAt_idx" ON "ScrapeJob"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapeJob_status_createdAt_idx" ON "ScrapeJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapeJob_claimedBy_idx" ON "ScrapeJob"("claimedBy");

-- CreateIndex
CREATE INDEX "ScrapeJob_heartbeatAt_idx" ON "ScrapeJob"("heartbeatAt");

-- CreateIndex
CREATE INDEX "ScrapeJobEvent_jobId_id_idx" ON "ScrapeJobEvent"("jobId", "id");
