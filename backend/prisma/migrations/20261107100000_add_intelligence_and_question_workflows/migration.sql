CREATE TYPE "ColdEmailTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "questions"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "calculationKey" TEXT,
ADD COLUMN "validationRules" JSONB,
ADD COLUMN "defaultValue" JSONB;

CREATE TABLE "company_pain_points" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "versionGroupId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "businessImpact" TEXT NOT NULL,
    "calculatorSlug" TEXT NOT NULL,
    "detectionRule" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "RecommendationPriority" NOT NULL DEFAULT 'MEDIUM',
    "suggestedSolution" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pain_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_pain_points" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "companyPainPointId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "businessImpact" TEXT NOT NULL,
    "calculatorSlug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "RecommendationPriority" NOT NULL,
    "suggestedSolution" TEXT,
    "triggeredAnswers" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_pain_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cold_email_templates" (
    "id" TEXT NOT NULL,
    "versionGroupId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "description" TEXT,
    "internalNotes" TEXT,
    "applicablePainPointCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ColdEmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cold_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_pain_points_versionGroupId_versionNumber_key"
ON "company_pain_points"("versionGroupId", "versionNumber");
CREATE INDEX "company_pain_points_calculatorSlug_isActive_publishedAt_idx"
ON "company_pain_points"("calculatorSlug", "isActive", "publishedAt");
CREATE INDEX "company_pain_points_code_idx"
ON "company_pain_points"("code");
CREATE UNIQUE INDEX "assessment_pain_points_assessmentId_companyPainPointId_key"
ON "assessment_pain_points"("assessmentId", "companyPainPointId");
CREATE INDEX "assessment_pain_points_assessmentId_idx"
ON "assessment_pain_points"("assessmentId");
CREATE INDEX "assessment_pain_points_code_idx"
ON "assessment_pain_points"("code");
CREATE UNIQUE INDEX "cold_email_templates_versionGroupId_versionNumber_key"
ON "cold_email_templates"("versionGroupId", "versionNumber");
CREATE INDEX "cold_email_templates_status_updatedAt_idx"
ON "cold_email_templates"("status", "updatedAt");

ALTER TABLE "assessment_pain_points"
ADD CONSTRAINT "assessment_pain_points_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_pain_points"
ADD CONSTRAINT "assessment_pain_points_companyPainPointId_fkey"
FOREIGN KEY ("companyPainPointId") REFERENCES "company_pain_points"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
