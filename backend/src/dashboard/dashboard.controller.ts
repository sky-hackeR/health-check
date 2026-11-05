import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import type { AdminAuthenticatedRequest } from '../auth/admin-session.guard';
import { LeadWorkflowService } from './lead-workflow.service';
import { LeadStatusDto } from './dto/lead-status.dto';
import { CreateLeadActivityDto } from './dto/lead-activity.dto';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/follow-up.dto';
import { UpdateWalkthroughDto } from './dto/walkthrough.dto';
import { CalculatorWorkspaceService } from './calculator-workspace.service';
import { CalculatorSubmissionsQueryDto } from './dto/calculator-submissions-query.dto';
import { AssessmentsQueryDto } from './dto/assessments-query.dto';
import { OperationalQueueQueryDto } from './dto/operational-queue-query.dto';
import { CreateWalkthroughDto } from './dto/create-walkthrough.dto';
import { LeadAssignmentDto } from './dto/lead-assignment.dto';
import { LeadQualificationDto } from './dto/lead-qualification.dto';
import {
  CreateCalculatorDraftDto,
  CreateRecommendationRuleDto,
  CreateRecommendationTemplateDto,
  CreateScoringRuleDto,
  IntelligenceListQueryDto,
  UpdateRecommendationRuleDto,
  UpdateRecommendationTemplateDto,
  UpdateScoreCategoryDto,
  UpdateScoringRuleDto,
} from './dto/intelligence-admin.dto';
import { IntelligenceAdminService } from './intelligence-admin.service';
import { CalculatorConfigurationService } from './calculator-configuration.service';
import {
  CalculatorQuestionDto,
  ReorderCalculatorQuestionsDto,
} from './dto/calculator-question.dto';
import { CalculatorSettingsDto } from './dto/calculator-settings.dto';
import { CalculatorEvaluationPreviewDto } from './dto/calculator-evaluation-preview.dto';
import {
  CompanyPainPointDto,
  CompanyPainPointListDto,
} from './dto/company-pain-point.dto';
import {
  ColdEmailTemplateDto,
  UpdateColdEmailTemplateDto,
  ColdEmailTemplateListQueryDto,
  ColdEmailPreviewDto,
} from './dto/cold-email-template.dto';

@ApiTags('Admin - Dashboard & Intelligence')
@ApiCookieAuth('admin-session')
@Controller('admin')
@UseGuards(AdminSessionGuard, PermissionsGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly leadWorkflowService: LeadWorkflowService,
    private readonly calculatorWorkspaceService: CalculatorWorkspaceService,
    private readonly intelligenceAdminService: IntelligenceAdminService,
    private readonly calculatorConfigurationService: CalculatorConfigurationService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('leads:read', 'assessments:read', 'calculators:read')
  @ApiOperation({
    summary: 'Retrieve live database-driven administrative dashboard metrics',
    description:
      'Aggregates real-time lead counts, completion rates, conversion rates, trends, status distribution, calculator engagement, recent leads, activities, and integration health from PostgreSQL.',
  })
  @ApiResponse({
    status: 200,
    description: 'Real-time aggregated dashboard metrics',
  })
  async getDashboard(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getDashboardMetrics(query);
  }

  @Get('leads')
  @RequirePermissions('leads:read')
  @ApiOperation({
    summary: 'List paginated, filtered, and searchable leads',
    description:
      'Returns paginated lead records directly from PostgreSQL with company details, assessment progress, and score metrics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated lead records',
  })
  async getLeads(@Query() query: LeadsQueryDto) {
    return this.dashboardService.getLeads(query);
  }

  @Get('administrators')
  @RequirePermissions('leads:read')
  async getActiveAdministrators() {
    return this.leadWorkflowService.getActiveAdministrators();
  }

  @Get('leads/:leadId')
  @RequirePermissions('leads:read')
  async getLeadDetail(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadWorkflowService.getLeadDetail(leadId);
  }

  @Patch('leads/:leadId/status')
  @RequirePermissions('leads:write')
  async transitionLead(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: LeadStatusDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.transitionLead(
      leadId,
      dto.status,
      request.adminUser!.id,
      dto.notes,
      dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    );
  }

  @Patch('leads/:leadId/assignment')
  @RequirePermissions('leads:write')
  async assignLead(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: LeadAssignmentDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.assignLead(
      leadId,
      request.adminUser!.id,
      dto,
    );
  }

  @Patch('leads/:leadId/qualification')
  @RequirePermissions('leads:write')
  async qualifyLead(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: LeadQualificationDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.qualifyLead(
      leadId,
      request.adminUser!.id,
      dto,
    );
  }

  @Post('leads/:leadId/activities')
  @RequirePermissions('leads:write')
  async addLeadActivity(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateLeadActivityDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.addActivity(
      leadId,
      request.adminUser!.id,
      dto,
    );
  }

  @Get('leads/:leadId/follow-ups')
  @RequirePermissions('leads:read')
  async getLeadFollowUps(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadWorkflowService.getFollowUpsForLead(leadId);
  }

  @Post('leads/:leadId/follow-ups')
  @RequirePermissions('leads:write')
  async createFollowUp(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateFollowUpDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.createFollowUp(
      leadId,
      request.adminUser!.id,
      dto,
    );
  }

  @Post('leads/:leadId/walkthroughs')
  @RequirePermissions('leads:write')
  async createWalkthrough(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateWalkthroughDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.createWalkthrough(
      leadId,
      request.adminUser!.id,
      dto,
    );
  }

  @Get('follow-ups')
  @RequirePermissions('leads:read')
  async getFollowUps(@Query() query: OperationalQueueQueryDto) {
    return this.leadWorkflowService.getFollowUps(query);
  }

  @Patch('follow-ups/:followUpId')
  @RequirePermissions('leads:write')
  async updateFollowUp(
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Body() dto: UpdateFollowUpDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.updateFollowUp(
      followUpId,
      request.adminUser!.id,
      dto,
    );
  }

  @Get('walkthroughs')
  @RequirePermissions('leads:read')
  async getWalkthroughs(@Query() query: OperationalQueueQueryDto) {
    return this.leadWorkflowService.getWalkthroughs(query);
  }

  @Patch('walkthroughs/:requestId')
  @RequirePermissions('leads:write')
  async updateWalkthrough(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: UpdateWalkthroughDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.leadWorkflowService.updateWalkthrough(
      requestId,
      request.adminUser!.id,
      dto,
    );
  }

  @Get('companies')
  @RequirePermissions('leads:read')
  async getCompanies(@Query() query: LeadsQueryDto) {
    return this.leadWorkflowService.getCompanies(query);
  }

  @Get('companies/:companyId')
  @RequirePermissions('leads:read')
  async getCompanyDetail(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.leadWorkflowService.getCompanyDetail(companyId);
  }

  @Get('calculators/:slug/workspace')
  @RequirePermissions('calculators:read')
  async getCalculatorWorkspace(@Param('slug') slug: string) {
    return this.calculatorWorkspaceService.getWorkspace(slug);
  }

  @Get('calculators/:slug/versions')
  @RequirePermissions('calculators:read')
  async getCalculatorVersions(@Param('slug') slug: string) {
    return this.calculatorConfigurationService.listVersions(slug);
  }

  @Post('calculators/:slug/evaluation-preview')
  @RequirePermissions('calculators:read')
  async previewCalculatorEvaluation(
    @Param('slug') slug: string,
    @Body() dto: CalculatorEvaluationPreviewDto,
  ) {
    return this.calculatorConfigurationService.previewEvaluation(slug, dto);
  }

  @Patch('calculators/:slug/settings')
  @RequirePermissions('calculators:write')
  async updateCalculatorSettings(
    @Param('slug') slug: string,
    @Body() dto: CalculatorSettingsDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.calculatorConfigurationService.updateSettings(
      slug,
      request.adminUser!.id,
      dto,
    );
  }

  @Post('calculators/:slug/versions/:sourceVersionId/drafts')
  @RequirePermissions('calculators:write')
  async createCalculatorDraft(
    @Param('slug') slug: string,
    @Param('sourceVersionId', ParseUUIDPipe) sourceVersionId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.calculatorConfigurationService.createDraft(
      slug,
      sourceVersionId,
      request.adminUser!.id,
    );
  }

  @Get('calculator-versions/:versionId/validate')
  @RequirePermissions('calculators:read')
  async validateCalculatorVersion(
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.calculatorConfigurationService.validateVersion(versionId);
  }

  @Post('calculator-versions/:versionId/publish')
  @RequirePermissions('calculators:write')
  async publishCalculatorVersion(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.calculatorConfigurationService.publishVersion(
      versionId,
      request.adminUser!.id,
    );
  }

  @Post('calculator-versions/:versionId/questions')
  @RequirePermissions('calculators:write')
  async createCalculatorQuestion(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: CalculatorQuestionDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.calculatorConfigurationService.createQuestion(
      versionId,
      request.adminUser!.id,
      dto,
    );
  }

  @Patch('calculator-questions/:questionId')
  @RequirePermissions('calculators:write')
  async updateCalculatorQuestion(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: CalculatorQuestionDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.calculatorConfigurationService.updateQuestion(
      questionId,
      request.adminUser!.id,
      dto,
    );
  }

  @Patch('calculator-questions/:questionId/archive')
  @RequirePermissions('calculators:write')
  async archiveCalculatorQuestion(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.calculatorConfigurationService.archiveQuestion(
      questionId,
      request.adminUser!.id,
    );
  }

  @Patch('calculator-versions/:versionId/questions/order')
  @RequirePermissions('calculators:write')
  async reorderCalculatorQuestions(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: ReorderCalculatorQuestionsDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.calculatorConfigurationService.reorderQuestions(
      versionId,
      request.adminUser!.id,
      dto.questionIds,
    );
  }

  @Get('assessments')
  @RequirePermissions('assessments:read')
  async getAssessments(@Query() query: AssessmentsQueryDto) {
    return this.calculatorWorkspaceService.getAssessments(query);
  }

  @Get('assessments/:assessmentId')
  @RequirePermissions('assessments:read')
  async getAssessmentDetail(
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.calculatorWorkspaceService.getAssessmentDetail(assessmentId);
  }

  @Get('calculators/:slug/submissions')
  @RequirePermissions('calculators:read', 'assessments:read')
  async getCalculatorSubmissions(
    @Param('slug') slug: string,
    @Query() query: CalculatorSubmissionsQueryDto,
  ) {
    return this.calculatorWorkspaceService.getSubmissions(slug, query);
  }

  @Get('intelligence/versions')
  @RequirePermissions('recommendations:manage')
  async listIntelligenceVersions() {
    return this.intelligenceAdminService.listVersions();
  }

  @Post('intelligence/versions/:sourceVersionId/draft')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createIntelligenceDraft(
    @Param('sourceVersionId', ParseUUIDPipe) sourceVersionId: string,
    @Body() dto: CreateCalculatorDraftDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createDraft(
      sourceVersionId,
      request.adminUser!.id,
      dto.changelog,
    );
  }

  @Post('intelligence/versions/:versionId/publish')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async publishIntelligenceVersion(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.publishVersion(
      versionId,
      request.adminUser!.id,
    );
  }

  @Get('intelligence/scoring-rules')
  @RequirePermissions('recommendations:manage')
  async listScoringRules(@Query() query: IntelligenceListQueryDto) {
    return this.intelligenceAdminService.listScoringRules(query);
  }

  @Post('intelligence/versions/:versionId/scoring-rules')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createScoringRule(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: CreateScoringRuleDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createScoringRule(
      versionId,
      request.adminUser!.id,
      dto,
    );
  }

  @Patch('intelligence/scoring-rules/:ruleId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async updateScoringRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateScoringRuleDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.updateScoringRule(
      ruleId,
      request.adminUser!.id,
      dto,
    );
  }

  @Delete('intelligence/scoring-rules/:ruleId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async deleteScoringRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.deleteScoringRule(
      ruleId,
      request.adminUser!.id,
    );
  }

  @Patch('intelligence/categories/:categoryId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async updateScoreCategory(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateScoreCategoryDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.updateScoreCategory(
      categoryId,
      request.adminUser!.id,
      dto,
    );
  }

  @Get('intelligence/recommendation-rules')
  @RequirePermissions('recommendations:manage')
  async listRecommendationRules(@Query() query: IntelligenceListQueryDto) {
    return this.intelligenceAdminService.listRecommendationRules(query);
  }

  @Post('intelligence/versions/:versionId/recommendation-rules')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createRecommendationRule(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: CreateRecommendationRuleDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createRecommendationRule(
      versionId,
      request.adminUser!.id,
      dto,
    );
  }

  @Patch('intelligence/recommendation-rules/:ruleId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async updateRecommendationRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateRecommendationRuleDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.updateRecommendationRule(
      ruleId,
      request.adminUser!.id,
      dto,
    );
  }

  @Delete('intelligence/recommendation-rules/:ruleId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async deleteRecommendationRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.deleteRecommendationRule(
      ruleId,
      request.adminUser!.id,
    );
  }

  @Get('intelligence/templates')
  @RequirePermissions('recommendations:manage')
  async listRecommendationTemplates(@Query() query: IntelligenceListQueryDto) {
    return this.intelligenceAdminService.listRecommendationTemplates(query);
  }

  @Post('intelligence/templates')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createRecommendationTemplate(
    @Body() dto: CreateRecommendationTemplateDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createRecommendationTemplate(
      request.adminUser!.id,
      dto,
    );
  }

  @Post('intelligence/templates/:templateId/draft')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createRecommendationTemplateDraft(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createRecommendationTemplateDraft(
      templateId,
      request.adminUser!.id,
    );
  }

  @Patch('intelligence/templates/:templateId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async updateRecommendationTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdateRecommendationTemplateDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.updateRecommendationTemplate(
      templateId,
      request.adminUser!.id,
      dto,
    );
  }

  @Post('intelligence/templates/:templateId/publish')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async publishRecommendationTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.publishRecommendationTemplate(
      templateId,
      request.adminUser!.id,
    );
  }

  @Post('intelligence/templates/:templateId/deactivate')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async deactivateRecommendationTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.deactivateRecommendationTemplate(
      templateId,
      request.adminUser!.id,
    );
  }

  @Get('intelligence/templates/:templateId/preview')
  @RequirePermissions('recommendations:manage')
  async previewRecommendationTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.intelligenceAdminService.previewRecommendationTemplate(templateId);
  }

  @Get('intelligence/versions/:versionId/preview/:assessmentId')
  @RequirePermissions('recommendations:manage')
  async previewIntelligenceVersion(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.intelligenceAdminService.preview(versionId, assessmentId);
  }

  @Get('intelligence/preview-assessments')
  @RequirePermissions('recommendations:manage')
  async listIntelligencePreviewAssessments(
    @Query() query: IntelligenceListQueryDto,
  ) {
    return this.intelligenceAdminService.listPreviewAssessments(query);
  }
  // ==============================================================================
  // COMPANY PAIN POINTS
  // ==============================================================================

  @Get('intelligence/pain-points')
  @RequirePermissions('recommendations:manage')
  async listCompanyPainPoints(@Query() query: CompanyPainPointListDto) {
    return this.intelligenceAdminService.listCompanyPainPoints(query);
  }

  @Post('intelligence/pain-points')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createCompanyPainPoint(
    @Body() dto: CompanyPainPointDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createCompanyPainPointDraft(
      request.adminUser!.id,
      dto,
    );
  }

  @Post('intelligence/pain-points/:pointId/version')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createCompanyPainPointVersion(
    @Param('pointId', ParseUUIDPipe) pointId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createCompanyPainPointVersion(
      pointId,
      request.adminUser!.id,
    );
  }

  @Patch('intelligence/pain-points/:pointId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async updateCompanyPainPoint(
    @Param('pointId', ParseUUIDPipe) pointId: string,
    @Body() dto: CompanyPainPointDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.updateCompanyPainPoint(
      pointId,
      request.adminUser!.id,
      dto,
    );
  }

  @Post('intelligence/pain-points/:pointId/publish')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async publishCompanyPainPoint(
    @Param('pointId', ParseUUIDPipe) pointId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.publishCompanyPainPoint(
      pointId,
      request.adminUser!.id,
    );
  }

  // ==============================================================================
  // COLD EMAIL TEMPLATES
  // ==============================================================================

  @Get('intelligence/cold-email-templates')
  @RequirePermissions('recommendations:manage')
  async listColdEmailTemplates(@Query() query: ColdEmailTemplateListQueryDto) {
    return this.intelligenceAdminService.listColdEmailTemplates(query);
  }

  @Post('intelligence/cold-email-templates')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createColdEmailTemplate(
    @Body() dto: ColdEmailTemplateDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createColdEmailTemplateDraft(
      request.adminUser!.id,
      dto,
    );
  }

  @Post('intelligence/cold-email-templates/:templateId/version')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async createColdEmailTemplateVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.createColdEmailTemplateVersion(
      templateId,
      request.adminUser!.id,
    );
  }

  @Patch('intelligence/cold-email-templates/:templateId')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async updateColdEmailTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdateColdEmailTemplateDto,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.updateColdEmailTemplate(
      templateId,
      request.adminUser!.id,
      dto,
    );
  }

  @Post('intelligence/cold-email-templates/:templateId/publish')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async publishColdEmailTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.publishColdEmailTemplate(
      templateId,
      request.adminUser!.id,
    );
  }

  @Post('intelligence/cold-email-templates/:templateId/archive')
  @RequirePermissions('recommendations:manage', 'calculators:write')
  async archiveColdEmailTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() request: AdminAuthenticatedRequest,
  ) {
    return this.intelligenceAdminService.archiveColdEmailTemplate(
      templateId,
      request.adminUser!.id,
    );
  }

  @Get('intelligence/cold-email-templates/:templateId/preview/:assessmentId')
  @RequirePermissions('recommendations:manage')
  async previewColdEmail(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Query() dto: ColdEmailPreviewDto,
  ) {
    return this.intelligenceAdminService.previewColdEmail(
      templateId,
      assessmentId,
      dto,
    );
  }

}
