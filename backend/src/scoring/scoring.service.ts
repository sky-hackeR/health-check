import { Injectable, Logger } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { ConditionEvaluator, AnswerSnapshot } from '../assessments/condition-evaluator';
import {
  CategoryScoreResult,
  ScoringCalculationResult,
  BenchmarkData,
} from './interfaces/scoring.interfaces';

export interface ScoreCategoryInput {
  id: string;
  code: string;
  name: string;
  weight: number;
}

export interface QuestionOptionInput {
  id: string;
  value: string;
  scoreValue: number;
}

export interface QuestionInput {
  id: string;
  code: string;
  title: string;
  type: QuestionType;
  weight: number;
  isRequired: boolean;
  scoreCategoryId?: string | null;
  displayConditions?: any;
  options: QuestionOptionInput[];
}

export interface ScoringRuleInput {
  id: string;
  name: string;
  scoreCategoryId?: string | null;
  conditionExpression: string; // JSON condition or threshold rule
  multiplier: number;
}

export interface CalculatorVersionScoringInput {
  calculatorSlug: string;
  categories: ScoreCategoryInput[];
  questions: QuestionInput[];
  scoringRules?: ScoringRuleInput[];
  answers: AnswerSnapshot[];
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  // Documented sector benchmarks
  private readonly BENCHMARK_REGISTRY: Record<string, BenchmarkData> = {
    'hr-health-check': {
      status: 'configured',
      source: 'GoSwiftHR 2026 Workforce Health & Readiness Index',
      segment: 'SME & Mid-Market (20–500 FTE)',
      geography: 'United Kingdom & North America',
      effectiveDate: '2026-01-01',
      industryAverageIndex: 64.5,
    },
    'turnover-retention-calculator': {
      status: 'configured',
      source: 'GoSwiftHR Talent Attrition & Voluntary Turnover Study',
      segment: 'Enterprise & Growing Companies',
      geography: 'Global / Multi-regional',
      effectiveDate: '2026-01-01',
      industryAverageIndex: 58.0,
    },
  };

  /**
   * Deterministically calculates category scores, normalized overall index, maturity level,
   * risk level, and transparent benchmark comparison.
   */
  calculateScores(input: CalculatorVersionScoringInput): ScoringCalculationResult {
    const { calculatorSlug, categories, questions, scoringRules = [], answers } = input;

    // 1. Map answers for quick lookup
    const answerMapByQuestionId = new Map<string, AnswerSnapshot>();
    for (const ans of answers) {
      answerMapByQuestionId.set(ans.questionId, ans);
    }

    // 2. Determine visibility for each question using ConditionEvaluator
    const questionVisibilityMap = new Map<string, boolean>();
    for (const q of questions) {
      const isVisible = ConditionEvaluator.isQuestionVisible(q.displayConditions, answers);
      questionVisibilityMap.set(q.id, isVisible);
    }

    // 3. Score each category
    const categoryScores: Record<string, CategoryScoreResult> = {};
    const categoryQuestionsMap = new Map<string, QuestionInput[]>();

    for (const cat of categories) {
      categoryQuestionsMap.set(cat.id, []);
    }

    // Assign questions to categories
    for (const q of questions) {
      if (q.scoreCategoryId && categoryQuestionsMap.has(q.scoreCategoryId)) {
        categoryQuestionsMap.get(q.scoreCategoryId)!.push(q);
      }
    }

    for (const cat of categories) {
      const catQuestions = categoryQuestionsMap.get(cat.id) || [];
      let rawEarned = 0;
      let rawMaxPossible = 0;
      let answeredCount = 0;
      let visibleCount = 0;

      for (const q of catQuestions) {
        const isVisible = questionVisibilityMap.get(q.id) ?? true;
        if (!isVisible) {
          // Hidden conditional questions do not count towards denominator or earned score
          continue;
        }

        visibleCount++;
        const qWeight = q.weight > 0 ? q.weight : 1.0;

        // Calculate max possible for this question
        const qMaxScore = this.calculateQuestionMaxPossible(q) * qWeight;
        rawMaxPossible += qMaxScore;

        const answer = answerMapByQuestionId.get(q.id);
        if (answer) {
          const earned = this.calculateQuestionEarnedScore(q, answer) * qWeight;
          rawEarned += earned;
          answeredCount++;
        }
      }

      // Safeguard against division by zero
      let percentage =
        rawMaxPossible > 0 ? (rawEarned / rawMaxPossible) * 100 : 0;

      const applicableRules = scoringRules.filter((r) => r.scoreCategoryId === cat.id);
      percentage = this.applyScoringRules(percentage, applicableRules, answers);

      // Bound between 0.0 and 100.0, rounded to 1 decimal place
      const normalizedCategoryScore = Math.max(0, Math.min(100, Math.round(percentage * 10) / 10));
      const riskLevel = this.determineRiskLevel(normalizedCategoryScore);

      categoryScores[cat.code] = {
        categoryId: cat.id,
        categoryCode: cat.code,
        categoryName: cat.name,
        weight: cat.weight,
        rawScore: Math.round(rawEarned * 10) / 10,
        maxPossibleScore: Math.round(rawMaxPossible * 10) / 10,
        percentage: normalizedCategoryScore,
        riskLevel,
        answeredQuestionsCount: answeredCount,
        visibleQuestionsCount: visibleCount,
      };
    }

    // 4. Calculate overall score (weighted average of category percentages)
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const cat of categories) {
      const catResult = categoryScores[cat.code];
      if (catResult) {
        const weight = cat.weight > 0 ? cat.weight : 1.0;
        totalWeightedScore += catResult.percentage * weight;
        totalWeight += weight;
      }
    }

    // Safeguard against division by zero
    let overallPercentage =
      totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

    const globalRules = scoringRules.filter((r) => !r.scoreCategoryId);
    overallPercentage = this.applyScoringRules(overallPercentage, globalRules, answers);

    const normalizedIndex = Math.max(0, Math.min(100, Math.round(overallPercentage * 10) / 10));
    const maturityLevel = this.determineMaturityLevel(normalizedIndex);
    const overallRisk = this.determineRiskLevel(normalizedIndex);

    // 5. Build benchmark comparison
    const registeredBenchmark = this.BENCHMARK_REGISTRY[calculatorSlug];
    let benchmarkComparison: BenchmarkData;

    if (registeredBenchmark && registeredBenchmark.status === 'configured') {
      const avg = registeredBenchmark.industryAverageIndex || 60.0;
      benchmarkComparison = {
        ...registeredBenchmark,
        variance: Math.round((normalizedIndex - avg) * 10) / 10,
      };
    } else {
      benchmarkComparison = {
        status: 'unconfigured',
        message: 'No validated historical benchmark segment configured for this calculator.',
      };
    }

    return {
      overallScore: normalizedIndex,
      normalizedIndex,
      maturityLevel,
      riskLevel: overallRisk,
      categoryScores,
      benchmarkComparison,
      calculatedAt: new Date(),
    };
  }

  /**
   * Computes the maximum possible score an answered question could achieve.
   */
  private calculateQuestionMaxPossible(question: QuestionInput): number {
    if (
      question.type === QuestionType.SINGLE_CHOICE ||
      question.type === QuestionType.BOOLEAN
    ) {
      return 100;
    }

    if (
      question.type === QuestionType.NUMERIC_INPUT ||
      question.type === QuestionType.SLIDER
    ) {
      if (question.options && question.options.length > 0) {
        const maxOpt = Math.max(...question.options.map((o) => o.scoreValue || 0));
        return maxOpt > 0 ? maxOpt : 100;
      }
      return 100;
    }

    return 100;
  }

  private applyScoringRules(
    baseScore: number,
    rules: ScoringRuleInput[],
    answers: AnswerSnapshot[],
  ): number {
    let adjustedScore = baseScore;

    for (const rule of rules) {
      if (!Number.isFinite(rule.multiplier) || rule.multiplier < 0) {
        throw new Error(
          `Scoring rule "${rule.name}" must have a finite, non-negative multiplier.`,
        );
      }

      if (this.evaluateScoringRuleCondition(rule.conditionExpression, baseScore, answers)) {
        adjustedScore *= rule.multiplier;
      }
    }

    return adjustedScore;
  }

  /**
   * Computes the earned score for an answered question.
   */
  private calculateQuestionEarnedScore(
    question: QuestionInput,
    answer: AnswerSnapshot,
  ): number {
    if (
      question.type === QuestionType.SINGLE_CHOICE ||
      question.type === QuestionType.BOOLEAN
    ) {
      if (answer.selectedOptionId) {
        const option = question.options.find((o) => o.id === answer.selectedOptionId);
        if (option) return option.scoreValue || 0;
      }
      if (answer.selectedOptionValue) {
        const option = question.options.find((o) => o.value === answer.selectedOptionValue);
        if (option) return option.scoreValue || 0;
      }
      return 0;
    }

    if (
      question.type === QuestionType.NUMERIC_INPUT ||
      question.type === QuestionType.SLIDER
    ) {
      if (answer.numericValue !== null && answer.numericValue !== undefined) {
        // If question has options acting as benchmark bands (e.g. 1-25 FTE = 25 score)
        if (question.options && question.options.length > 0) {
          const val = Number(answer.numericValue);
          const sorted = [...question.options].sort((a, b) => (a.scoreValue || 0) - (b.scoreValue || 0));
          const match = sorted.find((o) => val <= (o.scoreValue || 0)) || sorted[sorted.length - 1];
          return match?.scoreValue || val;
        }
        return Math.min(100, Math.max(0, Number(answer.numericValue)));
      }
    }

    return 0;
  }

  /**
   * Evaluates dynamic ScoringRule condition expressions (e.g. "SCORE < 40" or JSON condition).
   */
  private evaluateScoringRuleCondition(
    expression: string,
    currentScore: number,
    answers: AnswerSnapshot[],
  ): boolean {
    if (!expression || expression.trim() === '') return false;

    try {
      // 1. Try parsing as JSON condition
      if (expression.startsWith('{')) {
        const parsed = JSON.parse(expression);
        if (parsed.minScore !== undefined && currentScore < parsed.minScore) return false;
        if (parsed.maxScore !== undefined && currentScore > parsed.maxScore) return false;
        if (parsed.questionCondition) {
          return ConditionEvaluator.isQuestionVisible(parsed.questionCondition, answers);
        }
        return true;
      }

      // 2. Simple expression syntax e.g. "SCORE < 50"
      const match = expression.match(/SCORE\s*(<|<=|>|>=|==)\s*(\d+(\.\d+)?)/i);
      if (match) {
        const op = match[1];
        const val = parseFloat(match[2]);
        switch (op) {
          case '<': return currentScore < val;
          case '<=': return currentScore <= val;
          case '>': return currentScore > val;
          case '>=': return currentScore >= val;
          case '==': return currentScore === val;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to evaluate scoring rule condition: ${expression}`);
    }

    return false;
  }

  /**
   * GoSwiftHR Maturity Bands:
   * 0 - 39.9%: Foundational
   * 40 - 59.9%: Emerging
   * 60 - 79.9%: Advancing
   * 80 - 100%: Optimized
   */
  determineMaturityLevel(score: number): 'Foundational' | 'Emerging' | 'Advancing' | 'Optimized' {
    if (score < 40.0) return 'Foundational';
    if (score < 60.0) return 'Emerging';
    if (score < 80.0) return 'Advancing';
    return 'Optimized';
  }

  /**
   * Risk Level Thresholds:
   * < 40.0%: CRITICAL risk
   * 40.0 - 59.9%: HIGH risk
   * 60.0 - 79.9%: MODERATE risk
   * >= 80.0%: LOW risk
   */
  determineRiskLevel(score: number): 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
    if (score < 40.0) return 'CRITICAL';
    if (score < 60.0) return 'HIGH';
    if (score < 80.0) return 'MODERATE';
    return 'LOW';
  }
}
