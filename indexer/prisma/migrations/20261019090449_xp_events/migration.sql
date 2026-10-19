-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "causeId" INTEGER,
    "proofUrl" TEXT,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XpEvent_wallet_idx" ON "XpEvent"("wallet");

-- CreateIndex
CREATE INDEX "XpEvent_state_idx" ON "XpEvent"("state");

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_eventType_sourceRef_key" ON "XpEvent"("eventType", "sourceRef");
