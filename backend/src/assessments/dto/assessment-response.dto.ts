import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssessmentStatus, QuestionType } from '@prisma/client';
import { PublicOptionDto } from './calculator-config.dto';

export class AssessmentProgressDto {
  @ApiProperty({ example: 4 })
  totalQuestions: number;

  @ApiProperty({ example: 3 })
  visibleQuestions: number;

  @ApiProperty({ example: 2 })
  answeredQuestions: number;

  @ApiProperty({ example: 66.7 })
  percentage: number;

  @ApiProperty({ example: false })
  isComplete: boolean;
}

export class AssessmentQuestionDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'HC_COMP_01' })
  code: string;

  @ApiProperty({ example: 'How recently has your organization audited employee handbooks?' })
  title: string;

  @ApiPropertyOptional({ example: 'Include contractor agreements and state notices.' })
  helpText?: string | null;

  @ApiProperty({ enum: QuestionType, example: QuestionType.SINGLE_CHOICE })
  type: QuestionType;

  @ApiProperty({ example: 0 })
  orderIndex: number;

  @ApiProperty({ example: true })
  isRequired: boolean;

  @ApiProperty({
    description: 'Whether this question is currently visible based on dynamic conditions',
    example: true,
  })
  isVisible: boolean;

  @ApiPropertyOptional({ example: 'COMPLIANCE' })
  categoryCode?: string | null;

  @ApiPropertyOptional()
  displayConditions?: any;

  @ApiProperty({ type: [PublicOptionDto] })
  options: PublicOptionDto[];
}

export class SavedAnswerDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  questionId: string;

  @ApiProperty({ example: 'HC_COMP_01' })
  questionCode: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174001' })
  selectedOptionId?: string | null;

  @ApiPropertyOptional({ example: '12_months' })
  selectedOptionValue?: string | null;

  @ApiPropertyOptional({ example: 45.5 })
  numericValue?: number | null;

  @ApiPropertyOptional({ example: 'Text answer' })
  textValue?: string | null;

  @ApiPropertyOptional()
  rawInput?: any;

  @ApiProperty({ example: '2026-11-03T16:00:00.000Z' })
  updatedAt: Date;
}

export class StartAssessmentResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174099' })
  assessmentId: string;

  @ApiProperty({
    description: 'Cryptographically secure session token for anonymous state resumption',
    example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
  })
  sessionToken: string;

  @ApiProperty({
    example: {
      slug: 'hr-health-check',
      name: 'GoSwiftHR Workforce Health & Maturity Index',
    },
  })
  calculator: {
    slug: string;
    name: string;
  };

  @ApiProperty({ example: 1 })
  versionNumber: number;

  @ApiProperty({ enum: AssessmentStatus, example: AssessmentStatus.IN_PROGRESS })
  status: AssessmentStatus;

  @ApiProperty({ example: '2026-11-03T16:00:00.000Z' })
  startedAt: Date;

  @ApiProperty({ example: '2026-12-03T16:00:00.000Z' })
  expiresAt?: Date | null;

  @ApiProperty({ type: AssessmentProgressDto })
  progress: AssessmentProgressDto;
}

export class AssessmentStateResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174099' })
  assessmentId: string;

  @ApiProperty({ example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0' })
  sessionToken: string;

  @ApiProperty({ enum: AssessmentStatus, example: AssessmentStatus.IN_PROGRESS })
  status: AssessmentStatus;

  @ApiProperty({
    example: {
      id: 'calc-1',
      slug: 'hr-health-check',
      name: 'GoSwiftHR Workforce Health & Maturity Index',
      versionNumber: 1,
    },
  })
  calculator: {
    id: string;
    slug: string;
    name: string;
    versionNumber: number;
  };

  @ApiProperty({ type: AssessmentProgressDto })
  progress: AssessmentProgressDto;

  @ApiProperty({ type: [AssessmentQuestionDto] })
  questions: AssessmentQuestionDto[];

  @ApiProperty({ type: [SavedAnswerDto] })
  answers: SavedAnswerDto[];

  @ApiProperty({ example: '2026-11-03T16:00:00.000Z' })
  startedAt: Date;

  @ApiPropertyOptional({ example: null })
  completedAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-12-03T16:00:00.000Z' })
  expiresAt?: Date | null;
}

export class SaveAnswersResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 2 })
  savedCount: number;

  @ApiProperty({ type: AssessmentProgressDto })
  progress: AssessmentProgressDto;

  @ApiProperty({ type: [SavedAnswerDto] })
  answers: SavedAnswerDto[];
}

export class CompleteAssessmentResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174099' })
  assessmentId: string;

  @ApiProperty({ enum: AssessmentStatus, example: AssessmentStatus.COMPLETED })
  status: AssessmentStatus;

  @ApiProperty({ example: '2026-11-03T16:30:00.000Z' })
  completedAt: Date;

  @ApiProperty({
    example: 'Assessment successfully completed. Ready for lead capture and personalized scoring generation.',
  })
  message: string;
}
