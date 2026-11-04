import { RecommendationService, RecommendationRuleSnapshot } from './recommendation.service';
import { RecommendationPriority, RecommendationStatus } from '@prisma/client';
import { ScoringCalculationResult } from '../scoring/interfaces/scoring.interfaces';

describe('RecommendationService (Recommendation Engine)', () => {
  let service: RecommendationService;

  beforeEach(() => {
    service = new RecommendationService();
  });

  const mockScoringResult: ScoringCalculationResult = {
    overallScore: 45.0,
    normalizedIndex: 45.0,
    maturityLevel: 'Emerging',
    riskLevel: 'HIGH',
    categoryScores: {
      COMPLIANCE: {
        categoryId: 'cat-comp',
        categoryCode: 'COMPLIANCE',
        categoryName: 'Compliance',
        weight: 1.0,
        rawScore: 30,
        maxPossibleScore: 100,
        percentage: 30.0,
        riskLevel: 'CRITICAL',
        answeredQuestionsCount: 1,
        visibleQuestionsCount: 1,
      },
      RETENTION: {
        categoryId: 'cat-ret',
        categoryCode: 'RETENTION',
        categoryName: 'Retention',
        weight: 1.0,
        rawScore: 80,
        maxPossibleScore: 100,
        percentage: 80.0,
        riskLevel: 'LOW',
        answeredQuestionsCount: 1,
        visibleQuestionsCount: 1,
      },
    },
    benchmarkComparison: { status: 'configured', variance: -19.5 },
    calculatedAt: new Date(),
  };

  it('should trigger category-specific recommendations when category score is below maxScore', () => {
    const rules: RecommendationRuleSnapshot[] = [
      {
        id: 'rule-comp',
        templateId: 'tmpl-comp',
        scoreCategory: { id: 'cat-comp', code: 'COMPLIANCE', name: 'Compliance' },
        maxScore: 50.0, // 30.0 <= 50.0 -> TRIGGERS
        template: {
          id: 'tmpl-comp',
          code: 'REC_COMPLIANCE_AUDIT',
          title: 'Immediate Compliance Audit Required',
          summary: 'Critical exposure detected.',
          actionPlan: 'Execute review.',
          priority: RecommendationPriority.CRITICAL,
          serviceLink: 'https://goswifthr.com/compliance',
        },
      },
      {
        id: 'rule-ret',
        templateId: 'tmpl-ret',
        scoreCategory: { id: 'cat-ret', code: 'RETENTION', name: 'Retention' },
        maxScore: 50.0, // 80.0 > 50.0 -> DOES NOT TRIGGER
        template: {
          id: 'tmpl-ret',
          code: 'REC_RETENTION',
          title: 'Retention Program',
          summary: 'Mitigate turnover.',
          actionPlan: 'Stay interviews.',
          priority: RecommendationPriority.HIGH,
        },
      },
    ];

    const results = service.evaluateRecommendations(rules, mockScoringResult, []);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Immediate Compliance Audit Required');
    expect(results[0].priority).toBe(RecommendationPriority.CRITICAL);
    expect(results[0].status).toBe(RecommendationStatus.PROPOSED);
  });

  it('should evaluate custom question answers inside conditionJson', () => {
    const rules: RecommendationRuleSnapshot[] = [
      {
        id: 'rule-audit-age',
        templateId: 'tmpl-audit',
        conditionJson: {
          questionCode: 'Q_AUDIT',
          operator: 'EQUALS',
          value: 'over_2_years',
        },
        template: {
          id: 'tmpl-audit',
          code: 'REC_OVERDUE_AUDIT',
          title: 'Overdue Policy Refresh',
          summary: 'Policies exceed 24 months without legal review.',
          actionPlan: 'Update employee handbook.',
          priority: RecommendationPriority.HIGH,
        },
      },
    ];

    // Case 1: Answer matches condition
    const matchingResults = service.evaluateRecommendations(rules, mockScoringResult, [
      { questionId: 'q-audit', questionCode: 'Q_AUDIT', selectedOptionValue: 'over_2_years' },
    ]);
    expect(matchingResults).toHaveLength(1);

    // Case 2: Answer does NOT match condition
    const nonMatchingResults = service.evaluateRecommendations(rules, mockScoringResult, [
      { questionId: 'q-audit', questionCode: 'Q_AUDIT', selectedOptionValue: '12_months' },
    ]);
    expect(nonMatchingResults).toHaveLength(0);
  });

  it('should deduplicate multiple rules matching the same template, keeping the highest priority', () => {
    const rules: RecommendationRuleSnapshot[] = [
      {
        id: 'rule-1',
        templateId: 'tmpl-common',
        maxScore: 70.0,
        template: {
          id: 'tmpl-common',
          code: 'REC_COMMON',
          title: 'Unified HR Management',
          summary: 'Summary A',
          actionPlan: 'Plan A',
          priority: RecommendationPriority.MEDIUM,
        },
      },
      {
        id: 'rule-2',
        templateId: 'tmpl-common',
        maxScore: 50.0,
        template: {
          id: 'tmpl-common',
          code: 'REC_COMMON',
          title: 'Unified HR Management (Urgent)',
          summary: 'Summary Urgent',
          actionPlan: 'Plan Urgent',
          priority: RecommendationPriority.CRITICAL, // HIGHER PRIORITY
        },
      },
    ];

    const results = service.evaluateRecommendations(rules, mockScoringResult, []);

    expect(results).toHaveLength(1);
    expect(results[0].priority).toBe(RecommendationPriority.CRITICAL);
    expect(results[0].title).toBe('Unified HR Management (Urgent)');
  });

  it('should sort recommendations in descending priority order (CRITICAL > HIGH > MEDIUM > LOW)', () => {
    const rules: RecommendationRuleSnapshot[] = [
      {
        id: 'r1',
        templateId: 't1',
        maxScore: 100,
        template: {
          id: 't1',
          code: 'T1',
          title: 'Medium Item',
          summary: 'S',
          actionPlan: 'A',
          priority: RecommendationPriority.MEDIUM,
        },
      },
      {
        id: 'r2',
        templateId: 't2',
        maxScore: 100,
        template: {
          id: 't2',
          code: 'T2',
          title: 'Critical Item',
          summary: 'S',
          actionPlan: 'A',
          priority: RecommendationPriority.CRITICAL,
        },
      },
      {
        id: 'r3',
        templateId: 't3',
        maxScore: 100,
        template: {
          id: 't3',
          code: 'T3',
          title: 'High Item',
          summary: 'S',
          actionPlan: 'A',
          priority: RecommendationPriority.HIGH,
        },
      },
      {
        id: 'r4',
        templateId: 't4',
        maxScore: 100,
        template: {
          id: 't4',
          code: 'T4',
          title: 'Low Item',
          summary: 'S',
          actionPlan: 'A',
          priority: RecommendationPriority.LOW,
        },
      },
    ];

    const results = service.evaluateRecommendations(rules, mockScoringResult, []);

    expect(results).toHaveLength(4);
    expect(results[0].priority).toBe(RecommendationPriority.CRITICAL);
    expect(results[1].priority).toBe(RecommendationPriority.HIGH);
    expect(results[2].priority).toBe(RecommendationPriority.MEDIUM);
    expect(results[3].priority).toBe(RecommendationPriority.LOW);
  });
});
