import {
  FollowUpStatus,
  LeadActivityType,
  LeadQualificationTier,
  LeadStatus,
  WalkthroughStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadWorkflowService } from './lead-workflow.service';

describe('LeadWorkflowService', () => {
  const tx = {
    lead: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    leadActivity: { create: jest.fn() },
    followUp: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    walkthroughRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    adminUser: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  let service: LeadWorkflowService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeadWorkflowService(prisma as unknown as PrismaService);
    tx.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      status: LeadStatus.NEW,
    });
    tx.lead.updateMany.mockResolvedValue({ count: 1 });
    tx.lead.findUniqueOrThrow.mockResolvedValue({
      id: 'lead-1',
      status: LeadStatus.CONTACTED,
    });
    tx.leadActivity.create.mockResolvedValue({ id: 'activity-1' });
    tx.adminUser.findFirst.mockResolvedValue({ id: 'admin-2' });
    tx.lead.update.mockResolvedValue({ id: 'lead-1' });
  });

  it('records an actor-attributed transition with previous and new stage in one transaction', async () => {
    await service.transitionLead(
      'lead-1',
      LeadStatus.CONTACTED,
      'admin-1',
      'Spoke with the contact.',
    );

    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: 'lead-1', status: LeadStatus.NEW, deletedAt: null },
      data: { status: LeadStatus.CONTACTED },
    });

    expect(tx.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        actorAdminId: 'admin-1',
        type: LeadActivityType.STATUS_CHANGED,
        metadata: {
          from: LeadStatus.NEW,
          to: LeadStatus.CONTACTED,
          notes: 'Spoke with the contact.',
        },
      }),
    });
  });

  it('records the supplied conversion timestamp in the stage activity', async () => {
    const convertedAt = new Date('2026-10-12T09:30:00Z');

    await service.transitionLead(
      'lead-1',
      LeadStatus.CONVERTED,
      'admin-1',
      'Agreement signed.',
      convertedAt,
    );

    expect(tx.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: LeadActivityType.STATUS_CHANGED,
          createdAt: convertedAt,
          metadata: {
            from: LeadStatus.NEW,
            to: LeadStatus.CONVERTED,
            notes: 'Agreement signed.',
          },
        }),
      }),
    );
  });

  it('creates a walkthrough request for an existing lead and attributes it in the timeline', async () => {
    tx.walkthroughRequest.create.mockResolvedValue({
      id: 'walkthrough-1',
      preferredDate: new Date('2026-11-12T10:00:00Z'),
    });

    await service.createWalkthrough('lead-1', 'admin-1', {
      preferredDate: '2026-11-12T10:00:00Z',
      notes: 'Discuss the payroll workflow.',
    });

    expect(tx.walkthroughRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        notes: 'Discuss the payroll workflow.',
      }),
    });
    expect(tx.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        actorAdminId: 'admin-1',
        type: LeadActivityType.WALKTHROUGH_REQUESTED,
      }),
    });
  });

  it('qualifies a lead and persists the explicitly selected qualification tier', async () => {
    tx.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      status: LeadStatus.NEW,
      qualificationTier: 'UNGRADED',
    });
    tx.lead.findUniqueOrThrow.mockResolvedValue({
      id: 'lead-1',
      status: LeadStatus.QUALIFIED,
      qualificationTier: 'HOT',
    });

    await service.qualifyLead('lead-1', 'admin-1', {
      qualificationTier: LeadQualificationTier.HOT,
    });

    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: LeadStatus.QUALIFIED },
      }),
    );
    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { qualificationTier: LeadQualificationTier.HOT },
    });
  });

  it('assigns a lead only to an active administrator and logs the change', async () => {
    tx.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      assignedAdminId: null,
    });
    tx.lead.findUniqueOrThrow.mockResolvedValue({
      id: 'lead-1',
      assignedAdminId: 'admin-2',
    });

    await service.assignLead('lead-1', 'admin-1', {
      assignedAdminId: 'admin-2',
    });

    expect(tx.adminUser.findFirst).toHaveBeenCalledWith({
      where: { id: 'admin-2', isActive: true, deletedAt: null },
      select: { id: true },
    });
    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { assignedAdminId: 'admin-2' },
    });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorAdminId: 'admin-1',
          metadata: { kind: 'ASSIGNMENT_CHANGED', assignedAdminId: 'admin-2' },
        }),
      }),
    );
  });

  it.each([
    LeadStatus.CONVERTED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ])('allows an explicit reopening transition from %s', async (currentStatus) => {
    tx.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      status: currentStatus,
    });

    await service.transitionLead('lead-1', LeadStatus.NEW, 'admin-1');

    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: { id: 'lead-1', status: currentStatus, deletedAt: null },
      data: { status: LeadStatus.NEW },
    });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: LeadActivityType.STATUS_CHANGED,
          metadata: { from: currentStatus, to: LeadStatus.NEW },
        }),
      }),
    );
  });

  it('creates follow-ups linked to the lead and records creation in the timeline', async () => {
    tx.followUp.create.mockResolvedValue({
      id: 'follow-up-1',
      dueAt: new Date('2026-11-10T10:00:00Z'),
      method: 'CALL',
    });

    await service.createFollowUp('lead-1', 'admin-1', {
      dueAt: '2026-11-10T10:00:00Z',
      method: 'CALL',
      notes: 'Discuss the assessment result',
    });

    expect(tx.followUp.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        createdByAdminId: 'admin-1',
        method: 'CALL',
      }),
    });
    expect(tx.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        actorAdminId: 'admin-1',
        type: LeadActivityType.FOLLOW_UP_CREATED,
      }),
    });
  });

  it('completes follow-ups without implicitly changing the lead stage', async () => {
    tx.followUp.findUnique.mockResolvedValue({
      id: 'follow-up-1',
      leadId: 'lead-1',
      dueAt: new Date('2026-11-10T10:00:00Z'),
      status: FollowUpStatus.PENDING,
    });
    tx.followUp.update.mockResolvedValue({
      id: 'follow-up-1',
      status: FollowUpStatus.COMPLETED,
      dueAt: new Date('2026-11-10T10:00:00Z'),
    });

    await service.updateFollowUp('follow-up-1', 'admin-1', {
      status: FollowUpStatus.COMPLETED,
    });

    expect(tx.lead.updateMany).not.toHaveBeenCalled();
    expect(tx.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: LeadActivityType.FOLLOW_UP_COMPLETED,
        actorAdminId: 'admin-1',
      }),
    });
  });

  it('scheduling a walkthrough transitions the associated lead and logs both actions', async () => {
    tx.walkthroughRequest.findUnique.mockResolvedValue({
      id: 'walkthrough-1',
      leadId: 'lead-1',
      status: WalkthroughStatus.PENDING,
      scheduledAt: null,
    });
    tx.walkthroughRequest.update.mockResolvedValue({
      id: 'walkthrough-1',
      status: WalkthroughStatus.SCHEDULED,
    });

    await service.updateWalkthrough('walkthrough-1', 'admin-1', {
      status: WalkthroughStatus.SCHEDULED,
      scheduledAt: '2026-11-10T10:00:00Z',
    });

    expect(tx.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: LeadStatus.WALKTHROUGH_SCHEDULED },
      }),
    );
    expect(tx.leadActivity.create).toHaveBeenCalledTimes(2);
  });
});
