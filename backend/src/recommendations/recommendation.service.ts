import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  RecommendationPriority,
  RecommendationStatus,
} from '@prisma/client';
import {
  ConditionEvaluator,
  AnswerSnapshot,
  ConditionGroup,
  DisplayConditionRule,
  SingleCondition,
} from '../assessments/condition-evaluator';
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
  conditionJson?: Prisma.JsonValue | null;
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
        this.logger.warn(
          `Recommendation rule ${rule.id} has no associated template.`,
        );
        continue;
      }

      // 1. Determine target score (category-specific vs overall)
      let targetScore: number;
      const conditionJson = isObjectRecord(rule.conditionJson)
        ? rule.conditionJson
        : undefined;
      const configuredCategoryCode = conditionJson?.categoryCode;
      const categoryCode =
        rule.scoreCategory?.code ||
        (typeof configuredCategoryCode === 'string'
          ? configuredCategoryCode
          : undefined);

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
      if (conditionJson) {
        if (hasQuestionCondition(conditionJson)) {
          if (!isDisplayConditionRule(conditionJson)) {
            this.logger.warn(
              `Recommendation rule ${rule.id} has an invalid question condition.`,
            );
            continue;
          }
          const isConditionMet = ConditionEvaluator.isQuestionVisible(
            conditionJson,
            answers,
          );
          if (!isConditionMet) {
            continue;
          }
        }
      }

      // 4. Rule passed! Candidate generated
      const targetCategory = categoryCode
        ? scoringResult.categoryScores[categoryCode]
        : undefined;
      const values: Record<string, string> = {
        categoryName: targetCategory?.categoryName ?? 'Overall',
        score: targetScore.toFixed(1),
        riskLevel: targetCategory?.riskLevel ?? scoringResult.riskLevel,
        maturityLevel: scoringResult.maturityLevel,
        answeredQuestionsCount: String(
          targetCategory?.answeredQuestionsCount ??
            Object.values(scoringResult.categoryScores).reduce(
              (count, category) => count + category.answeredQuestionsCount,
              0,
            ),
        ),
        visibleQuestionsCount: String(
          targetCategory?.visibleQuestionsCount ??
            Object.values(scoringResult.categoryScores).reduce(
              (count, category) => count + category.visibleQuestionsCount,
              0,
            ),
        ),
      };
      candidates.push({
        templateId: rule.template.id,
        ruleId: rule.id,
        title: renderTemplate(rule.template.title, values),
        summary: renderTemplate(rule.template.summary, values),
        actionPlan: renderTemplate(rule.template.actionPlan, values),
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
        if (
          PRIORITY_RANK[candidate.priority] > PRIORITY_RANK[existing.priority]
        ) {
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

function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{([a-zA-Z]+)\}\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : placeholder,
  );
}

const CONDITION_OPERATORS = new Set<string>([
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'CONTAINS',
  'NOT_CONTAINS',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
]);

function hasQuestionCondition(value: Record<string, unknown>): boolean {
  return (
    'questionCode' in value ||
    'questionId' in value ||
    'conditions' in value ||
    'operator' in value
  );
}

function isDisplayConditionRule(value: unknown): value is DisplayConditionRule {
  if (!isObjectRecord(value)) return false;
  if (value.operator === 'AND' || value.operator === 'OR') {
    const group = value as Record<string, unknown> & Partial<ConditionGroup>;
    const conditionsValid =
      group.conditions === undefined ||
      (Array.isArray(group.conditions) &&
        group.conditions.every(isSingleCondition));
    const groupsValid =
      group.groups === undefined ||
      (Array.isArray(group.groups) &&
        group.groups.every(isDisplayConditionRule));
    return conditionsValid && groupsValid;
  }
  return isSingleCondition(value);
}

function isSingleCondition(value: unknown): value is SingleCondition {
  if (!isObjectRecord(value)) return false;
  if (
    typeof value.operator !== 'string' ||
    !CONDITION_OPERATORS.has(value.operator)
  ) {
    return false;
  }
  if (
    (value.questionCode !== undefined &&
      typeof value.questionCode !== 'string') ||
    (value.questionId !== undefined && typeof value.questionId !== 'string')
  ) {
    return false;
  }
  return isConditionValue(value.value);
}

function isConditionValue(
  value: unknown,
): value is SingleCondition['value'] | undefined {
  return (
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) &&
      value.every(
        (item) => typeof item === 'string' || typeof item === 'number',
      ))
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
