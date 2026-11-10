-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "accessEndDate" TIMESTAMP(3),
ADD COLUMN     "accessMonths" INTEGER;

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "expiresAt" TIMESTAMP(3);
