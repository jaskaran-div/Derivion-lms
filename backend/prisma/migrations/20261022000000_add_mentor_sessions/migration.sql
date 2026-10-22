-- CreateTable
CREATE TABLE "mentor_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mentorName" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "meetingLink" TEXT,
    "recordingUrl" TEXT,
    "resources" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentor_sessions_startTime_idx" ON "mentor_sessions"("startTime");

-- CreateIndex
CREATE INDEX "mentor_sessions_courseId_idx" ON "mentor_sessions"("courseId");

-- AddForeignKey
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
