import { PrismaClient, QuestionType, RecommendationPriority } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Generates a secure scrypt password hash using Node.js built-in crypto.
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  console.log('🌱 Starting GoSwiftHR Intelligence database seed...');

  // ============================================================================
  // 1. SEED PERMISSIONS
  // ============================================================================
  const permissionsData = [
    { slug: 'calculators:read', name: 'View Calculators', module: 'CALCULATORS', description: 'Can view calculator configurations' },
    { slug: 'calculators:write', name: 'Edit Calculators', module: 'CALCULATORS', description: 'Can create and modify calculators' },
    { slug: 'calculators:publish', name: 'Publish Calculators', module: 'CALCULATORS', description: 'Can publish new calculator versions' },
    { slug: 'assessments:read', name: 'View Assessments', module: 'ASSESSMENTS', description: 'Can view assessment submissions and results' },
    { slug: 'assessments:export', name: 'Export Assessments', module: 'ASSESSMENTS', description: 'Can export assessment datasets' },
    { slug: 'leads:read', name: 'View Leads', module: 'LEADS', description: 'Can view captured leads and activities' },
    { slug: 'leads:write', name: 'Manage Leads', module: 'LEADS', description: 'Can update lead status and qualification tiers' },
    { slug: 'leads:export', name: 'Export Leads', module: 'LEADS', description: 'Can export lead contact lists' },
    { slug: 'recommendations:manage', name: 'Manage Recommendations', module: 'RECOMMENDATIONS', description: 'Can create and edit recommendation templates' },
    { slug: 'users:manage', name: 'Manage Admin Users', module: 'ADMIN', description: 'Can invite and modify admin users and roles' },
    { slug: 'audit:read', name: 'View Audit Logs', module: 'AUDIT', description: 'Can inspect system audit trails' },
    { slug: 'settings:manage', name: 'Manage Settings', module: 'SETTINGS', description: 'Can configure system integrations and settings' },
  ];

  const permissions: Record<string, string> = {};
  for (const p of permissionsData) {
    const record = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, module: p.module, description: p.description },
      create: p,
    });
    permissions[p.slug] = record.id;
  }
  console.log(`✅ Upserted ${Object.keys(permissions).length} permissions.`);

  // ============================================================================
  // 2. SEED ROLES & ROLE-PERMISSIONS
  // ============================================================================
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      description: 'Unrestricted access to all GoSwiftHR Intelligence modules',
      isSystem: true,
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Operational manager with access to leads, calculators, and assessments',
      isSystem: true,
    },
  });

  const analystRole = await prisma.role.upsert({
    where: { name: 'ANALYST' },
    update: {},
    create: {
      name: 'ANALYST',
      description: 'Read-only analyst access to reports, metrics, and lead conversions',
      isSystem: true,
    },
  });

  // Assign all permissions to SUPER_ADMIN
  for (const permId of Object.values(permissions)) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: permId,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: permId,
      },
    });
  }

  // Assign standard permissions to ADMIN
  const adminPermSlugs = [
    'calculators:read', 'calculators:write', 'assessments:read', 'assessments:export',
    'leads:read', 'leads:write', 'leads:export', 'recommendations:manage', 'audit:read',
  ];
  for (const slug of adminPermSlugs) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permissions[slug],
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permissions[slug],
      },
    });
  }

  // Assign read-only permissions to ANALYST
  const analystPermSlugs = ['calculators:read', 'assessments:read', 'leads:read'];
  for (const slug of analystPermSlugs) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: analystRole.id,
          permissionId: permissions[slug],
        },
      },
      update: {},
      create: {
        roleId: analystRole.id,
        permissionId: permissions[slug],
      },
    });
  }
  console.log('✅ Upserted system roles (SUPER_ADMIN, ADMIN, ANALYST) and permissions.');

  // ============================================================================
  // 3. SEED INITIAL ADMINISTRATOR
  // ============================================================================
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@goswifthr.com';
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    // Generate secure password if not set in environment
    const rawPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
    const passwordHash = hashPassword(rawPassword);

    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'System',
        lastName: 'Administrator',
        roleId: superAdminRole.id,
        isActive: true,
      },
    });

    console.log('================================================================');
    console.log('🔑 INITIAL ADMINISTRATOR ACCOUNT CREATED');
    console.log(`   Email:    ${adminEmail}`);
    if (!process.env.INITIAL_ADMIN_PASSWORD) {
      console.log(`   Password: ${rawPassword}  <-- (Auto-generated secure password)`);
    } else {
      console.log('   Password: [Configured from INITIAL_ADMIN_PASSWORD env var]');
    }
    console.log('================================================================');
  } else {
    console.log(`ℹ️ Administrator account (${adminEmail}) already exists.`);
  }

  // ============================================================================
  // 4. SEED RECOMMENDATION TEMPLATES
  // ============================================================================
  const recommendationTemplates = [
    {
      code: 'REC_COMPLIANCE_AUDIT',
      title: 'Comprehensive HR & Wage-Hour Compliance Audit',
      summary: 'Your compliance score indicates potential exposure to labor law audits or misclassification risks.',
      actionPlan: 'Engage GoSwiftHR specialists to conduct an end-to-end audit of worker classification (W-2 vs. 1099), overtime policies, and statutory meal/rest provisions.',
      priority: RecommendationPriority.CRITICAL,
      serviceLink: 'https://goswifthr.com/compliance',
    },
    {
      code: 'REC_AUTOMATE_ONBOARDING',
      title: 'Automate New Hire Workflow & Digital Onboarding',
      summary: 'High manual overhead in your onboarding process increases administrative fatigue and early-stage turnover.',
      actionPlan: 'Deploy integrated digital onboarding workflows to reduce cycle time by 60% and improve 90-day retention rates.',
      priority: RecommendationPriority.HIGH,
      serviceLink: 'https://goswifthr.com/technology',
    },
    {
      code: 'REC_RETENTION_INTERVENTIONS',
      title: 'Structured Retention & Stay-Interview Framework',
      summary: 'Elevated turnover costs can be significantly mitigated through proactive pulse surveys and predictive attrition modeling.',
      actionPlan: 'Implement GoSwiftHR quarterly stay interviews and structured compensation benchmarking across key revenue-generating roles.',
      priority: RecommendationPriority.HIGH,
      serviceLink: 'https://goswifthr.com/retention',
    },
    {
      code: 'REC_HRIS_CONSOLIDATION',
      title: 'Consolidate Fragmented HR Tech Stack',
      summary: 'Multiple disconnected point solutions are generating duplicate data entry and subscription redundancies.',
      actionPlan: 'Unify payroll, benefits, and performance into a single core platform to recapture estimated annual software spend.',
      priority: RecommendationPriority.MEDIUM,
      serviceLink: 'https://goswifthr.com/services',
    },
  ];

  const templates: Record<string, string> = {};
  for (const t of recommendationTemplates) {
    const record = await prisma.recommendationTemplate.upsert({
      where: { code: t.code },
      update: {
        title: t.title,
        summary: t.summary,
        actionPlan: t.actionPlan,
        priority: t.priority,
        serviceLink: t.serviceLink,
      },
      create: t,
    });
    templates[t.code] = record.id;
  }
  console.log(`✅ Upserted ${Object.keys(templates).length} recommendation templates.`);

  // ============================================================================
  // 5. SEED THE FOUR INDEPENDENT CALCULATORS & INITIAL VERSIONS
  // ============================================================================
  const calculators = [
    {
      slug: 'hr-health-check',
      name: 'GoSwiftHR Workforce Health & Maturity Index',
      description: 'Comprehensive diagnostic assessing organizational readiness across Compliance, Talent Acquisition, Retention, and Operations.',
      categories: [
        { code: 'COMPLIANCE', name: 'Regulatory & Employment Compliance', weight: 1.2 },
        { code: 'TALENT', name: 'Talent Acquisition & Onboarding', weight: 1.0 },
        { code: 'RETENTION', name: 'Employee Engagement & Retention', weight: 1.1 },
        { code: 'OPERATIONS', name: 'HR Operations & Systems Efficiency', weight: 0.9 },
      ],
      questions: [
        {
          code: 'HC_COMP_01',
          category: 'COMPLIANCE',
          title: 'How recently has your organization audited employee handbooks and contractor agreements?',
          type: QuestionType.SINGLE_CHOICE,
          options: [
            { label: 'Within the last 12 months', value: '12_months', scoreValue: 100 },
            { label: '1 to 2 years ago', value: '1_2_years', scoreValue: 60 },
            { label: 'More than 2 years ago or never', value: 'over_2_years', scoreValue: 15 },
          ],
        },
        {
          code: 'HC_TAL_01',
          category: 'TALENT',
          title: 'What is your average time-to-fill for critical open positions?',
          type: QuestionType.SINGLE_CHOICE,
          options: [
            { label: 'Under 30 days', value: 'under_30', scoreValue: 100 },
            { label: '30 to 60 days', value: '30_60', scoreValue: 65 },
            { label: 'Over 60 days', value: 'over_60', scoreValue: 30 },
          ],
        },
        {
          code: 'HC_RET_01',
          category: 'RETENTION',
          title: 'Do you conduct structured stay interviews or pulse surveys?',
          type: QuestionType.SINGLE_CHOICE,
          options: [
            { label: 'Yes, systematically across all teams', value: 'systematic', scoreValue: 100 },
            { label: 'Occasionally or informally', value: 'informal', scoreValue: 50 },
            { label: 'Only exit interviews when someone leaves', value: 'exit_only', scoreValue: 20 },
          ],
        },
      ],
      recommendations: [
        { templateCode: 'REC_COMPLIANCE_AUDIT', maxScore: 50 },
        { templateCode: 'REC_RETENTION_INTERVENTIONS', maxScore: 60 },
      ],
    },
    {
      slug: 'turnover-retention-calculator',
      name: 'Turnover & Attrition Cost Calculator',
      description: 'Quantifies the true financial cost of employee turnover and models the ROI of targeted retention initiatives.',
      categories: [
        { code: 'DIRECT_REPLACEMENT', name: 'Direct Recruiting & Replacement Costs', weight: 1.0 },
        { code: 'LOST_PRODUCTIVITY', name: 'Ramp Time & Productivity Loss', weight: 1.2 },
        { code: 'INSTITUTIONAL_KNOWLEDGE', name: 'Knowledge Drain & Team Impact', weight: 0.8 },
      ],
      questions: [
        {
          code: 'TO_HEADCOUNT',
          category: 'DIRECT_REPLACEMENT',
          title: 'Total full-time employee headcount',
          type: QuestionType.NUMERIC_INPUT,
          options: [
            { label: '1 - 25 employees', value: '1_25', scoreValue: 25 },
            { label: '26 - 100 employees', value: '26_100', scoreValue: 75 },
            { label: '101 - 500 employees', value: '101_500', scoreValue: 250 },
            { label: '500+ employees', value: '500_plus', scoreValue: 750 },
          ],
        },
        {
          code: 'TO_ANNUAL_RATE',
          category: 'DIRECT_REPLACEMENT',
          title: 'Estimated annual voluntary turnover rate (%)',
          type: QuestionType.SLIDER,
          options: [
            { label: 'Low (< 10%)', value: 'low', scoreValue: 8 },
            { label: 'Moderate (10% - 20%)', value: 'moderate', scoreValue: 15 },
            { label: 'High (> 20%)', value: 'high', scoreValue: 28 },
          ],
        },
      ],
      recommendations: [
        { templateCode: 'REC_RETENTION_INTERVENTIONS', maxScore: 70 },
      ],
    },
    {
      slug: 'hr-tech-roi-calculator',
      name: 'HR Automation & Technology ROI Calculator',
      description: 'Calculates executive hours reclaimed, software redundancy reduction, and direct ROI from modernizing HR tech.',
      categories: [
        { code: 'MANUAL_OVERHEAD', name: 'Manual Administrative Time Loss', weight: 1.0 },
        { code: 'SUBSCRIPTION_EXPENSE', name: 'Multiple Disconnected Point Solutions', weight: 1.0 },
      ],
      questions: [
        {
          code: 'TECH_HOURS',
          category: 'MANUAL_OVERHEAD',
          title: 'Weekly hours spent on manual HR spreadsheets, time tracking, and paper forms',
          type: QuestionType.SINGLE_CHOICE,
          options: [
            { label: 'Fewer than 5 hours', value: 'under_5', scoreValue: 90 },
            { label: '5 to 15 hours', value: '5_15', scoreValue: 50 },
            { label: 'More than 15 hours', value: 'over_15', scoreValue: 20 },
          ],
        },
      ],
      recommendations: [
        { templateCode: 'REC_AUTOMATE_ONBOARDING', maxScore: 60 },
        { templateCode: 'REC_HRIS_CONSOLIDATION', maxScore: 55 },
      ],
    },
    {
      slug: 'compliance-risk-assessment',
      name: 'Employment Compliance & Risk Exposure Assessment',
      description: 'Evaluates exposure to wage/hour penalties, worker misclassification, and state-specific labor regulations.',
      categories: [
        { code: 'WAGE_HOUR', name: 'Wage, Hour & Overtime Policies', weight: 1.3 },
        { code: 'CLASSIFICATION', name: 'Independent Contractor vs. W-2 Classification', weight: 1.2 },
        { code: 'SAFETY_HARASSMENT', name: 'Mandatory Training & Anti-Harassment Compliance', weight: 1.0 },
      ],
      questions: [
        {
          code: 'COMP_TRAIN',
          category: 'SAFETY_HARASSMENT',
          title: 'Are required state harassment prevention trainings tracked and documented annually?',
          type: QuestionType.BOOLEAN,
          options: [
            { label: 'Yes, fully tracked and completed annually', value: 'yes', scoreValue: 100 },
            { label: 'Partially or not rigorously tracked', value: 'partial', scoreValue: 40 },
            { label: 'No systematic training program in place', value: 'no', scoreValue: 0 },
          ],
        },
      ],
      recommendations: [
        { templateCode: 'REC_COMPLIANCE_AUDIT', maxScore: 65 },
      ],
    },
  ];

  for (const calc of calculators) {
    const calculatorRecord = await prisma.calculator.upsert({
      where: { slug: calc.slug },
      update: { name: calc.name, description: calc.description, isActive: true },
      create: { slug: calc.slug, name: calc.name, description: calc.description, isActive: true },
    });

    // Version 1 of this calculator
    const versionRecord = await prisma.calculatorVersion.upsert({
      where: {
        calculatorId_versionNumber: {
          calculatorId: calculatorRecord.id,
          versionNumber: 1,
        },
      },
      update: { isPublished: true, publishedAt: new Date() },
      create: {
        calculatorId: calculatorRecord.id,
        versionNumber: 1,
        changelog: 'Initial baseline production version',
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Upsert categories
    const categoryMap: Record<string, string> = {};
    for (const cat of calc.categories) {
      const catRecord = await prisma.scoreCategory.upsert({
        where: {
          calculatorVersionId_code: {
            calculatorVersionId: versionRecord.id,
            code: cat.code,
          },
        },
        update: { name: cat.name, weight: cat.weight },
        create: {
          calculatorVersionId: versionRecord.id,
          code: cat.code,
          name: cat.name,
          weight: cat.weight,
        },
      });
      categoryMap[cat.code] = catRecord.id;
    }

    // Upsert questions & options
    for (let i = 0; i < calc.questions.length; i++) {
      const q = calc.questions[i];
      const qRecord = await prisma.question.upsert({
        where: {
          calculatorVersionId_code: {
            calculatorVersionId: versionRecord.id,
            code: q.code,
          },
        },
        update: {
          title: q.title,
          type: q.type,
          orderIndex: i,
          scoreCategoryId: categoryMap[q.category] || null,
        },
        create: {
          calculatorVersionId: versionRecord.id,
          code: q.code,
          title: q.title,
          type: q.type,
          orderIndex: i,
          scoreCategoryId: categoryMap[q.category] || null,
        },
      });

      // Clear existing options and reinsert for idempotence
      await prisma.questionOption.deleteMany({ where: { questionId: qRecord.id } });
      for (let oIdx = 0; oIdx < q.options.length; oIdx++) {
        const opt = q.options[oIdx];
        await prisma.questionOption.create({
          data: {
            questionId: qRecord.id,
            label: opt.label,
            value: opt.value,
            scoreValue: opt.scoreValue,
            orderIndex: oIdx,
          },
        });
      }
    }

    // Upsert recommendation rules linked to templates
    for (const rec of calc.recommendations) {
      const templateId = templates[rec.templateCode];
      if (templateId) {
        const existingRule = await prisma.recommendationRule.findFirst({
          where: {
            calculatorVersionId: versionRecord.id,
            templateId,
          },
        });

        if (!existingRule) {
          await prisma.recommendationRule.create({
            data: {
              calculatorVersionId: versionRecord.id,
              templateId,
              maxScore: rec.maxScore,
            },
          });
        }
      }
    }

    console.log(`✅ Seeded calculator: "${calc.name}" (Version 1)`);
  }

  console.log('🎉 GoSwiftHR Intelligence database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
