-- Owner-confirmed help earns a badge instead of XP. A badge carries no amount
-- and no rank, and it gates nothing. Unique on (wallet, slug): earned once.

-- CreateTable
CREATE TABLE "HelperBadge" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "causeId" INTEGER,
    "sourceRef" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelperBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelperBadge_wallet_idx" ON "HelperBadge"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "HelperBadge_wallet_slug_key" ON "HelperBadge"("wallet", "slug");

-- The two events that paid on nothing but a cause owner's word are retired.
DELETE FROM "XpEvent" WHERE "eventType" IN ('care_help_fulfilled', 'care_translation');
