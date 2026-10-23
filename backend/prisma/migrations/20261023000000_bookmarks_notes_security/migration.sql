-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundId" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifyExpiry" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "course_bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_bookmarks_userId_courseId_key" ON "course_bookmarks"("userId", "courseId");

-- CreateIndex
CREATE INDEX "lesson_notes_userId_contentId_idx" ON "lesson_notes"("userId", "contentId");
-- AddForeignKey
ALTER TABLE "course_bookmarks"
ADD CONSTRAINT "course_bookmarks_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_bookmarks"
ADD CONSTRAINT "course_bookmarks_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "courses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes"
ADD CONSTRAINT "lesson_notes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_notes"
ADD CONSTRAINT "lesson_notes_contentId_fkey"
FOREIGN KEY ("contentId") REFERENCES "contents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
