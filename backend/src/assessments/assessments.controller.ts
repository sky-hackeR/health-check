import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { StartAssessmentDto } from './dto/start-assessment.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { CalculatorConfigResponseDto } from './dto/calculator-config.dto';
import {
  StartAssessmentResponseDto,
  AssessmentStateResponseDto,
  SaveAnswersResponseDto,
  CompleteAssessmentResponseDto,
} from './dto/assessment-response.dto';

@ApiTags('Public - Assessment Engine & Calculators')
@Controller()
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get('calculators/:slug')
  @ApiOperation({
    summary: 'Retrieve active published calculator configuration',
    description:
      'Fetches the latest published version of a calculator with ordered questions, options, display conditions, and categories. Internal scoring weights and proprietary rules are withheld.',
  })
  @ApiParam({
    name: 'slug',
    description: 'The unique slug identifier of the calculator (e.g. hr-health-check)',
    example: 'hr-health-check',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Active calculator configuration returned successfully',
    type: CalculatorConfigResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Calculator does not exist or has no published versions',
  })
  async getCalculatorConfig(
    @Param('slug') slug: string,
  ): Promise<CalculatorConfigResponseDto> {
    return this.assessmentsService.getCalculatorConfig(slug);
  }

  @Post('assessments/start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a new anonymous assessment session',
    description:
      'Initiates an assessment session with a cryptographically secure 64-character session token. Allows anonymous exploration prior to lead capture.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Assessment session started successfully',
    type: StartAssessmentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provided calculator slug does not exist or has no published version',
  })
  async startAssessment(
    @Body() dto: StartAssessmentDto,
    @Req() req: any,
  ): Promise<StartAssessmentResponseDto> {
    const ipAddress = (req.headers?.['x-forwarded-for'] as string) || req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.assessmentsService.startAssessment(dto, ipAddress, userAgent);
  }

  @Get('assessments/:sessionToken')
  @ApiOperation({
    summary: 'Retrieve assessment session state, progress, and saved answers',
    description:
      'Retrieves the live state of an assessment, dynamically evaluating conditional question visibility and calculating real-time progress.',
  })
  @ApiParam({
    name: 'sessionToken',
    description: '64-character session token returned from startAssessment',
    example: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assessment state retrieved successfully',
    type: AssessmentStateResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Assessment session not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Assessment session has expired',
  })
  async getAssessment(
    @Param('sessionToken') sessionToken: string,
  ): Promise<AssessmentStateResponseDto> {
    return this.assessmentsService.getAssessment(sessionToken);
  }

  @Put('assessments/:sessionToken/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autosave assessment answers idempotently',
    description:
      'Persists or updates question answers to PostgreSQL. Validates question ownership against the assessment version and recomputes progress.',
  })
  @ApiParam({
    name: 'sessionToken',
    description: '64-character session token',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Answers saved and progress updated successfully',
    type: SaveAnswersResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid question ID, mismatched option, or completed assessment',
  })
  async saveAnswers(
    @Param('sessionToken') sessionToken: string,
    @Body() dto: SaveAnswersDto,
  ): Promise<SaveAnswersResponseDto> {
    return this.assessmentsService.saveAnswers(sessionToken, dto);
  }

  @Post('assessments/:sessionToken/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete assessment session',
    description:
      'Validates that all visible required questions have answers and marks the assessment status as COMPLETED. Prepared for scoring and lead capture pipelines.',
  })
  @ApiParam({
    name: 'sessionToken',
    description: '64-character session token',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assessment marked as completed successfully',
    type: CompleteAssessmentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Required questions remain unanswered',
  })
  async completeAssessment(
    @Param('sessionToken') sessionToken: string,
  ): Promise<CompleteAssessmentResponseDto> {
    return this.assessmentsService.completeAssessment(sessionToken);
  }
}
