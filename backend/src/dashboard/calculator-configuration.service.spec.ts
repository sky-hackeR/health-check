import { PrismaService } from '../prisma/prisma.service';
import { CalculatorConfigurationService } from './calculator-configuration.service';

describe('CalculatorConfigurationService', () => {
  const prisma = {
    calculatorVersion: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  let service: CalculatorConfigurationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CalculatorConfigurationService(
      prisma as unknown as PrismaService,
    );
  });

  it('rejects publishing a cost calculator with a missing engine input mapping', async () => {
    prisma.calculatorVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      calculator: { slug: 'payroll-cost-calculator' },
      questions: [
        {
          id: 'question-1',
          code: 'PC_EMPLOYEE_COUNT',
          type: 'NUMERIC_INPUT',
          calculationKey: null,
          scoreCategoryId: null,
          displayConditions: null,
          validationRules: null,
          weight: 1,
          options: [],
        },
      ],
      scoreCategories: [],
    });

    const result = await service.validateVersion('version-1');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'The required calculation input "PC_RUNS_PER_YEAR" is not mapped.',
    );
  });

  it('rejects unsupported multiple-choice persistence and unknown condition references', async () => {
    prisma.calculatorVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      calculator: { slug: 'hr-health-check' },
      questions: [
        {
          id: 'question-1',
          code: 'HC_NEW',
          type: 'MULTIPLE_CHOICE',
          calculationKey: null,
          scoreCategoryId: 'category-1',
          displayConditions: {
            questionCode: 'MISSING_PARENT',
            operator: 'EQUALS',
            value: 'yes',
          },
          validationRules: null,
          weight: 1,
          options: [{ value: 'one', scoreValue: 1 }],
        },
      ],
      scoreCategories: [{ id: 'category-1' }],
    });

    const result = await service.validateVersion('version-1');

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'HC_NEW uses unsupported question type MULTIPLE_CHOICE.',
        'HC_NEW has a visibility condition referencing an unknown question.',
      ]),
    );
  });

  it('runs a read-only health-check evaluation preview through the configured scoring engine', async () => {
    prisma.calculatorVersion.findFirst.mockResolvedValue({
      versionNumber: 3,
      calculator: { slug: 'hr-health-check', name: 'SME HR Health Check' },
      scoreCategories: [{ id: 'category-1', code: 'OPERATIONS', name: 'Operations', weight: 1 }],
      scoringRules: [],
      recommendationRules: [],
      questions: [{
        id: 'question-1', code: 'HC_RECORDS', title: 'Are HR records maintained?',
        calculationKey: null, type: 'SINGLE_CHOICE', weight: 1, isRequired: true,
        isActive: true, scoreCategoryId: 'category-1', displayConditions: null,
        options: [{ id: 'option-1', label: 'Yes', value: 'yes', scoreValue: 3 }],
      }],
    });

    const result = await service.previewEvaluation('hr-health-check', {
      versionId: '00000000-0000-4000-8000-000000000001',
      answers: [{
        questionId: 'question-1',
        selectedOptionId: 'option-1',
      }],
    });

    expect(result.simulated).toBe(true);
    expect(result.result).toMatchObject({
      type: 'HR_HEALTH_CHECK',
      overallScore: 3,
      normalizedIndex: 3,
    });
    expect(result.notice).toContain('No assessment');
  });
});
