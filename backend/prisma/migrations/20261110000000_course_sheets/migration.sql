-- CreateTable
CREATE TABLE "course_sheets" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "columns" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_rows" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_sheets_courseId_idx" ON "course_sheets"("courseId");

-- CreateIndex
CREATE INDEX "sheet_rows_sheetId_userId_idx" ON "sheet_rows"("sheetId", "userId");

-- CreateIndex
CREATE INDEX "sheet_rows_userId_idx" ON "sheet_rows"("userId");

-- AddForeignKey
ALTER TABLE "course_sheets" ADD CONSTRAINT "course_sheets_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_rows" ADD CONSTRAINT "sheet_rows_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "course_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_rows" ADD CONSTRAINT "sheet_rows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
