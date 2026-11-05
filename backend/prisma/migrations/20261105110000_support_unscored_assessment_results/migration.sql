ALTER TABLE "assessment_results"
  ALTER COLUMN "overallScore" DROP NOT NULL,
  ALTER COLUMN "normalizedIndex" DROP NOT NULL,
  ALTER COLUMN "maturityLevel" DROP NOT NULL;
