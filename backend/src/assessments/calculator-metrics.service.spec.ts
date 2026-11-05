import { BadRequestException } from '@nestjs/common';
import { AnswerSnapshot } from './condition-evaluator';
import { CalculatorMetricsService } from './calculator-metrics.service';

function answer(
  questionCode: string,
  value: string | number,
): AnswerSnapshot {
  return {
    questionId: questionCode,
    questionCode,
    selectedOptionValue: typeof value === 'string' ? value : null,
    numericValue: typeof value === 'number' ? value : null,
  };
}

describe('CalculatorMetricsService', () => {
  const service = new CalculatorMetricsService();

  it('calculates complete payroll costs without treating employee deductions as employer costs', () => {
    const result = service.calculate('payroll-cost-calculator', [
      answer('PC_EMPLOYEE_COUNT', 10),
      answer('PC_RUNS_PER_YEAR', 12),
      answer('PC_REGULAR_GROSS_PER_RUN', 1_000_000),
      answer('PC_VARIABLE_STATUS', 'verified_amount'),
      answer('PC_VARIABLE_GROSS_PER_RUN', 100_000),
      answer('PC_EMPLOYER_STATUTORY_STATUS', 'verified_amount'),
      answer('PC_EMPLOYER_STATUTORY_PER_RUN', 80_000),
      answer('PC_BENEFITS_STATUS', 'verified_zero'),
      answer('PC_PROCESSING_STATUS', 'verified_amount'),
      answer('PC_PROCESSING_PER_RUN', 20_000),
    ]);

    expect(result?.metrics).toEqual({
      resultType: 'PAYROLL_COST_ESTIMATE',
      status: 'COMPLETE',
      currency: 'NGN',
      employeeCount: 10,
      payrollRunsPerYear: 12,
      componentsPerRun: {
        regularGrossPay: 1_000_000,
        variableGrossPay: 100_000,
        employerPaidStatutoryAmounts: 80_000,
        benefits: 0,
        processingAndServiceCosts: 20_000,
      },
      knownSubtotalPerRun: 1_200_000,
      knownAnnualizedSubtotal: 14_400_000,
      totalPerRun: 1_200_000,
      totalAnnualized: 14_400_000,
      perEmployeeAnnualized: 1_440_000,
      unknownComponents: [],
    });
  });

  it('maps newly authored questions only through an explicitly supported calculation key', () => {
      const result = service.calculate('payroll-cost-calculator', [
        { ...answer('CUSTOM_EMPLOYEES', 3), calculationKey: 'PC_EMPLOYEE_COUNT' },
        { ...answer('CUSTOM_RUNS', 12), calculationKey: 'PC_RUNS_PER_YEAR' },
        { ...answer('CUSTOM_GROSS', 50_000), calculationKey: 'PC_REGULAR_GROSS_PER_RUN' },
        { ...answer('CUSTOM_VARIABLE_STATUS', 'unknown'), calculationKey: 'PC_VARIABLE_STATUS' },
        { ...answer('CUSTOM_STATUTORY_STATUS', 'verified_zero'), calculationKey: 'PC_EMPLOYER_STATUTORY_STATUS' },
        { ...answer('CUSTOM_BENEFITS_STATUS', 'verified_zero'), calculationKey: 'PC_BENEFITS_STATUS' },
        { ...answer('CUSTOM_PROCESSING_STATUS', 'verified_zero'), calculationKey: 'PC_PROCESSING_STATUS' },
      ]);

      expect(result?.metrics).toMatchObject({
        resultType: 'PAYROLL_COST_ESTIMATE',
        employeeCount: 3,
        payrollRunsPerYear: 12,
        knownSubtotalPerRun: 50_000,
        status: 'PARTIAL',
      });
    });

  it('keeps unknown payroll inputs out of the total and discloses a known subtotal', () => {
    const result = service.calculate('payroll-cost-calculator', [
      answer('PC_EMPLOYEE_COUNT', 2),
      answer('PC_RUNS_PER_YEAR', 26),
      answer('PC_REGULAR_GROSS_PER_RUN', 100_000),
      answer('PC_VARIABLE_STATUS', 'unknown'),
      answer('PC_EMPLOYER_STATUTORY_STATUS', 'verified_zero'),
      answer('PC_BENEFITS_STATUS', 'unknown'),
      answer('PC_PROCESSING_STATUS', 'verified_amount'),
      answer('PC_PROCESSING_PER_RUN', 1_250.25),
    ]);

    expect(result?.metrics).toMatchObject({
      status: 'PARTIAL',
      knownSubtotalPerRun: 101_250.25,
      knownAnnualizedSubtotal: 2_632_506.5,
      totalPerRun: null,
      totalAnnualized: null,
      perEmployeeAnnualized: null,
      unknownComponents: ['Variable gross pay', 'Benefits'],
    });
    expect(result?.recommendations).toHaveLength(1);
  });

  it('rejects invalid payroll bounds and non-finite numeric values', () => {
    expect(() =>
      service.calculate('payroll-cost-calculator', [
        answer('PC_EMPLOYEE_COUNT', 1.5),
        answer('PC_RUNS_PER_YEAR', 12),
        answer('PC_REGULAR_GROSS_PER_RUN', 1),
        answer('PC_VARIABLE_STATUS', 'verified_zero'),
        answer('PC_EMPLOYER_STATUTORY_STATUS', 'verified_zero'),
        answer('PC_BENEFITS_STATUS', 'verified_zero'),
        answer('PC_PROCESSING_STATUS', 'verified_zero'),
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      service.calculate('payroll-cost-calculator', [
        answer('PC_EMPLOYEE_COUNT', 1),
        answer('PC_RUNS_PER_YEAR', 12),
        answer('PC_REGULAR_GROSS_PER_RUN', Number.POSITIVE_INFINITY),
        answer('PC_VARIABLE_STATUS', 'verified_zero'),
        answer('PC_EMPLOYER_STATUTORY_STATUS', 'verified_zero'),
        answer('PC_BENEFITS_STATUS', 'verified_zero'),
        answer('PC_PROCESSING_STATUS', 'verified_zero'),
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects a known cost component with a missing amount', () => {
    expect(() =>
      service.calculate('payroll-cost-calculator', [
        answer('PC_EMPLOYEE_COUNT', 1),
        answer('PC_RUNS_PER_YEAR', 12),
        answer('PC_REGULAR_GROSS_PER_RUN', 100),
        answer('PC_VARIABLE_STATUS', 'verified_amount'),
        answer('PC_EMPLOYER_STATUTORY_STATUS', 'verified_zero'),
        answer('PC_BENEFITS_STATUS', 'verified_zero'),
        answer('PC_PROCESSING_STATUS', 'verified_zero'),
      ]),
    ).toThrow(BadRequestException);
  });

  it('reports payroll evidence coverage, excluding explained not-applicable items', () => {
    const result = service.calculate('payroll-compliance-calculator', [
      answer('NG_JURISDICTION', 'nigeria'),
      answer('NG_MULTIPLE_JURISDICTIONS', 'no'),
      answer('NG_PAYROLL_RECORDS', 'verified'),
      answer('NG_EMPLOYEE_PAY_DOCUMENTS', 'partial'),
      answer('NG_TAX_REMITTANCE_RECORDS', 'not_verified'),
      answer('NG_EMPLOYER_CONTRIBUTION_RECORDS', 'not_applicable'),
      answer('NG_EMPLOYER_CONTRIBUTION_RECORDS_NA_REASON', 'adviser_confirmed'),
      answer('NG_PAYROLL_RECONCILIATION', 'verified'),
    ]);

    expect(result?.metrics).toMatchObject({
      resultType: 'PAYROLL_COMPLIANCE_EVIDENCE',
      jurisdiction: 'Nigeria',
      status: 'SUPPORTED',
      evidenceCoverage: {
        verified: 2,
        partial: 1,
        notVerified: 1,
        notApplicable: 1,
        applicableItems: 4,
        verifiedPercent: 50,
      },
    });
    expect(result?.recommendations).toHaveLength(2);
  });

  it('keeps an uncertain not-applicable item in the follow-up denominator', () => {
    const result = service.calculate('payroll-compliance-calculator', [
      answer('NG_JURISDICTION', 'nigeria'),
      answer('NG_MULTIPLE_JURISDICTIONS', 'no'),
      answer('NG_PAYROLL_RECORDS', 'verified'),
      answer('NG_EMPLOYEE_PAY_DOCUMENTS', 'verified'),
      answer('NG_TAX_REMITTANCE_RECORDS', 'verified'),
      answer('NG_EMPLOYER_CONTRIBUTION_RECORDS', 'not_applicable'),
      answer('NG_EMPLOYER_CONTRIBUTION_RECORDS_NA_REASON', 'not_sure'),
      answer('NG_PAYROLL_RECONCILIATION', 'verified'),
    ]);

    expect(result?.metrics).toMatchObject({
      evidenceCoverage: {
        verified: 4,
        notVerified: 1,
        notApplicable: 0,
        applicableItems: 5,
        verifiedPercent: 80,
      },
      checklist: [
        {},
        {},
        {},
        {
          status: 'NOT_VERIFIED',
          reportedStatus: 'not_applicable',
          reason: 'not_sure',
        },
        {},
      ],
    });
  });

  it('does not score or apply Nigeria checklist content to other jurisdictions', () => {
    const result = service.calculate('payroll-compliance-calculator', [
      answer('NG_JURISDICTION', 'other'),
      answer('NG_MULTIPLE_JURISDICTIONS', 'no'),
    ]);

    expect(result?.metrics).toMatchObject({
      resultType: 'PAYROLL_COMPLIANCE_EVIDENCE',
      status: 'UNSUPPORTED_JURISDICTION',
      jurisdiction: 'Unsupported jurisdiction',
      evidenceCoverage: null,
      checklist: [],
    });
  });

  it('calculates complete and partial HR administrative costs without ROI claims', () => {
    const complete = service.calculate('hr-administrative-cost-calculator', [
      answer('HA_EMPLOYEE_COUNT', 20),
      answer('HA_HOURS_PER_WEEK', 8),
      answer('HA_LOADED_HOURLY_COST', 2_500),
      answer('HA_SOFTWARE_STATUS', 'verified_amount'),
      answer('HA_SOFTWARE_ANNUAL', 120_000),
      answer('HA_EXTERNAL_SERVICES_STATUS', 'verified_zero'),
    ]);
    expect(complete?.metrics).toMatchObject({
      status: 'COMPLETE',
      componentsPerYear: {
        allocatedLaborCost: 1_040_000,
        softwareCost: 120_000,
        externalServiceCost: 0,
      },
      totalPerYear: 1_160_000,
      totalPerMonth: 96_666.67,
      perEmployeeAnnualized: 58_000,
    });

    const partial = service.calculate('hr-administrative-cost-calculator', [
      answer('HA_EMPLOYEE_COUNT', 20),
      answer('HA_HOURS_PER_WEEK', 8),
      answer('HA_LOADED_HOURLY_COST', 2_500),
      answer('HA_SOFTWARE_STATUS', 'unknown'),
      answer('HA_EXTERNAL_SERVICES_STATUS', 'verified_amount'),
      answer('HA_EXTERNAL_SERVICES_ANNUAL', 50_000),
    ]);
    expect(partial?.metrics).toMatchObject({
      status: 'PARTIAL',
      knownSubtotalPerYear: 1_090_000,
      totalPerYear: null,
      totalPerMonth: null,
      unknownComponents: ['HR software'],
    });
    expect(partial?.recommendations).toHaveLength(1);
  });

  it('leaves health-check scoring to the existing scoring service', () => {
    expect(service.calculate('hr-health-check', [])).toBeNull();
  });
});
