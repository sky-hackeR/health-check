import { BadRequestException, Injectable } from '@nestjs/common';
import { RecommendationPriority } from '@prisma/client';
import { AnswerSnapshot } from './condition-evaluator';

export type CalculatorResultType =
  | 'HR_HEALTH_CHECK'
  | 'PAYROLL_COST_ESTIMATE'
  | 'PAYROLL_COMPLIANCE_EVIDENCE'
  | 'HR_ADMINISTRATIVE_COST_ESTIMATE';

export interface DomainRecommendation {
  templateCode: string;
  title: string;
  summary: string;
  actionPlan: string;
  priority: RecommendationPriority;
}

export interface PayrollCostMetrics {
  resultType: 'PAYROLL_COST_ESTIMATE';
  status: 'COMPLETE' | 'PARTIAL';
  currency: 'NGN';
  employeeCount: number;
  payrollRunsPerYear: number;
  componentsPerRun: {
    regularGrossPay: number;
    variableGrossPay: number | null;
    employerPaidStatutoryAmounts: number | null;
    benefits: number | null;
    processingAndServiceCosts: number | null;
  };
  knownSubtotalPerRun: number;
  knownAnnualizedSubtotal: number;
  totalPerRun: number | null;
  totalAnnualized: number | null;
  perEmployeeAnnualized: number | null;
  unknownComponents: string[];
}

export interface PayrollComplianceMetrics {
  resultType: 'PAYROLL_COMPLIANCE_EVIDENCE';
  jurisdiction: 'Nigeria' | 'Unsupported jurisdiction';
  status: 'SUPPORTED' | 'UNSUPPORTED_JURISDICTION';
  checklistVersion: 'NG-PAYROLL-EVIDENCE-V1';
  scopeNotice: string;
  operatesInMultipleJurisdictions: boolean | null;
  evidenceCoverage: {
    verified: number;
    partial: number;
    notVerified: number;
    notApplicable: number;
    applicableItems: number;
    verifiedPercent: number | null;
  } | null;
  checklist: Array<{
    code: string;
    label: string;
    status: 'VERIFIED' | 'PARTIAL' | 'NOT_VERIFIED' | 'NOT_APPLICABLE';
    reportedStatus: 'verified' | 'partial' | 'not_verified' | 'not_applicable';
    reason?: string;
  }>;
}

export interface HrAdministrativeCostMetrics {
  resultType: 'HR_ADMINISTRATIVE_COST_ESTIMATE';
  status: 'COMPLETE' | 'PARTIAL';
  currency: 'NGN';
  employeeCount: number;
  componentsPerYear: {
    allocatedLaborCost: number;
    softwareCost: number | null;
    externalServiceCost: number | null;
  };
  knownSubtotalPerYear: number;
  knownMonthlySubtotal: number;
  totalPerYear: number | null;
  totalPerMonth: number | null;
  perEmployeeAnnualized: number | null;
  unknownComponents: string[];
}

export type DomainCalculatorMetrics =
  | PayrollCostMetrics
  | PayrollComplianceMetrics
  | HrAdministrativeCostMetrics;

export interface DomainCalculatorResult {
  metrics: DomainCalculatorMetrics;
  recommendations: DomainRecommendation[];
}

interface CostComponent {
  value: number | null;
  unknownLabel: string | null;
}

const COMPLIANCE_CHECKS = [
  { code: 'NG_PAYROLL_RECORDS', label: 'Payroll records and calculation support' },
  { code: 'NG_EMPLOYEE_PAY_DOCUMENTS', label: 'Employee pay documentation' },
  { code: 'NG_TAX_REMITTANCE_RECORDS', label: 'Payroll tax and remittance evidence' },
  { code: 'NG_EMPLOYER_CONTRIBUTION_RECORDS', label: 'Employer contribution records' },
  { code: 'NG_PAYROLL_RECONCILIATION', label: 'Payroll-period reconciliation and review' },
] as const;

const COMPLIANCE_SCOPE_NOTICE =
  'This is a self-reported evidence checklist, not a legal compliance determination. It does not state legal obligations, verify documents, or evaluate state-specific rules.';

@Injectable()
export class CalculatorMetricsService {
  calculate(
    calculatorSlug: string,
    answers: AnswerSnapshot[],
  ): DomainCalculatorResult | null {
    const answersByCode = new Map(
      answers.map((answer) => [
        answer.calculationKey || answer.questionCode,
        answer,
      ]),
    );

    switch (calculatorSlug) {
      case 'payroll-cost-calculator':
        return this.calculatePayrollCost(answersByCode);
      case 'payroll-compliance-calculator':
        return this.calculatePayrollCompliance(answersByCode);
      case 'hr-administrative-cost-calculator':
        return this.calculateHrAdministrativeCost(answersByCode);
      default:
        return null;
    }
  }

  private calculatePayrollCost(
    answers: Map<string, AnswerSnapshot>,
  ): DomainCalculatorResult {
    const employeeCount = this.requiredNumber(answers, 'PC_EMPLOYEE_COUNT', {
      integer: true,
      minimum: 1,
      maximum: 1_000_000,
    });
    const payrollRunsPerYear = this.requiredNumber(answers, 'PC_RUNS_PER_YEAR', {
      integer: true,
      minimum: 1,
      maximum: 366,
    });
    const regularGrossPay = this.requiredNumber(answers, 'PC_REGULAR_GROSS_PER_RUN', {
      minimum: 0,
    });
    const variable = this.optionalCostComponent(
      answers,
      'PC_VARIABLE_STATUS',
      'PC_VARIABLE_GROSS_PER_RUN',
      'Variable gross pay',
    );
    const statutory = this.optionalCostComponent(
      answers,
      'PC_EMPLOYER_STATUTORY_STATUS',
      'PC_EMPLOYER_STATUTORY_PER_RUN',
      'Employer-paid statutory amounts',
    );
    const benefits = this.optionalCostComponent(
      answers,
      'PC_BENEFITS_STATUS',
      'PC_BENEFITS_PER_RUN',
      'Benefits',
    );
    const processing = this.optionalCostComponent(
      answers,
      'PC_PROCESSING_STATUS',
      'PC_PROCESSING_PER_RUN',
      'Processing and service costs',
    );

    const unknownComponents = [variable, statutory, benefits, processing]
      .map((component) => component.unknownLabel)
      .filter((label): label is string => label !== null);
    const knownSubtotalPerRun = this.roundMoney(
      regularGrossPay +
        (variable.value ?? 0) +
        (statutory.value ?? 0) +
        (benefits.value ?? 0) +
        (processing.value ?? 0),
    );
    const totalPerRun =
      unknownComponents.length === 0 ? knownSubtotalPerRun : null;
    const totalAnnualized =
      totalPerRun === null
        ? null
        : this.roundMoney(totalPerRun * payrollRunsPerYear);

    const metrics: PayrollCostMetrics = {
      resultType: 'PAYROLL_COST_ESTIMATE',
      status: unknownComponents.length === 0 ? 'COMPLETE' : 'PARTIAL',
      currency: 'NGN',
      employeeCount,
      payrollRunsPerYear,
      componentsPerRun: {
        regularGrossPay,
        variableGrossPay: variable.value,
        employerPaidStatutoryAmounts: statutory.value,
        benefits: benefits.value,
        processingAndServiceCosts: processing.value,
      },
      knownSubtotalPerRun,
      knownAnnualizedSubtotal: this.roundMoney(
        knownSubtotalPerRun * payrollRunsPerYear,
      ),
      totalPerRun,
      totalAnnualized,
      perEmployeeAnnualized:
        totalAnnualized === null
          ? null
          : this.roundMoney(totalAnnualized / employeeCount),
      unknownComponents,
    };

    return {
      metrics,
      recommendations:
        unknownComponents.length > 0
          ? [
              {
                templateCode: 'REC_VERIFY_PAYROLL_COST_INPUTS',
                title: 'Verify the remaining payroll cost inputs',
                summary:
                  'Some payroll cost components were marked as unknown, so the estimate is incomplete.',
                actionPlan:
                  `Review available payroll records for: ${unknownComponents.join(', ')}. Unknown components are not treated as zero.`,
                priority: RecommendationPriority.MEDIUM,
              },
            ]
          : [],
    };
  }

  private calculatePayrollCompliance(
    answers: Map<string, AnswerSnapshot>,
  ): DomainCalculatorResult {
    const jurisdiction = this.requiredSelection(answers, 'NG_JURISDICTION');
    const multipleJurisdictions =
      this.requiredSelection(answers, 'NG_MULTIPLE_JURISDICTIONS');
    if (multipleJurisdictions !== 'yes' && multipleJurisdictions !== 'no') {
      throw new BadRequestException('The multiple-jurisdiction response is invalid.');
    }
    const operatesInMultipleJurisdictions = multipleJurisdictions === 'yes';

    if (jurisdiction !== 'nigeria') {
      const metrics: PayrollComplianceMetrics = {
        resultType: 'PAYROLL_COMPLIANCE_EVIDENCE',
        jurisdiction: 'Unsupported jurisdiction',
        status: 'UNSUPPORTED_JURISDICTION',
        checklistVersion: 'NG-PAYROLL-EVIDENCE-V1',
        scopeNotice:
          'The current evidence checklist is configured for Nigeria only. No jurisdiction-specific checklist or conclusion was generated.',
        operatesInMultipleJurisdictions,
        evidenceCoverage: null,
        checklist: [],
      };
      return { metrics, recommendations: [] };
    }

    let verified = 0;
    let partial = 0;
    let notVerified = 0;
    let notApplicable = 0;
    const checklist: PayrollComplianceMetrics['checklist'] = [];
    const recommendations: DomainRecommendation[] = [];

    for (const check of COMPLIANCE_CHECKS) {
      const reportedStatus = this.requiredSelection(answers, check.code);
      if (
        reportedStatus !== 'verified' &&
        reportedStatus !== 'partial' &&
        reportedStatus !== 'not_verified' &&
        reportedStatus !== 'not_applicable'
      ) {
        throw new BadRequestException(`The response for "${check.label}" is invalid.`);
      }

      const reason =
        reportedStatus === 'not_applicable'
          ? this.requiredSelection(answers, `${check.code}_NA_REASON`)
          : undefined;
      if (
        reason !== undefined &&
        reason !== 'adviser_confirmed' &&
        reason !== 'documented_reason' &&
        reason !== 'not_sure'
      ) {
        throw new BadRequestException(
          `The not-applicable reason for "${check.label}" is invalid.`,
        );
      }
      const isUncertainNotApplicable =
        reportedStatus === 'not_applicable' && reason === 'not_sure';
      let status: PayrollComplianceMetrics['checklist'][number]['status'];

      if (reportedStatus === 'verified') {
        status = 'VERIFIED';
        verified += 1;
      } else if (reportedStatus === 'partial') {
        status = 'PARTIAL';
        partial += 1;
      } else if (reportedStatus === 'not_verified' || isUncertainNotApplicable) {
        status = 'NOT_VERIFIED';
        notVerified += 1;
      } else {
        status = 'NOT_APPLICABLE';
        notApplicable += 1;
      }

      checklist.push({
        code: check.code,
        label: check.label,
        status,
        reportedStatus,
        ...(reason ? { reason } : {}),
      });

      if (status === 'PARTIAL' || status === 'NOT_VERIFIED') {
        recommendations.push({
          templateCode: 'REC_REVIEW_PAYROLL_EVIDENCE',
          title: `Review ${check.label.toLowerCase()}`,
          summary:
            status === 'PARTIAL'
              ? `Evidence for ${check.label.toLowerCase()} was reported as partial.`
              : `Evidence for ${check.label.toLowerCase()} was not verified.`,
          actionPlan:
            'Review the relevant records with a qualified payroll or legal adviser. This checklist does not determine whether a legal requirement applies.',
          priority: RecommendationPriority.MEDIUM,
        });
      }
    }

    const applicableItems = verified + partial + notVerified;
    const metrics: PayrollComplianceMetrics = {
      resultType: 'PAYROLL_COMPLIANCE_EVIDENCE',
      jurisdiction: 'Nigeria',
      status: 'SUPPORTED',
      checklistVersion: 'NG-PAYROLL-EVIDENCE-V1',
      scopeNotice: COMPLIANCE_SCOPE_NOTICE,
      operatesInMultipleJurisdictions,
      evidenceCoverage: {
        verified,
        partial,
        notVerified,
        notApplicable,
        applicableItems,
        verifiedPercent:
          applicableItems > 0
            ? Number(((verified / applicableItems) * 100).toFixed(1))
            : null,
      },
      checklist,
    };

    return { metrics, recommendations };
  }

  private calculateHrAdministrativeCost(
    answers: Map<string, AnswerSnapshot>,
  ): DomainCalculatorResult {
    const employeeCount = this.requiredNumber(answers, 'HA_EMPLOYEE_COUNT', {
      integer: true,
      minimum: 1,
      maximum: 1_000_000,
    });
    const hoursPerWeek = this.requiredNumber(answers, 'HA_HOURS_PER_WEEK', {
      minimum: 0,
      maximum: 168,
    });
    const loadedHourlyCost = this.requiredNumber(answers, 'HA_LOADED_HOURLY_COST', {
      minimum: 0,
    });
    const software = this.optionalCostComponent(
      answers,
      'HA_SOFTWARE_STATUS',
      'HA_SOFTWARE_ANNUAL',
      'HR software',
    );
    const externalServices = this.optionalCostComponent(
      answers,
      'HA_EXTERNAL_SERVICES_STATUS',
      'HA_EXTERNAL_SERVICES_ANNUAL',
      'External HR services',
    );
    const allocatedLaborCost = this.roundMoney(hoursPerWeek * loadedHourlyCost * 52);
    const unknownComponents = [software, externalServices]
      .map((component) => component.unknownLabel)
      .filter((label): label is string => label !== null);
    const knownSubtotalPerYear = this.roundMoney(
      allocatedLaborCost + (software.value ?? 0) + (externalServices.value ?? 0),
    );
    const totalPerYear =
      unknownComponents.length === 0 ? knownSubtotalPerYear : null;
    const totalPerMonth =
      totalPerYear === null ? null : this.roundMoney(totalPerYear / 12);

    const metrics: HrAdministrativeCostMetrics = {
      resultType: 'HR_ADMINISTRATIVE_COST_ESTIMATE',
      status: unknownComponents.length === 0 ? 'COMPLETE' : 'PARTIAL',
      currency: 'NGN',
      employeeCount,
      componentsPerYear: {
        allocatedLaborCost,
        softwareCost: software.value,
        externalServiceCost: externalServices.value,
      },
      knownSubtotalPerYear,
      knownMonthlySubtotal: this.roundMoney(knownSubtotalPerYear / 12),
      totalPerYear,
      totalPerMonth,
      perEmployeeAnnualized:
        totalPerYear === null
          ? null
          : this.roundMoney(totalPerYear / employeeCount),
      unknownComponents,
    };

    return {
      metrics,
      recommendations:
        unknownComponents.length > 0
          ? [
              {
                templateCode: 'REC_VERIFY_HR_ADMIN_COST_INPUTS',
                title: 'Complete the HR administration cost inputs',
                summary:
                  'Some annual HR software or external service costs were marked as unknown, so the estimate is incomplete.',
                actionPlan:
                  `Review invoices or finance records for: ${unknownComponents.join(', ')}. Unknown components are not treated as zero.`,
                priority: RecommendationPriority.MEDIUM,
              },
            ]
          : [],
    };
  }

  private optionalCostComponent(
    answers: Map<string, AnswerSnapshot>,
    statusCode: string,
    amountCode: string,
    label: string,
  ): CostComponent {
    const status = this.requiredSelection(answers, statusCode);
    if (status === 'verified_zero') {
      return { value: 0, unknownLabel: null };
    }
    if (status === 'unknown') {
      return { value: null, unknownLabel: label };
    }
    if (status !== 'verified_amount') {
      throw new BadRequestException(`The response for "${label}" is invalid.`);
    }
    return {
      value: this.requiredNumber(answers, amountCode, { minimum: 0 }),
      unknownLabel: null,
    };
  }

  private requiredSelection(
    answers: Map<string, AnswerSnapshot>,
    questionCode: string,
  ): string {
    const value = answers.get(questionCode)?.selectedOptionValue;
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException(`A valid response for "${questionCode}" is required.`);
    }
    return value;
  }

  private requiredNumber(
    answers: Map<string, AnswerSnapshot>,
    questionCode: string,
    bounds: { minimum: number; maximum?: number; integer?: boolean },
  ): number {
    const value = answers.get(questionCode)?.numericValue;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < bounds.minimum ||
      (bounds.maximum !== undefined && value > bounds.maximum) ||
      (bounds.integer && !Number.isInteger(value))
    ) {
      throw new BadRequestException(`A valid numeric response for "${questionCode}" is required.`);
    }
    return value;
  }

  private roundMoney(value: number): number {
    if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) {
      throw new BadRequestException('The supplied values exceed the supported calculation range.');
    }
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
