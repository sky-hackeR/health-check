import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recommendations/recommendation.service';
import { ScoringService } from '../scoring/scoring.service';
import { CalculatorMetricsService } from './calculator-metrics.service';
import { AssessmentsService } from './assessments.service';
import { NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AssessmentStatus, QuestionType } from '@prisma/client';

describe('AssessmentsService (Integration & Engine Tests)', () => {
  let service: AssessmentsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        PrismaService,
        ScoringService,
        RecommendationService,
        CalculatorMetricsService,
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Calculator Configuration', () => {
    it('should retrieve active published calculator configuration by slug', async () => {
      const config = await service.getCalculatorConfig('hr-health-check');

      expect(config).toBeDefined();
      expect(config.slug).toBe('hr-health-check');
      expect(config.versionNumber).toBeGreaterThanOrEqual(1);
      expect(config.categories.length).toBeGreaterThan(0);
      expect(config.questions.length).toBeGreaterThan(0);

      // Verify proprietary internal rules are withheld
      config.questions.forEach((q) => {
        expect((q as any).scoringRules).toBeUndefined();
        expect((q as any).weight).toBeUndefined();
        q.options.forEach((opt) => {
          expect((opt as any).scoreValue).toBeUndefined();
        });
      });
    });

    it('should throw NotFoundException for non-existent calculator slug', async () => {
      await expect(service.getCalculatorConfig('non-existent-calculator-xyz')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Assessment Lifecycle & Session Management', () => {
    let createdSessionToken: string;
    let createdAssessmentId: string;
    let question1Id: string;
    let question1OptionId: string;
    let question2Id: string;
    let question2OptionId: string;

    it('should start an anonymous assessment session with a secure 64-char token', async () => {
      const result = await service.startAssessment({
        calculatorSlug: 'hr-health-check',
        utmSource: 'unit-test',
      });

      expect(result).toBeDefined();
      expect(result.assessmentId).toBeDefined();
      expect(result.sessionToken).toHaveLength(64); // 32 bytes hex = 64 characters
      expect(/^[0-9a-f]{64}$/.test(result.sessionToken)).toBe(true);
      expect(result.status).toBe(AssessmentStatus.IN_PROGRESS);
      expect(result.calculator.slug).toBe('hr-health-check');
      expect(result.progress.answeredQuestions).toBe(0);
      expect(result.progress.percentage).toBe(0);

      createdSessionToken = result.sessionToken;
      createdAssessmentId = result.assessmentId;
    });

    it('should retrieve assessment state and questions with visibility flags', async () => {
      const state = await service.getAssessment(createdSessionToken);

      expect(state).toBeDefined();
      expect(state.assessmentId).toBe(createdAssessmentId);
      expect(state.status).toBe(AssessmentStatus.IN_PROGRESS);
      expect(state.questions.length).toBeGreaterThan(0);
      expect(state.answers).toHaveLength(0);

      const q1 = state.questions[0];
      expect(q1.isVisible).toBe(true);
      question1Id = q1.id;
      question1OptionId = q1.options[0].id;

      if (state.questions.length > 1) {
        question2Id = state.questions[1].id;
        question2OptionId = state.questions[1].options[0].id;
      }
    });

    it('should idempotently save answers and update progress', async () => {
      const saveRes = await service.saveAnswers(createdSessionToken, {
        answers: [
          {
            questionId: question1Id,
            selectedOptionId: question1OptionId,
          },
        ],
      });

      expect(saveRes.success).toBe(true);
      expect(saveRes.savedCount).toBe(1);
      expect(saveRes.progress.answeredQuestions).toBe(1);
      expect(saveRes.progress.percentage).toBeGreaterThan(0);

      // Save again with same question (idempotent upsert verification)
      const repeatRes = await service.saveAnswers(createdSessionToken, {
        answers: [
          {
            questionId: question1Id,
            selectedOptionId: question1OptionId,
          },
        ],
      });

      expect(repeatRes.success).toBe(true);
      expect(repeatRes.progress.answeredQuestions).toBe(1);

      // Verify in database that only 1 answer row exists
      const dbAnswers = await prisma.assessmentAnswer.findMany({
        where: { assessmentId: createdAssessmentId },
      });
      expect(dbAnswers).toHaveLength(1);
    });

    it('should reject answers for question IDs not belonging to the calculator version', async () => {
      const foreignQuestionId = '00000000-0000-0000-0000-000000000000';

      await expect(
        service.saveAnswers(createdSessionToken, {
          answers: [
            {
              questionId: foreignQuestionId,
              textValue: 'invalid',
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid option IDs that do not belong to the question', async () => {
      const foreignOptionId = '00000000-0000-0000-0000-000000000000';

      await expect(
        service.saveAnswers(createdSessionToken, {
          answers: [
            {
              questionId: question1Id,
              selectedOptionId: foreignOptionId,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject expired session tokens', async () => {
      // Create session with past expiresAt
      const expiredSession = await prisma.assessment.create({
        data: {
          sessionToken: service.generateSessionToken(),
          calculatorVersionId: (await prisma.calculatorVersion.findFirstOrThrow()).id,
          expiresAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour in the past
        },
      });

      await expect(service.getAssessment(expiredSession.sessionToken)).rejects.toThrow(
        UnauthorizedException,
      );

      // Cleanup
      await prisma.assessment.delete({ where: { id: expiredSession.id } });
    });

    it('should enforce completion requirements when required questions remain unanswered', async () => {
      // Currently only question1 is answered; other questions remain unanswered
      const assessmentState = await service.getAssessment(createdSessionToken);
      const hasUnansweredRequired = assessmentState.questions.some(
        (q) => q.isVisible && q.isRequired && !assessmentState.answers.some((a) => a.questionId === q.id),
      );

      if (hasUnansweredRequired) {
        await expect(service.completeAssessment(createdSessionToken)).rejects.toThrow(
          BadRequestException,
        );
      }
    });

    it('should successfully complete assessment once all visible required questions are answered', async () => {
      const state = await service.getAssessment(createdSessionToken);

      // Answer all remaining visible questions
      const remainingAnswers = state.questions
        .filter((q) => q.isVisible && !state.answers.some((a) => a.questionId === q.id))
        .map((q) => ({
          questionId: q.id,
          selectedOptionId: q.options[0]?.id || undefined,
          numericValue: q.type === QuestionType.NUMERIC_INPUT || q.type === QuestionType.SLIDER ? 100 : undefined,
          textValue: q.type === QuestionType.SINGLE_CHOICE ? undefined : 'Sample answer',
        }));

      if (remainingAnswers.length > 0) {
        await service.saveAnswers(createdSessionToken, { answers: remainingAnswers });
      }

      const completeRes = await service.completeAssessment(createdSessionToken);
      expect(completeRes.success).toBe(true);
      expect(completeRes.status).toBe(AssessmentStatus.COMPLETED);
      expect(completeRes.completedAt).toBeDefined();

      // Subsequent attempt to modify answers on a completed assessment must be rejected
      await expect(
        service.saveAnswers(createdSessionToken, {
          answers: [{ questionId: question1Id, selectedOptionId: question1OptionId }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // Cleanup created test session
    afterAll(async () => {
      if (createdAssessmentId) {
        await prisma.assessmentAnswer.deleteMany({ where: { assessmentId: createdAssessmentId } });
        await prisma.trackingEvent.deleteMany({ where: { assessmentId: createdAssessmentId } });
        await prisma.assessment.delete({ where: { id: createdAssessmentId } }).catch(() => {});
      }
    });
  });

  describe('Dynamic Conditional Display Evaluation within Assessment', () => {
    let conditionalAssessmentId: string;
    let conditionalToken: string;
    let parentQId: string;
    let parentOptionOver2YrsId: string;
    let parentOption12MonthsId: string;
    let childQId: string;

    beforeAll(async () => {
      // Find published version of hr-health-check
      const calc = await prisma.calculator.findUniqueOrThrow({
        where: { slug: 'hr-health-check' },
        include: { versions: { where: { isPublished: true }, take: 1 } },
      });
      const versionId = calc.versions[0].id;

      // Ensure parent question exists
      const parentQ = await prisma.question.findFirstOrThrow({
        where: { calculatorVersionId: versionId, code: 'HC_COMP_01' },
        include: { options: true },
      });
      parentQId = parentQ.id;
      parentOptionOver2YrsId = parentQ.options.find((o) => o.value === 'over_2_years')?.id || parentQ.options[0].id;
      parentOption12MonthsId = parentQ.options.find((o) => o.value === '12_months')?.id || parentQ.options[1].id;

      // Create a test child question with displayConditions: only visible if HC_COMP_01 equals 'over_2_years'
      const childQ = await prisma.question.upsert({
        where: {
          calculatorVersionId_code: {
            calculatorVersionId: versionId,
            code: 'HC_COMP_01_CONDITIONAL_TEST',
          },
        },
        update: {
          title: 'Conditional follow-up for audit older than 2 years',
          isRequired: false,
          displayConditions: {
            questionCode: 'HC_COMP_01',
            operator: 'EQUALS',
            value: 'over_2_years',
          },
        },
        create: {
          calculatorVersionId: versionId,
          code: 'HC_COMP_01_CONDITIONAL_TEST',
          title: 'Conditional follow-up for audit older than 2 years',
          type: QuestionType.BOOLEAN,
          isRequired: false,
          orderIndex: 99,
          displayConditions: {
            questionCode: 'HC_COMP_01',
            operator: 'EQUALS',
            value: 'over_2_years',
          },
        },
      });
      childQId = childQ.id;

      // Start fresh assessment
      const startRes = await service.startAssessment({ calculatorSlug: 'hr-health-check' });
      conditionalAssessmentId = startRes.assessmentId;
      conditionalToken = startRes.sessionToken;
    });

    afterAll(async () => {
      if (conditionalAssessmentId) {
        await prisma.assessmentAnswer.deleteMany({ where: { assessmentId: conditionalAssessmentId } });
        await prisma.assessment.delete({ where: { id: conditionalAssessmentId } }).catch(() => {});
      }
      if (childQId) {
        await prisma.question.delete({ where: { id: childQId } }).catch(() => {});
      }
    });

    it('should hide conditional question when condition is not yet satisfied', async () => {
      // With no answers saved, child question must be hidden
      const state = await service.getAssessment(conditionalToken);
      const child = state.questions.find((q) => q.id === childQId);

      expect(child).toBeDefined();
      expect(child?.isVisible).toBe(false);
    });

    it('should show conditional question when parent answer satisfies condition', async () => {
      // Save parent answer matching condition (over_2_years)
      await service.saveAnswers(conditionalToken, {
        answers: [
          {
            questionId: parentQId,
            selectedOptionId: parentOptionOver2YrsId,
          },
        ],
      });

      const state = await service.getAssessment(conditionalToken);
      const child = state.questions.find((q) => q.id === childQId);

      expect(child).toBeDefined();
      expect(child?.isVisible).toBe(true);
    });

    it('should dynamically hide conditional question again if parent answer changes to non-matching value', async () => {
      // Change parent answer to 12_months (does not match over_2_years)
      await service.saveAnswers(conditionalToken, {
        answers: [
          {
            questionId: parentQId,
            selectedOptionId: parentOption12MonthsId,
          },
        ],
      });

      const state = await service.getAssessment(conditionalToken);
      const child = state.questions.find((q) => q.id === childQId);

      expect(child).toBeDefined();
      expect(child?.isVisible).toBe(false);
    });
  });
});
