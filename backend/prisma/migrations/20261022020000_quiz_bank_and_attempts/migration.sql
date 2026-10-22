-- DropForeignKey
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_courseId_fkey";

-- AlterTable
ALTER TABLE "assessment_attempts" ADD COLUMN     "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "earnedPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "questionOrder" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "tabSwitches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPoints" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "score" SET DEFAULT 0,
ALTER COLUMN "isPassed" SET DEFAULT false,
ALTER COLUMN "answers" SET DEFAULT '{}',
ALTER COLUMN "completedAt" DROP NOT NULL,
ALTER COLUMN "completedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "assessments" ALTER COLUMN "type" SET DEFAULT 'QUIZ',
ALTER COLUMN "courseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "contents" ADD COLUMN     "assessmentId" TEXT;

-- CreateIndex
CREATE INDEX "contents_assessmentId_idx" ON "contents"("assessmentId");

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

