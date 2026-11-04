export type ConditionOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'IN'
  | 'NOT_IN'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY';

export interface SingleCondition {
  questionCode?: string;
  questionId?: string;
  operator: ConditionOperator;
  value?: string | number | boolean | (string | number)[];
}

export interface ConditionGroup {
  operator: 'AND' | 'OR';
  conditions?: SingleCondition[];
  groups?: ConditionGroup[];
}

export type DisplayConditionRule = ConditionGroup | SingleCondition;

export interface AnswerSnapshot {
  questionId: string;
  questionCode: string;
  selectedOptionValue?: string | null;
  selectedOptionId?: string | null;
  textValue?: string | null;
  numericValue?: number | null;
  rawInput?: any;
}

/**
 * Reusable Conditional Display Evaluator for the Assessment Engine.
 * Evaluates whether a question should be displayed based on prior answered questions.
 */
export class ConditionEvaluator {
  /**
   * Evaluates if a question is visible based on its display conditions and current answers.
   */
  static isQuestionVisible(
    displayConditions: DisplayConditionRule | null | undefined,
    answers: AnswerSnapshot[],
  ): boolean {
    if (!displayConditions || Object.keys(displayConditions).length === 0) {
      return true; // No conditions means unconditionally visible
    }

    const answerMapByCode = new Map<string, AnswerSnapshot>();
    const answerMapById = new Map<string, AnswerSnapshot>();

    for (const ans of answers) {
      if (ans.questionCode) {
        answerMapByCode.set(ans.questionCode, ans);
      }
      if (ans.questionId) {
        answerMapById.set(ans.questionId, ans);
      }
    }

    return this.evaluateRule(displayConditions, answerMapByCode, answerMapById);
  }

  private static evaluateRule(
    rule: DisplayConditionRule,
    answersByCode: Map<string, AnswerSnapshot>,
    answersById: Map<string, AnswerSnapshot>,
  ): boolean {
    // If it's a condition group (has operator AND/OR and conditions/groups array)
    if ('operator' in rule && (rule.operator === 'AND' || rule.operator === 'OR')) {
      const group = rule as ConditionGroup;
      const subResults: boolean[] = [];

      if (group.conditions && Array.isArray(group.conditions)) {
        for (const cond of group.conditions) {
          subResults.push(this.evaluateSingleCondition(cond, answersByCode, answersById));
        }
      }

      if (group.groups && Array.isArray(group.groups)) {
        for (const subGroup of group.groups) {
          subResults.push(this.evaluateRule(subGroup, answersByCode, answersById));
        }
      }

      if (subResults.length === 0) {
        return true;
      }

      return group.operator === 'AND'
        ? subResults.every((r) => r === true)
        : subResults.some((r) => r === true);
    }

    // Single condition
    return this.evaluateSingleCondition(rule as SingleCondition, answersByCode, answersById);
  }

  private static evaluateSingleCondition(
    cond: SingleCondition,
    answersByCode: Map<string, AnswerSnapshot>,
    answersById: Map<string, AnswerSnapshot>,
  ): boolean {
    let answer: AnswerSnapshot | undefined;

    if (cond.questionCode) {
      answer = answersByCode.get(cond.questionCode);
    } else if (cond.questionId) {
      answer = answersById.get(cond.questionId);
    }

    const targetValue = cond.value;

    switch (cond.operator) {
      case 'IS_EMPTY': {
        if (!answer) return true;
        const val = this.extractAnswerValue(answer);
        return val === null || val === undefined || val === '';
      }

      case 'IS_NOT_EMPTY': {
        if (!answer) return false;
        const val = this.extractAnswerValue(answer);
        return val !== null && val !== undefined && val !== '';
      }

      case 'EQUALS': {
        if (!answer) return false;
        const val = this.extractAnswerValue(answer);
        return String(val) === String(targetValue);
      }

      case 'NOT_EQUALS': {
        if (!answer) return true;
        const val = this.extractAnswerValue(answer);
        return String(val) !== String(targetValue);
      }

      case 'IN': {
        if (!answer) return false;
        const val = this.extractAnswerValue(answer);
        if (!Array.isArray(targetValue)) {
          return String(val) === String(targetValue);
        }
        return targetValue.map(String).includes(String(val));
      }

      case 'NOT_IN': {
        if (!answer) return true;
        const val = this.extractAnswerValue(answer);
        if (!Array.isArray(targetValue)) {
          return String(val) !== String(targetValue);
        }
        return !targetValue.map(String).includes(String(val));
      }

      case 'GREATER_THAN': {
        if (!answer) return false;
        const numVal = this.extractNumericValue(answer);
        if (numVal === null || targetValue === undefined) return false;
        return numVal > Number(targetValue);
      }

      case 'GREATER_THAN_OR_EQUAL': {
        if (!answer) return false;
        const numVal = this.extractNumericValue(answer);
        if (numVal === null || targetValue === undefined) return false;
        return numVal >= Number(targetValue);
      }

      case 'LESS_THAN': {
        if (!answer) return false;
        const numVal = this.extractNumericValue(answer);
        if (numVal === null || targetValue === undefined) return false;
        return numVal < Number(targetValue);
      }

      case 'LESS_THAN_OR_EQUAL': {
        if (!answer) return false;
        const numVal = this.extractNumericValue(answer);
        if (numVal === null || targetValue === undefined) return false;
        return numVal <= Number(targetValue);
      }

      case 'CONTAINS': {
        if (!answer) return false;
        const text = String(this.extractAnswerValue(answer) || '');
        return text.toLowerCase().includes(String(targetValue).toLowerCase());
      }

      case 'NOT_CONTAINS': {
        if (!answer) return true;
        const text = String(this.extractAnswerValue(answer) || '');
        return !text.toLowerCase().includes(String(targetValue).toLowerCase());
      }

      default:
        return true;
    }
  }

  private static extractAnswerValue(answer: AnswerSnapshot): string | number | null {
    if (answer.selectedOptionValue !== null && answer.selectedOptionValue !== undefined) {
      return answer.selectedOptionValue;
    }
    if (answer.numericValue !== null && answer.numericValue !== undefined) {
      return answer.numericValue;
    }
    if (answer.textValue !== null && answer.textValue !== undefined) {
      return answer.textValue;
    }
    if (answer.selectedOptionId) {
      return answer.selectedOptionId;
    }
    return null;
  }

  private static extractNumericValue(answer: AnswerSnapshot): number | null {
    if (answer.numericValue !== null && answer.numericValue !== undefined) {
      return Number(answer.numericValue);
    }
    if (answer.textValue !== null && answer.textValue !== undefined) {
      const parsed = parseFloat(answer.textValue);
      return isNaN(parsed) ? null : parsed;
    }
    if (answer.selectedOptionValue !== null && answer.selectedOptionValue !== undefined) {
      const parsed = parseFloat(answer.selectedOptionValue);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }
}
