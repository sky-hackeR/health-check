ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'WALKTHROUGH_SCHEDULED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'DISQUALIFIED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'LOST';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'CALL_RECORDED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'EMAIL_RECORDED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'MEETING_RECORDED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_CREATED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_COMPLETED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_RESCHEDULED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_CANCELLED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'WALKTHROUGH_SCHEDULED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'WALKTHROUGH_RESCHEDULED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'WALKTHROUGH_COMPLETED';
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'WALKTHROUGH_CANCELLED';

CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'CALCULATOR', 'CAMPAIGN', 'REFERRAL', 'OTHER');
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED');
CREATE TYPE "FollowUpMethod" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'OTHER');

ALTER TABLE "leads"
  ADD COLUMN "source" "LeadSource" NOT NULL DEFAULT 'WEBSITE',
  ADD COLUMN "assignedAdminId" TEXT;

ALTER TABLE "lead_activities"
  ADD COLUMN "actorAdminId" TEXT;

ALTER TABLE "walkthrough_requests"
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "outcome" TEXT;

CREATE TABLE "follow_ups" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "assignedAdminId" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "method" "FollowUpMethod" NOT NULL,
  "notes" TEXT NOT NULL,
  "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_source_idx" ON "leads"("source");
CREATE INDEX "leads_assignedAdminId_idx" ON "leads"("assignedAdminId");
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "lead_activities"("leadId", "createdAt");
CREATE INDEX "lead_activities_actorAdminId_idx" ON "lead_activities"("actorAdminId");
CREATE INDEX "follow_ups_leadId_dueAt_idx" ON "follow_ups"("leadId", "dueAt");
CREATE INDEX "follow_ups_status_dueAt_idx" ON "follow_ups"("status", "dueAt");
CREATE INDEX "follow_ups_assignedAdminId_status_idx" ON "follow_ups"("assignedAdminId", "status");

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lead_activities"
  ADD CONSTRAINT "lead_activities_actorAdminId_fkey"
  FOREIGN KEY ("actorAdminId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "follow_ups"
  ADD CONSTRAINT "follow_ups_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "follow_ups_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "follow_ups_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
