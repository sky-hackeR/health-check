-- AlterTable
ALTER TABLE "recommendation_rules" ADD COLUMN     "scoreCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "recommendation_rules_scoreCategoryId_idx" ON "recommendation_rules"("scoreCategoryId");

-- AddForeignKey
ALTER TABLE "recommendation_rules" ADD CONSTRAINT "recommendation_rules_scoreCategoryId_fkey" FOREIGN KEY ("scoreCategoryId") REFERENCES "score_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
