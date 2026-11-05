import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService & Database Integration', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should be defined and successfully connect to PostgreSQL', () => {
    expect(prisma).toBeDefined();
  });

  it('should have seeded all 4 independent HR calculators with published versions', async () => {
    const calculators = await prisma.calculator.findMany({
      include: {
        versions: {
          include: {
            questions: {
              include: {
                options: true,
              },
            },
            scoreCategories: true,
          },
        },
      },
    });

    const productCalculatorSlugs = [
      'compliance-risk-assessment',
      'hr-health-check',
      'hr-tech-roi-calculator',
      'turnover-retention-calculator',
    ];
    const productCalculators = calculators.filter((calculator) =>
      productCalculatorSlugs.includes(calculator.slug),
    );

    // The database can contain additional internal calculators. This assertion
    // verifies the original four seeded calculators without treating those
    // additional records as an error.
    expect(productCalculators).toHaveLength(productCalculatorSlugs.length);
    expect(productCalculators.map((c) => c.slug).sort()).toEqual(
      productCalculatorSlugs.sort(),
    );

    for (const calc of productCalculators) {
      expect(calc.versions.length).toBeGreaterThanOrEqual(1);
      const v1 = calc.versions.find((v) => v.versionNumber === 1);
      expect(v1).toBeDefined();
      expect(v1?.isPublished).toBe(true);
      expect(v1?.scoreCategories.length).toBeGreaterThan(0);
      expect(v1?.questions.length).toBeGreaterThan(0);
    }
  });

  it('should have seeded system roles and permissions', async () => {
    const superAdminRole = await prisma.role.findUnique({
      where: { name: 'SUPER_ADMIN' },
      include: { permissions: true },
    });

    expect(superAdminRole).toBeDefined();
    expect(superAdminRole?.isSystem).toBe(true);
    expect(superAdminRole?.permissions.length).toBe(12);

    const adminUser = await prisma.adminUser.findFirst({
      where: { roleId: superAdminRole!.id },
    });
    expect(adminUser).toBeDefined();
    expect(adminUser?.email).toBe('admin@goswifthr.com');
  });

  it('should enforce company deduplication via normalizedName unique constraint', async () => {
    const uniqueNormalized = `test-corp-${Date.now()}`;

    // Create first company
    const comp1 = await prisma.company.create({
      data: {
        name: 'Test Corp Ltd',
        normalizedName: uniqueNormalized,
        domain: `${uniqueNormalized}.com`,
      },
    });

    expect(comp1.id).toBeDefined();

    // Attempting to create duplicate with identical normalizedName should fail with P2002
    await expect(
      prisma.company.create({
        data: {
          name: 'Test Corp Limited',
          normalizedName: uniqueNormalized,
          domain: `${uniqueNormalized}.com`,
        },
      }),
    ).rejects.toThrow();

    // Clean up
    await prisma.company.delete({ where: { id: comp1.id } });
  });

  it('should support anonymous assessment sessions before lead capture', async () => {
    const version = await prisma.calculatorVersion.findFirst({
      where: { isPublished: true },
    });
    expect(version).toBeDefined();

    const sessionToken = `anon-session-${Date.now()}`;

    // Create anonymous assessment without leadId
    const assessment = await prisma.assessment.create({
      data: {
        sessionToken,
        calculatorVersionId: version!.id,
        leadId: null, // Anonymous user
      },
    });

    expect(assessment.id).toBeDefined();
    expect(assessment.leadId).toBeNull();
    expect(assessment.status).toBe('IN_PROGRESS');

    // Clean up
    await prisma.assessment.delete({ where: { id: assessment.id } });
  });
});
