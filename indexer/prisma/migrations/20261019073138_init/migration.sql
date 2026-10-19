-- CreateTable
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cause" (
    "id" INTEGER NOT NULL,
    "chainId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "payout" TEXT NOT NULL,
    "lister" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'listed',
    "listedAt" TIMESTAMP(3) NOT NULL,
    "waitingSince" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "requiresCareLicence" BOOLEAN NOT NULL DEFAULT false,
    "listedVia" TEXT NOT NULL,
    "profile" JSONB,
    "photoUrl" TEXT,
    "givenUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "giversCount" INTEGER NOT NULL DEFAULT 0,
    "listingRewarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimState" (
    "causeId" INTEGER NOT NULL,
    "claimType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'open',
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'open',
    "votingStart" TIMESTAMP(3),
    "votingEnd" TIMESTAMP(3),
    "challengeWindowEnd" TIMESTAMP(3),
    "resultRoot" TEXT,
    "finalisedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimState_pkey" PRIMARY KEY ("causeId","claimType")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "claimType" TEXT NOT NULL,
    "uploader" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "mime" TEXT,
    "size" INTEGER,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "redactionConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Path" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "claimType" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeAgreed" BOOLEAN,

    CONSTRAINT "Path_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "claimType" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "voter" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "signature" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeAgreed" BOOLEAN,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "claimType" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "challenger" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomepageFlag" (
    "causeId" INTEGER NOT NULL,
    "shown" BOOLEAN NOT NULL DEFAULT false,
    "setBy" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stewardHiddenReason" TEXT,
    "stewardHiddenBy" TEXT,
    "stewardHiddenAt" TIMESTAMP(3),

    CONSTRAINT "HomepageFlag_pkey" PRIMARY KEY ("causeId")
);

-- CreateTable
CREATE TABLE "UrgentAppeal" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "setBy" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "clearedBy" TEXT,

    CONSTRAINT "UrgentAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareEvent" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "usd" DECIMAL(18,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "block" BIGINT NOT NULL,
    "tradeId" TEXT,
    "kytState" TEXT NOT NULL DEFAULT 'unknown',
    "ledgerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CauseWallet" (
    "causeId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "privyWalletId" TEXT,
    "delegated" BOOLEAN NOT NULL DEFAULT false,
    "treasuryMode" TEXT NOT NULL DEFAULT 'manual',
    "targetToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CauseWallet_pkey" PRIMARY KEY ("causeId")
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "fromToken" TEXT NOT NULL,
    "toToken" TEXT NOT NULL,
    "amountIn" TEXT NOT NULL,
    "amountOut" TEXT,
    "quoteId" TEXT,
    "tradeId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'quoted',
    "txHash" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'owner',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "txHash" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "embedUrl" TEXT,
    "provider" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "credit" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "fileHash" TEXT,
    "mime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftTrade" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "giver" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "fromToken" TEXT NOT NULL,
    "toToken" TEXT NOT NULL,
    "amountRaw" TEXT NOT NULL,
    "quote" JSONB NOT NULL,
    "tradeId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'quoted',
    "txHash" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "GiftTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceTag" TEXT NOT NULL DEFAULT 'charity',
    "sourceRef" TEXT NOT NULL,
    "causeId" INTEGER,
    "multipliers" JSONB,
    "state" TEXT NOT NULL DEFAULT 'credited',
    "gseraRef" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reputation" (
    "wallet" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Reputation_pkey" PRIMARY KEY ("wallet")
);

-- CreateTable
CREATE TABLE "ReputationEntry" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "address" TEXT NOT NULL,
    "kytState" TEXT NOT NULL DEFAULT 'unknown',
    "kytCheckedAt" TIMESTAMP(3),
    "kytReasons" JSONB,
    "privyUserId" TEXT,
    "email" TEXT,
    "leaderboardOptOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "Need" (
    "id" INTEGER NOT NULL,
    "causeId" INTEGER NOT NULL,
    "uri" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "open" BOOLEAN NOT NULL DEFAULT true,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "helper" TEXT,
    "closedAt" TIMESTAMP(3),
    "confirmedHelper" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmSignature" TEXT,

    CONSTRAINT "Need_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pledge" (
    "id" TEXT NOT NULL,
    "needId" INTEGER NOT NULL,
    "helper" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "Pledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Progress" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "body" JSONB,
    "at" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "Progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER NOT NULL,
    "attester" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "body" JSONB,
    "at" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordEvent" (
    "id" TEXT NOT NULL,
    "causeId" INTEGER,
    "type" TEXT NOT NULL,
    "block" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "RecordEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 6,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "accepted" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "ChainRole" (
    "address" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChainRole_pkey" PRIMARY KEY ("address","role")
);

-- CreateTable
CREATE TABLE "StoredProfile" (
    "hash" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredProfile_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "MockGseraWallet" (
    "wallet" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockGseraWallet_pkey" PRIMARY KEY ("wallet")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "causeId" INTEGER,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cause_status_idx" ON "Cause"("status");

-- CreateIndex
CREATE INDEX "Cause_category_idx" ON "Cause"("category");

-- CreateIndex
CREATE INDEX "Cause_slug_idx" ON "Cause"("slug");

-- CreateIndex
CREATE INDEX "Cause_owner_idx" ON "Cause"("owner");

-- CreateIndex
CREATE INDEX "ClaimState_state_idx" ON "ClaimState"("state");

-- CreateIndex
CREATE INDEX "Evidence_causeId_claimType_idx" ON "Evidence"("causeId", "claimType");

-- CreateIndex
CREATE INDEX "Evidence_fileHash_idx" ON "Evidence"("fileHash");

-- CreateIndex
CREATE INDEX "Path_author_idx" ON "Path"("author");

-- CreateIndex
CREATE UNIQUE INDEX "Path_causeId_claimType_epoch_author_key" ON "Path"("causeId", "claimType", "epoch", "author");

-- CreateIndex
CREATE INDEX "Vote_voter_idx" ON "Vote"("voter");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_causeId_claimType_epoch_voter_key" ON "Vote"("causeId", "claimType", "epoch", "voter");

-- CreateIndex
CREATE INDEX "Challenge_state_idx" ON "Challenge"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_causeId_claimType_epoch_challenger_key" ON "Challenge"("causeId", "claimType", "epoch", "challenger");

-- CreateIndex
CREATE INDEX "UrgentAppeal_causeId_idx" ON "UrgentAppeal"("causeId");

-- CreateIndex
CREATE INDEX "ShareEvent_causeId_idx" ON "ShareEvent"("causeId");

-- CreateIndex
CREATE INDEX "Gift_sender_idx" ON "Gift"("sender");

-- CreateIndex
CREATE INDEX "Gift_causeId_sender_idx" ON "Gift"("causeId", "sender");

-- CreateIndex
CREATE INDEX "Gift_causeId_createdAt_idx" ON "Gift"("causeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Gift_txHash_logIndex_key" ON "Gift"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "CauseWallet_address_idx" ON "CauseWallet"("address");

-- CreateIndex
CREATE INDEX "Conversion_causeId_idx" ON "Conversion"("causeId");

-- CreateIndex
CREATE INDEX "Conversion_state_idx" ON "Conversion"("state");

-- CreateIndex
CREATE INDEX "Withdrawal_causeId_idx" ON "Withdrawal"("causeId");

-- CreateIndex
CREATE INDEX "Media_causeId_position_idx" ON "Media"("causeId", "position");

-- CreateIndex
CREATE INDEX "GiftTrade_state_idx" ON "GiftTrade"("state");

-- CreateIndex
CREATE INDEX "GiftTrade_giver_causeId_idx" ON "GiftTrade"("giver", "causeId");

-- CreateIndex
CREATE INDEX "LedgerEntry_wallet_idx" ON "LedgerEntry"("wallet");

-- CreateIndex
CREATE INDEX "LedgerEntry_state_idx" ON "LedgerEntry"("state");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reason_sourceRef_wallet_key" ON "LedgerEntry"("reason", "sourceRef", "wallet");

-- CreateIndex
CREATE INDEX "ReputationEntry_wallet_idx" ON "ReputationEntry"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationEntry_reason_sourceRef_wallet_key" ON "ReputationEntry"("reason", "sourceRef", "wallet");

-- CreateIndex
CREATE INDEX "Need_causeId_idx" ON "Need"("causeId");

-- CreateIndex
CREATE INDEX "Pledge_helper_idx" ON "Pledge"("helper");

-- CreateIndex
CREATE UNIQUE INDEX "Pledge_txHash_logIndex_key" ON "Pledge"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "Progress_causeId_idx" ON "Progress"("causeId");

-- CreateIndex
CREATE UNIQUE INDEX "Progress_txHash_logIndex_key" ON "Progress"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "Attestation_causeId_idx" ON "Attestation"("causeId");

-- CreateIndex
CREATE UNIQUE INDEX "Attestation_txHash_logIndex_key" ON "Attestation"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "RecordEvent_causeId_at_idx" ON "RecordEvent"("causeId", "at");

-- CreateIndex
CREATE INDEX "RecordEvent_type_at_idx" ON "RecordEvent"("type", "at");

-- CreateIndex
CREATE UNIQUE INDEX "RecordEvent_txHash_logIndex_key" ON "RecordEvent"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "Notification_wallet_createdAt_idx" ON "Notification"("wallet", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_state_idx" ON "EmailOutbox"("state");

-- AddForeignKey
ALTER TABLE "ClaimState" ADD CONSTRAINT "ClaimState_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Path" ADD CONSTRAINT "Path_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomepageFlag" ADD CONSTRAINT "HomepageFlag_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrgentAppeal" ADD CONSTRAINT "UrgentAppeal_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareEvent" ADD CONSTRAINT "ShareEvent_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CauseWallet" ADD CONSTRAINT "CauseWallet_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Need" ADD CONSTRAINT "Need_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pledge" ADD CONSTRAINT "Pledge_needId_fkey" FOREIGN KEY ("needId") REFERENCES "Need"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Progress" ADD CONSTRAINT "Progress_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEvent" ADD CONSTRAINT "RecordEvent_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "Cause"("id") ON DELETE SET NULL ON UPDATE CASCADE;
