-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "displayConditions" JSONB;
