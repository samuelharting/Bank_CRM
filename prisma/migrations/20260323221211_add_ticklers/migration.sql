-- CreateEnum
CREATE TYPE "TicklerRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateTable
CREATE TABLE "Tickler" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "recurrence" "TicklerRecurrence" NOT NULL DEFAULT 'NONE',
    "completedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tickler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tickler_ownerId_dueAt_idx" ON "Tickler"("ownerId", "dueAt");

-- CreateIndex
CREATE INDEX "Tickler_leadId_idx" ON "Tickler"("leadId");

-- CreateIndex
CREATE INDEX "Tickler_dueAt_idx" ON "Tickler"("dueAt");

-- AddForeignKey
ALTER TABLE "Tickler" ADD CONSTRAINT "Tickler_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tickler" ADD CONSTRAINT "Tickler_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
