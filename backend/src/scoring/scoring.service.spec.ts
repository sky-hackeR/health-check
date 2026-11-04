import { ScoringService } from './scoring.service';
import { QuestionType } from '@prisma/client';

describe('ScoringService (Deterministic Scoring Engine)', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  it('should calculate category and overall weighted scores accurately', () => {
    const result = service.calculateScores({
      calculatorSlug: 'hr-health-check',
      categories: [
        { id: 'cat-1', code: 'COMPLIANCE', name: 'Compliance', weight: 1.0 },
        { id: 'cat-2', code: 'RETENTION', name: 'Retention', weight: 1.0 },
      ],
      questions: [
        {
          id: 'q1',
          code: 'Q1',
          title: 'Handbook Audit',
          type: QuestionType.SINGLE_CHOICE,
          weight: 1.0,
          isRequired: true,
          scoreCategoryId: 'cat-1',
          options: [
            { id: 'opt-1a', value: 'recent', scoreValue: 100 },
            { id: 'opt-1b', value: 'never', scoreValue: 20 },
          ],
        },
        {
          id: 'q2',
          code: 'Q2',
          title: 'Stay Interviews',
          type: QuestionType.SINGLE_CHOICE,
          weight: 1.0,
          isRequired: true,
          scoreCategoryId: 'cat-2',
          options: [
            { id: 'opt-2a', value: 'yes', scoreValue: 80 },
            { id: 'opt-2b', value: 'no', scoreValue: 0 },
          ],
        },
      ],
      answers: [
        { questionId: 'q1', questionCode: 'Q1', selectedOptionId: 'opt-1a', selectedOptionValue: 'recent' },
        { questionId: 'q2', questionCode: 'Q2', selectedOptionId: 'opt-2a', selectedOptionValue: 'yes' },
      ],
    });

    expect(result.categoryScores['COMPLIANCE'].percentage).toBe(100);
    expect(result.categoryScores['RETENTION'].percentage).toBe(80);
    expect(result.overallScore).toBe(90);
    expect(result.maturityLevel).toBe('Optimized');
    expect(result.riskLevel).toBe('LOW');
    expect(result.benchmarkComparison.status).toBe('configured');
    expect(result.benchmarkComparison.variance).toBe(25.5); // 90 - 64.5
  });

  it('should safeguard against division by zero when a category has zero questions or zero weight', () => {
    const result = service.calculateScores({
      calculatorSlug: 'empty-test',
      categories: [
        { id: 'cat-1', code: 'EMPTY', name: 'Empty Category', weight: 0 },
      ],
      questions: [],
      answers: [],
    });

    expect(result.overallScore).toBe(0);
    expect(result.normalizedIndex).toBe(0);
    expect(result.maturityLevel).toBe('Foundational');
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.benchmarkComparison.status).toBe('unconfigured');
  });

  it('should ignore hidden conditional questions when calculating max possible denominator', () => {
    const result = service.calculateScores({
      calculatorSlug: 'hr-health-check',
      categories: [
        { id: 'cat-1', code: 'COMPLIANCE', name: 'Compliance', weight: 1.0 },
      ],
      questions: [
        {
          id: 'q1',
          code: 'Q1',
          title: 'Parent Question',
          type: QuestionType.SINGLE_CHOICE,
          weight: 1.0,
          isRequired: true,
          scoreCategoryId: 'cat-1',
          options: [
            { id: 'opt-1a', value: 'recent', scoreValue: 100 },
            { id: 'opt-1b', value: 'never', scoreValue: 20 },
          ],
        },
        {
          id: 'q2',
          code: 'Q2_CONDITIONAL',
          title: 'Child Question (Hidden unless Q1 is never)',
          type: QuestionType.SINGLE_CHOICE,
          weight: 1.0,
          isRequired: false,
          scoreCategoryId: 'cat-1',
          displayConditions: {
            questionCode: 'Q1',
            operator: 'EQUALS',
            value: 'never',
          },
          options: [
            { id: 'opt-2a', value: 'bad', scoreValue: 0 },
            { id: 'opt-2b', value: 'good', scoreValue: 100 },
          ],
        },
      ],
      answers: [
        { questionId: 'q1', questionCode: 'Q1', selectedOptionId: 'opt-1a', selectedOptionValue: 'recent' },
      ],
    });

    // Because Q2 is hidden, max possible should only be 100 (from Q1), so score should be 100%
    expect(result.categoryScores['COMPLIANCE'].maxPossibleScore).toBe(100);
    expect(result.categoryScores['COMPLIANCE'].rawScore).toBe(100);
    expect(result.categoryScores['COMPLIANCE'].percentage).toBe(100);
    expect(result.categoryScores['COMPLIANCE'].visibleQuestionsCount).toBe(1);
  });

  it('should correctly classify maturity levels and risk bands', () => {
    expect(service.determineMaturityLevel(25)).toBe('Foundational');
    expect(service.determineRiskLevel(25)).toBe('CRITICAL');

    expect(service.determineMaturityLevel(50)).toBe('Emerging');
    expect(service.determineRiskLevel(50)).toBe('HIGH');

    expect(service.determineMaturityLevel(70)).toBe('Advancing');
    expect(service.determineRiskLevel(70)).toBe('MODERATE');

    expect(service.determineMaturityLevel(95)).toBe('Optimized');
    expect(service.determineRiskLevel(95)).toBe('LOW');
  });

  it('should evaluate scoring rule multipliers when conditions are satisfied', () => {
    const result = service.calculateScores({
      calculatorSlug: 'hr-health-check',
      categories: [
        { id: 'cat-1', code: 'COMPLIANCE', name: 'Compliance', weight: 1.0 },
      ],
      questions: [
        {
          id: 'q1',
          code: 'Q1',
          title: 'Compliance Audit',
          type: QuestionType.SINGLE_CHOICE,
          weight: 1.0,
          isRequired: true,
          scoreCategoryId: 'cat-1',
          options: [
            { id: 'opt-1a', value: 'yes', scoreValue: 50 },
          ],
        },
      ],
      scoringRules: [
        {
          id: 'rule-1',
          name: 'Severe Compliance Penalty',
          scoreCategoryId: 'cat-1',
          conditionExpression: 'SCORE <= 50',
          multiplier: 0.8, // 50% * 0.8 = 40%
        },
      ],
      answers: [
        { questionId: 'q1', questionCode: 'Q1', selectedOptionId: 'opt-1a', selectedOptionValue: 'yes' },
      ],
    });

    expect(result.categoryScores['COMPLIANCE'].percentage).toBe(40);
  });
});
