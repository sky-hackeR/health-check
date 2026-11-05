ALTER TABLE "recommendation_templates"
ADD COLUMN "versionGroupId" TEXT,
ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "recommendation_templates"
SET
  "versionGroupId" = "id",
  "publishedAt" = "createdAt";

ALTER TABLE "recommendation_templates"
ALTER COLUMN "versionGroupId" SET NOT NULL;

CREATE UNIQUE INDEX "recommendation_templates_versionGroupId_versionNumber_key"
ON "recommendation_templates"("versionGroupId", "versionNumber");

CREATE INDEX "recommendation_templates_versionGroupId_isPublished_idx"
ON "recommendation_templates"("versionGroupId", "isPublished");
