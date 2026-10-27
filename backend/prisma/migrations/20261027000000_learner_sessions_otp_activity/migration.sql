-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ACTIVITY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "activeSessionId" TEXT,
ADD COLUMN "emailOtpAttempts" INTEGER NOT NULL DEFAULT 0;
