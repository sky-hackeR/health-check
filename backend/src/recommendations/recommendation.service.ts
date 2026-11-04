import { Injectable, Logger } from '@nestjs/common';
import { RecommendationPriority, RecommendationStatus } from '@prisma/client';
import { ConditionEvaluator, AnswerSnapshot } from '../assessments/condition-evaluator';
import { ScoringCalculationResult } from '../scoring/interfaces/scoring.interfaces';

export interface RecommendationTemplateSnapshot {
  id: string;
  code: string;
  title: string;
  summary: string;
  actionPlan: string;
  priority: RecommendationPriority;
  serviceLink?: string | null;
}

export interface RecommendationRuleSnapshot {
  id: string;
  templateId: string;
  template: RecommendationTemplateSnapshot;
  scoreCategoryId?: string | null;
  scoreCategory?: { id: string; code: string; name: string } | null;
  minScore?: number | null;
  maxScore?: number | null;
  conditionJson?: any;
}

export interface GeneratedRecommendation {
  templateId: string;
  ruleId?: string | null;
  title: string;
  summary: string;
  actionPlan: string;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  serviceLink?: string | null;
}

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  [RecommendationPriority.CRITICAL]: 4,
  [RecommendationPriority.HIGH]: 3,
  [RecommendationPriority.MEDIUM]: 2,
  [RecommendationPriority.LOW]: 1,
};

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  /**
   * Evaluates rules against scored assessment results and answers.
   * Produces deduplicated, priority-ordered recommendation snapshots.
   */
  evaluateRecommendations(
    rules: RecommendationRuleSnapshot[],
    scoringResult: ScoringCalculationResult,
    answers: AnswerSnapshot[],
  ): GeneratedRecommendation[] {
    const candidates: GeneratedRecommendation[] = [];

    for (const rule of rules) {
      if (!rule.template) {
        this.logger.warn(`Recommendation rule ${rule.id} has no associated template.`);
        continue;
      }

      // 1. Determine target score (category-specific vs overall)
      let targetScore: number;
      const categoryCode =
        rule.scoreCategory?.code || rule.conditionJson?.categoryCode;

      if (categoryCode) {
        const catResult = scoringResult.categoryScores[categoryCode];
        if (!catResult) {
          // Category not present in this assessment
          continue;
        }
        targetScore = catResult.percentage;
      } else {
        targetScore = scoringResult.normalizedIndex;
      }

      // 2. Evaluate score thresholds (minScore & maxScore)
      if (rule.minScore !== null && rule.minScore !== undefined) {
        if (targetScore < rule.minScore) {
          continue;
        }
      }
      if (rule.maxScore !== null && rule.maxScore !== undefined) {
        if (targetScore > rule.maxScore) {
          continue;
        }
      }

      // 3. Evaluate any question-specific conditions in conditionJson
      if (rule.conditionJson) {
        // If conditionJson specifies question logic, evaluate with ConditionEvaluator
        if (
          rule.conditionJson.questionCode ||
          rule.conditionJson.questionId ||
          rule.conditionJson.conditions ||
          rule.conditionJson.operator
        ) {
          const isConditionMet = ConditionEvaluator.isQuestionVisible(
            rule.conditionJson,
            answers,
          );
          if (!isConditionMet) {
            continue;
          }
        }
      }

      // 4. Rule passed! Candidate generated
      candidates.push({
        templateId: rule.template.id,
        ruleId: rule.id,
        title: rule.template.title,
        summary: rule.template.summary,
        actionPlan: rule.template.actionPlan,
        priority: rule.template.priority,
        status: RecommendationStatus.PROPOSED,
        serviceLink: rule.template.serviceLink,
      });
    }

    // 5. Deduplicate candidates by templateId (keeping highest priority)
    const deduplicatedMap = new Map<string, GeneratedRecommendation>();

    for (const candidate of candidates) {
      const existing = deduplicatedMap.get(candidate.templateId);
      if (!existing) {
        deduplicatedMap.set(candidate.templateId, candidate);
      } else {
        // If current candidate has higher priority, replace
        if (PRIORITY_RANK[candidate.priority] > PRIORITY_RANK[existing.priority]) {
          deduplicatedMap.set(candidate.templateId, candidate);
        }
      }
    }

    // 6. Sort recommendations descending by priority (CRITICAL -> HIGH -> MEDIUM -> LOW)
    return Array.from(deduplicatedMap.values()).sort(
      (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
    );
  }
}
