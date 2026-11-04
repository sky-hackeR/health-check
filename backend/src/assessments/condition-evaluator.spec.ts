import { ConditionEvaluator, DisplayConditionRule, AnswerSnapshot } from './condition-evaluator';

describe('ConditionEvaluator', () => {
  it('should return true when no displayConditions are provided', () => {
    expect(ConditionEvaluator.isQuestionVisible(null, [])).toBe(true);
    expect(ConditionEvaluator.isQuestionVisible(undefined, [])).toBe(true);
    expect(ConditionEvaluator.isQuestionVisible({} as any, [])).toBe(true);
  });

  it('should evaluate EQUALS operator correctly for single choice values', () => {
    const rule: DisplayConditionRule = {
      questionCode: 'Q1_AUDIT',
      operator: 'EQUALS',
      value: 'over_2_years',
    };

    const matchingAnswers: AnswerSnapshot[] = [
      {
        questionId: 'q1',
        questionCode: 'Q1_AUDIT',
        selectedOptionValue: 'over_2_years',
      },
    ];

    const nonMatchingAnswers: AnswerSnapshot[] = [
      {
        questionId: 'q1',
        questionCode: 'Q1_AUDIT',
        selectedOptionValue: '12_months',
      },
    ];

    expect(ConditionEvaluator.isQuestionVisible(rule, matchingAnswers)).toBe(true);
    expect(ConditionEvaluator.isQuestionVisible(rule, nonMatchingAnswers)).toBe(false);
    expect(ConditionEvaluator.isQuestionVisible(rule, [])).toBe(false);
  });

  it('should evaluate NOT_EQUALS operator correctly', () => {
    const rule: DisplayConditionRule = {
      questionCode: 'Q1_AUDIT',
      operator: 'NOT_EQUALS',
      value: '12_months',
    };

    const answers: AnswerSnapshot[] = [
      {
        questionId: 'q1',
        questionCode: 'Q1_AUDIT',
        selectedOptionValue: 'over_2_years',
      },
    ];

    expect(ConditionEvaluator.isQuestionVisible(rule, answers)).toBe(true);

    const sameAnswers: AnswerSnapshot[] = [
      {
        questionId: 'q1',
        questionCode: 'Q1_AUDIT',
        selectedOptionValue: '12_months',
      },
    ];

    expect(ConditionEvaluator.isQuestionVisible(rule, sameAnswers)).toBe(false);
  });

  it('should evaluate IN and NOT_IN operators correctly', () => {
    const inRule: DisplayConditionRule = {
      questionCode: 'Q_TIER',
      operator: 'IN',
      value: ['tier_2', 'tier_3'],
    };

    expect(
      ConditionEvaluator.isQuestionVisible(inRule, [
        { questionId: 'q', questionCode: 'Q_TIER', selectedOptionValue: 'tier_2' },
      ]),
    ).toBe(true);

    expect(
      ConditionEvaluator.isQuestionVisible(inRule, [
        { questionId: 'q', questionCode: 'Q_TIER', selectedOptionValue: 'tier_1' },
      ]),
    ).toBe(false);

    const notInRule: DisplayConditionRule = {
      questionCode: 'Q_TIER',
      operator: 'NOT_IN',
      value: ['tier_1', 'tier_2'],
    };

    expect(
      ConditionEvaluator.isQuestionVisible(notInRule, [
        { questionId: 'q', questionCode: 'Q_TIER', selectedOptionValue: 'tier_3' },
      ]),
    ).toBe(true);

    expect(
      ConditionEvaluator.isQuestionVisible(notInRule, [
        { questionId: 'q', questionCode: 'Q_TIER', selectedOptionValue: 'tier_1' },
      ]),
    ).toBe(false);
  });

  it('should evaluate numeric comparisons (GREATER_THAN, LESS_THAN_OR_EQUAL)', () => {
    const gtRule: DisplayConditionRule = {
      questionCode: 'Q_HEADCOUNT',
      operator: 'GREATER_THAN',
      value: 50,
    };

    expect(
      ConditionEvaluator.isQuestionVisible(gtRule, [
        { questionId: 'q', questionCode: 'Q_HEADCOUNT', numericValue: 120 },
      ]),
    ).toBe(true);

    expect(
      ConditionEvaluator.isQuestionVisible(gtRule, [
        { questionId: 'q', questionCode: 'Q_HEADCOUNT', numericValue: 40 },
      ]),
    ).toBe(false);

    const lteRule: DisplayConditionRule = {
      questionCode: 'Q_TURNOVER',
      operator: 'LESS_THAN_OR_EQUAL',
      value: 15,
    };

    expect(
      ConditionEvaluator.isQuestionVisible(lteRule, [
        { questionId: 'q', questionCode: 'Q_TURNOVER', numericValue: 15 },
      ]),
    ).toBe(true);

    expect(
      ConditionEvaluator.isQuestionVisible(lteRule, [
        { questionId: 'q', questionCode: 'Q_TURNOVER', numericValue: 25 },
      ]),
    ).toBe(false);
  });

  it('should evaluate compound AND groups where all conditions must pass', () => {
    const andRule: DisplayConditionRule = {
      operator: 'AND',
      conditions: [
        {
          questionCode: 'Q_AUDIT',
          operator: 'EQUALS',
          value: 'over_2_years',
        },
        {
          questionCode: 'Q_HEADCOUNT',
          operator: 'GREATER_THAN',
          value: 20,
        },
      ],
    };

    const bothPass: AnswerSnapshot[] = [
      { questionId: '1', questionCode: 'Q_AUDIT', selectedOptionValue: 'over_2_years' },
      { questionId: '2', questionCode: 'Q_HEADCOUNT', numericValue: 50 },
    ];

    const oneFails: AnswerSnapshot[] = [
      { questionId: '1', questionCode: 'Q_AUDIT', selectedOptionValue: 'over_2_years' },
      { questionId: '2', questionCode: 'Q_HEADCOUNT', numericValue: 10 },
    ];

    expect(ConditionEvaluator.isQuestionVisible(andRule, bothPass)).toBe(true);
    expect(ConditionEvaluator.isQuestionVisible(andRule, oneFails)).toBe(false);
  });

  it('should evaluate compound OR groups where any condition passing is sufficient', () => {
    const orRule: DisplayConditionRule = {
      operator: 'OR',
      conditions: [
        {
          questionCode: 'Q_RISK_FLAG',
          operator: 'EQUALS',
          value: 'yes',
        },
        {
          questionCode: 'Q_LAWSUIT',
          operator: 'EQUALS',
          value: 'pending',
        },
      ],
    };

    expect(
      ConditionEvaluator.isQuestionVisible(orRule, [
        { questionId: '1', questionCode: 'Q_RISK_FLAG', selectedOptionValue: 'yes' },
        { questionId: '2', questionCode: 'Q_LAWSUIT', selectedOptionValue: 'none' },
      ]),
    ).toBe(true);

    expect(
      ConditionEvaluator.isQuestionVisible(orRule, [
        { questionId: '1', questionCode: 'Q_RISK_FLAG', selectedOptionValue: 'no' },
        { questionId: '2', questionCode: 'Q_LAWSUIT', selectedOptionValue: 'none' },
      ]),
    ).toBe(false);
  });

  it('should support question lookup by questionId as well as questionCode', () => {
    const idRule: DisplayConditionRule = {
      questionId: 'uuid-1234',
      operator: 'EQUALS',
      value: 'active',
    };

    expect(
      ConditionEvaluator.isQuestionVisible(idRule, [
        { questionId: 'uuid-1234', questionCode: 'ANY_CODE', selectedOptionValue: 'active' },
      ]),
    ).toBe(true);

    expect(
      ConditionEvaluator.isQuestionVisible(idRule, [
        { questionId: 'uuid-other', questionCode: 'ANY_CODE', selectedOptionValue: 'active' },
      ]),
    ).toBe(false);
  });
});
