import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  AssessmentStatus,
  QuestionType,
  RecommendationPriority,
  RecommendationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import { ScoringService } from '../scoring/scoring.service';
import { AssessmentsService } from './assessments.service';

const SESSION_TOKEN = 'a'.repeat(64);
const ASSESSMENT_ID = 'assessment-1';
const CATEGORY_ID = 'category-1';
const QUESTION_ID = 'question-1';
const OPTION_ID = 'option-1';
const TEMPLATE_ID = 'template-1';

describe('AssessmentsService result lifecycle', () => {
  let service: AssessmentsService;
  let prisma: PrismaService;
  let transaction: jest.Mock;
  let state: {
    status: AssessmentStatus;
    completedAt: Date | null;
    result: Record<string, unknown> | null;
    recommendations: Array<Record<string, unknown>>;
    answers: Array<Record<string, unknown>>;
  };
  let tx: Record<string, any>;
  let scoringService: ScoringService;
  let recommendationService: RecommendationService;
  let assessmentReadOverride: ReturnType<typeof assessmentRecord> | null;

  const assessmentRecord = () => ({
    id: ASSESSMENT_ID,
    sessionToken: SESSION_TOKEN,
    status: state.status,
    completedAt: state.completedAt,
    expiresAt: null,
    deletedAt: null,
    result: state.result,
    recommendations: state.recommendations,
    answers: state.answers,
    calculatorVersion: {
      calculator: { slug: 'test-calculator' },
      scoreCategories: [
        { id: CATEGORY_ID, code: 'COMPLIANCE', name: 'Compliance', weight: 1 },
      ],
      questions: [
        {
          id: QUESTION_ID,
          code: 'Q1',
          title: 'Compliance question',
          type: QuestionType.SINGLE_CHOICE,
          weight: 1,
          isRequired: true,
          scoreCategoryId: CATEGORY_ID,
          displayConditions: null,
          options: [
            { id: OPTION_ID, value: 'yes', scoreValue: 80 },
            { id: 'option-2', value: 'no', scoreValue: 20 },
          ],
        },
      ],
      scoringRules: [],
      recommendationRules: [
        {
          id: 'rule-1',
          templateId: TEMPLATE_ID,
          scoreCategoryId: CATEGORY_ID,
          scoreCategory: {
            id: CATEGORY_ID,
            code: 'COMPLIANCE',
            name: 'Compliance',
          },
          minScore: null,
          maxScore: 90,
          conditionJson: null,
          template: {
            id: TEMPLATE_ID,
            code: 'REC_COMPLIANCE',
            title: 'Compliance review',
            summary: 'Review compliance controls.',
            actionPlan: 'Schedule a review.',
            priority: RecommendationPriority.HIGH,
            serviceLink: 'https://example.test/compliance',
          },
        },
      ],
    },
  });

  beforeEach(() => {
    state = {
      status: AssessmentStatus.IN_PROGRESS,
      completedAt: null,
      result: null,
      recommendations: [],
      answers: [
        {
          questionId: QUESTION_ID,
          question: { code: 'Q1' },
          selectedOptionId: OPTION_ID,
          selectedOption: { value: 'yes' },
          textValue: null,
          numericValue: null,
          rawInput: null,
        },
      ],
    };
    assessmentReadOverride = null;

    const template = assessmentRecord().calculatorVersion.recommendationRules[0].template;
    tx = {
      assessment: {
        updateMany: jest.fn(async ({ where, data }) => {
          if (where.status !== state.status || state.result !== null) {
            return { count: 0 };
          }
          state.status = data.status;
          state.completedAt = data.completedAt;
          return { count: 1 };
        }),
      },
      assessmentAnswer: {
        findMany: jest.fn(async () => state.answers),
        upsert: jest.fn(),
      },
      assessmentResult: {
        create: jest.fn(async ({ data }) => {
          const result = {
            id: 'result-1',
            ...data,
            calculatedMetrics: data.calculatedMetrics,
            createdAt: new Date(),
          };
          state.result = result;
          return result;
        }),
        findUnique: jest.fn(async () => state.result),
      },
      assessmentRecommendation: {
        createMany: jest.fn(async ({ data }) => {
          state.recommendations.push(
            ...data.map((recommendation: Record<string, unknown>, index: number) => ({
              id: `recommendation-${index + 1}`,
              ...recommendation,
              createdAt: new Date(),
              template,
            })),
          );
          return { count: data.length };
        }),
        findMany: jest.fn(async () => state.recommendations),
      },
    };

    transaction = jest.fn(async (operation: (client: unknown) => Promise<unknown>) => {
      const previousState = {
        status: state.status,
        completedAt: state.completedAt,
        result: state.result,
        recommendations: [...state.recommendations],
      };
      try {
        return await operation(tx);
      } catch (error) {
        state = previousState;
        throw error;
      }
    });

    const prismaMock = {
      assessment: {
        findUnique: jest.fn(async ({ where }: { where: { sessionToken: string } }) =>
          where.sessionToken === SESSION_TOKEN
            ? assessmentReadOverride || assessmentRecord()
            : null,
        ),
      },
      assessmentResult: {
        findUnique: jest.fn(async () => state.result),
      },
      assessmentRecommendation: {
        findMany: jest.fn(async () => state.recommendations),
      },
      $transaction: transaction,
    };
    prisma = prismaMock as unknown as PrismaService;
    scoringService = new ScoringService();
    recommendationService = new RecommendationService();
    service = new AssessmentsService(prisma, scoringService, recommendationService);
  });

  it('generates and persists a result and matching recommendation snapshots at completion', async () => {
    const evaluateRecommendations = recommendationService.evaluateRecommendations.bind(
      recommendationService,
    );
    jest
      .spyOn(recommendationService, 'evaluateRecommendations')
      .mockImplementation((rules, scoringResult, answers) => {
        expect(state.result).not.toBeNull();
        return evaluateRecommendations(rules, scoringResult, answers);
      });

    const response = await service.completeAssessment(SESSION_TOKEN);

    expect(response.status).toBe(AssessmentStatus.COMPLETED);
    expect(response.message).toContain('results generated');
    expect(state.status).toBe(AssessmentStatus.COMPLETED);
    expect(state.result).toMatchObject({
      assessmentId: ASSESSMENT_ID,
      overallScore: 80,
      normalizedIndex: 80,
      isImmutable: true,
    });
    expect(state.recommendations).toHaveLength(1);
    expect(state.recommendations[0]).toMatchObject({
      assessmentId: ASSESSMENT_ID,
      templateId: TEMPLATE_ID,
      title: 'Compliance review',
      status: RecommendationStatus.PROPOSED,
    });
    expect(tx.assessmentResult.create).toHaveBeenCalledTimes(1);
    expect(tx.assessmentRecommendation.createMany).toHaveBeenCalledTimes(1);
  });

  it('does not recalculate or duplicate records when completion is repeated', async () => {
    const calculateScores = jest.spyOn(scoringService, 'calculateScores');

    await service.completeAssessment(SESSION_TOKEN);
    const firstCompletedAt = state.completedAt;
    const secondResponse = await service.completeAssessment(SESSION_TOKEN);

    expect(secondResponse.completedAt).toBe(firstCompletedAt);
    expect(calculateScores).toHaveBeenCalledTimes(1);
    expect(tx.assessmentResult.create).toHaveBeenCalledTimes(1);
    expect(state.recommendations).toHaveLength(1);
  });

  it('returns the result created by a concurrent completion without creating duplicates', async () => {
    await service.completeAssessment(SESSION_TOKEN);
    assessmentReadOverride = {
      ...assessmentRecord(),
      status: AssessmentStatus.IN_PROGRESS,
      completedAt: null,
      result: null,
      recommendations: [],
    };

    const response = await service.completeAssessment(SESSION_TOKEN);

    expect(response.status).toBe(AssessmentStatus.COMPLETED);
    expect(tx.assessmentResult.create).toHaveBeenCalledTimes(1);
    expect(tx.assessmentRecommendation.createMany).toHaveBeenCalledTimes(1);
    expect(state.status).toBe(AssessmentStatus.COMPLETED);
  });

  it('scores the answers persisted inside the completion transaction', async () => {
    tx.assessment.updateMany.mockImplementationOnce(async ({ data }) => {
      state.status = data.status;
      state.completedAt = data.completedAt;
      state.answers = [
        {
          ...state.answers[0],
          selectedOptionId: 'option-2',
          selectedOption: { value: 'no' },
        },
      ];
      return { count: 1 };
    });

    await service.completeAssessment(SESSION_TOKEN);

    expect(state.result).toMatchObject({
      overallScore: 20,
      normalizedIndex: 20,
    });
  });

  it('retrieves a typed result for the session token and maps category scores to the response DTO', async () => {
    await service.completeAssessment(SESSION_TOKEN);

    const result = await service.getAssessmentResult(SESSION_TOKEN);

    expect(result).toMatchObject({
      assessmentId: ASSESSMENT_ID,
      sessionToken: SESSION_TOKEN,
      overallScore: 80,
      riskLevel: 'LOW',
      isImmutable: true,
      categoryScores: {
        COMPLIANCE: {
          code: 'COMPLIANCE',
          name: 'Compliance',
          percentage: 80,
          answeredCount: 1,
          visibleCount: 1,
        },
      },
      benchmark: { status: 'unconfigured' },
    });
  });

  it('retrieves recommendation snapshots without exposing rule records', async () => {
    await service.completeAssessment(SESSION_TOKEN);

    const recommendations = await service.getAssessmentRecommendations(SESSION_TOKEN);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      templateId: TEMPLATE_ID,
      title: 'Compliance review',
      priority: RecommendationPriority.HIGH,
      serviceLink: 'https://example.test/compliance',
    });
    expect(recommendations[0]).not.toHaveProperty('ruleId');
  });

  it('rejects a token that does not own an assessment', async () => {
    await expect(service.getAssessmentResult('b'.repeat(64))).rejects.toThrow(
      'Assessment session was not found.',
    );
    await expect(service.getAssessmentRecommendations('b'.repeat(64))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns not found when a completed assessment has no persisted result', async () => {
    state.status = AssessmentStatus.COMPLETED;
    state.completedAt = new Date();

    await expect(service.getAssessmentResult(SESSION_TOKEN)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getAssessmentRecommendations(SESSION_TOKEN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects completion and result retrieval for an incomplete assessment', async () => {
    state.answers = [];

    await expect(service.completeAssessment(SESSION_TOKEN)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getAssessmentResult(SESSION_TOKEN)).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(state.status).toBe(AssessmentStatus.IN_PROGRESS);
    expect(state.result).toBeNull();
    expect(tx.assessmentResult.create).not.toHaveBeenCalled();
  });

  it('rolls back completion when recommendation persistence fails', async () => {
    const initialStatus = state.status;
    tx.assessmentRecommendation.createMany.mockRejectedValue(
      new Error('Recommendation write failed'),
    );

    await expect(service.completeAssessment(SESSION_TOKEN)).rejects.toThrow(
      'Recommendation write failed',
    );
    expect(state.status).toBe(initialStatus);
    expect(state.result).toBeNull();
    expect(state.recommendations).toHaveLength(0);
  });

  it('preserves an existing result snapshot without rewriting it', async () => {
    await service.completeAssessment(SESSION_TOKEN);
    const savedResult = state.result;
    const savedRecommendations = [...state.recommendations];
    const createResult = jest.spyOn(tx.assessmentResult, 'create');
    const createRecommendations = jest.spyOn(
      tx.assessmentRecommendation,
      'createMany',
    );

    await service.completeAssessment(SESSION_TOKEN);

    expect(state.result).toBe(savedResult);
    expect(state.recommendations).toEqual(savedRecommendations);
    expect(createResult).toHaveBeenCalledTimes(1);
    expect(createRecommendations).toHaveBeenCalledTimes(1);
  });

  it('prevents answer modification after results have completed the assessment', async () => {
    await service.completeAssessment(SESSION_TOKEN);

    await expect(
      service.saveAnswers(SESSION_TOKEN, {
        answers: [{ questionId: QUESTION_ID, selectedOptionId: OPTION_ID }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an answer save if completion commits after the session was initially read', async () => {
    state.status = AssessmentStatus.COMPLETED;
    state.completedAt = new Date();
    assessmentReadOverride = {
      ...assessmentRecord(),
      status: AssessmentStatus.IN_PROGRESS,
      completedAt: null,
    };

    await expect(
      service.saveAnswers(SESSION_TOKEN, {
        answers: [{ questionId: QUESTION_ID, selectedOptionId: OPTION_ID }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.assessmentAnswer.upsert).not.toHaveBeenCalled();
    expect(state.status).toBe(AssessmentStatus.COMPLETED);
  });

  it('rejects direct result generation before completion', async () => {
    await expect(service.generateAssessmentResult(SESSION_TOKEN)).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
