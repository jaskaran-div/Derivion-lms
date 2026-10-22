-- Keep payment records when a course is deleted
ALTER TABLE "payments" DROP CONSTRAINT "payments_courseId_fkey";
ALTER TABLE "payments" ALTER COLUMN "courseId" DROP NOT NULL;
ALTER TABLE "payments" ADD CONSTRAINT "payments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
