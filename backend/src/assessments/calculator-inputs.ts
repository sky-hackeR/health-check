const payrollComplianceEvidenceCodes = [
  'NG_PAYROLL_RECORDS',
  'NG_EMPLOYEE_PAY_DOCUMENTS',
  'NG_TAX_REMITTANCE_RECORDS',
  'NG_EMPLOYER_CONTRIBUTION_RECORDS',
  'NG_PAYROLL_RECONCILIATION',
] as const;

export const SUPPORTED_CALCULATOR_INPUT_KEYS: Record<string, readonly string[]> = {
  'payroll-cost-calculator': [
    'PC_EMPLOYEE_COUNT',
    'PC_RUNS_PER_YEAR',
    'PC_REGULAR_GROSS_PER_RUN',
    'PC_VARIABLE_STATUS',
    'PC_VARIABLE_GROSS_PER_RUN',
    'PC_EMPLOYER_STATUTORY_STATUS',
    'PC_EMPLOYER_STATUTORY_PER_RUN',
    'PC_BENEFITS_STATUS',
    'PC_BENEFITS_PER_RUN',
    'PC_PROCESSING_STATUS',
    'PC_PROCESSING_PER_RUN',
  ],
  'payroll-compliance-calculator': [
    'NG_JURISDICTION',
    'NG_MULTIPLE_JURISDICTIONS',
    ...payrollComplianceEvidenceCodes.flatMap((code) => [code, `${code}_NA_REASON`]),
  ],
  'hr-administrative-cost-calculator': [
    'HA_EMPLOYEE_COUNT',
    'HA_HOURS_PER_WEEK',
    'HA_LOADED_HOURLY_COST',
    'HA_SOFTWARE_STATUS',
    'HA_SOFTWARE_ANNUAL',
    'HA_EXTERNAL_SERVICES_STATUS',
    'HA_EXTERNAL_SERVICES_ANNUAL',
  ],
};

export const SUPPORTED_QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'NUMERIC_INPUT',
  'SLIDER',
  'BOOLEAN',
] as const;
