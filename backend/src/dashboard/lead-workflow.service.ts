import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FollowUpStatus,
  LeadActivityType,
  LeadStatus,
  Prisma,
  WalkthroughStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadActivityDto } from './dto/lead-activity.dto';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/follow-up.dto';
import { UpdateWalkthroughDto } from './dto/walkthrough.dto';
import { CreateWalkthroughDto } from './dto/create-walkthrough.dto';
import { LeadAssignmentDto } from './dto/lead-assignment.dto';
import { LeadQualificationDto } from './dto/lead-qualification.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { OperationalQueueQueryDto } from './dto/operational-queue-query.dto';

const allowedLeadTransitions: Record<LeadStatus, LeadStatus[]> = {
  NEW: [
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  CONTACTED: [
    LeadStatus.NEW,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  QUALIFIED: [
    LeadStatus.CONTACTED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  FOLLOW_UP: [
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  WALKTHROUGH_SCHEDULED: [
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.CONVERTED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  UNQUALIFIED: [
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  CONVERTED: [
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  DISQUALIFIED: [
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.LOST,
    LeadStatus.ARCHIVED,
  ],
  LOST: [
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.ARCHIVED,
  ],
  ARCHIVED: [
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.FOLLOW_UP,
    LeadStatus.WALKTHROUGH_SCHEDULED,
    LeadStatus.CONVERTED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.LOST,
  ],
};

const transitionEventTypes: Record<FollowUpStatus, LeadActivityType> = {
  PENDING: LeadActivityType.FOLLOW_UP_CREATED,
  COMPLETED: LeadActivityType.FOLLOW_UP_COMPLETED,
  RESCHEDULED: LeadActivityType.FOLLOW_UP_RESCHEDULED,
  CANCELLED: LeadActivityType.FOLLOW_UP_CANCELLED,
};

@Injectable()
export class LeadWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeadDetail(leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      include: {
        company: true,
        assignedAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assessments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            calculatorVersion: {
              select: {
                versionNumber: true,
                calculator: { select: { id: true, slug: true, name: true } },
              },
            },
            answers: {
              orderBy: { question: { orderIndex: 'asc' } },
              select: {
                id: true,
                textValue: true,
                numericValue: true,
                rawInput: true,
                question: { select: { code: true, title: true, type: true } },
                selectedOption: { select: { label: true, value: true } },
              },
            },
            result: true,
            recommendations: {
              orderBy: { createdAt: 'asc' },
              select: {
                title: true,
                summary: true,
                actionPlan: true,
                priority: true,
                status: true,
              },
            },
          },
        },
        activities: {
          orderBy: { createdAt: 'asc' },
          include: {
            actorAdmin: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        followUps: {
          orderBy: { dueAt: 'desc' },
          include: {
            createdByAdmin: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assignedAdmin: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        walkthroughRequests: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!lead) throw new NotFoundException('Lead was not found.');
    return lead;
  }

  async getCompanies(query: LeadsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const where: Prisma.CompanyWhereInput = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { industry: { contains: query.search, mode: 'insensitive' } },
        { country: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { leads: { where: { deletedAt: null } } } },
          leads: {
            where: { deletedAt: null },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
              source: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      this.prisma.company.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...company }) => ({
        ...company,
        leadCount: _count.leads,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCompanyDetail(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      include: {
        leads: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            activities: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: {
                actorAdmin: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
            assessments: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                createdAt: true,
                completedAt: true,
                calculatorVersion: {
                  select: {
                    calculator: { select: { name: true, slug: true } },
                  },
                },
                result: {
                  select: {
                    overallScore: true,
                    maturityLevel: true,
                    calculatedMetrics: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!company) throw new NotFoundException('Company was not found.');
    return company;
  }

  async transitionLead(
    leadId: string,
    nextStatus: LeadStatus,
    actorAdminId: string,
    notes?: string,
    occurredAt?: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!lead) throw new NotFoundException('Lead was not found.');
      await this.applyTransition(
        tx,
        lead.id,
        lead.status,
        nextStatus,
        actorAdminId,
        notes,
        occurredAt,
      );
      return tx.lead.findUniqueOrThrow({
        where: { id: lead.id },
        select: { id: true, status: true, updatedAt: true },
      });
    });
  }

  async addActivity(
    leadId: string,
    actorAdminId: string,
    dto: CreateLeadActivityDto,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead was not found.');
    return this.prisma.leadActivity.create({
      data: {
        leadId,
        actorAdminId,
        type: dto.type,
        description: dto.description.trim(),
        ...(dto.occurredAt ? { createdAt: new Date(dto.occurredAt) } : {}),
      },
    });
  }

  async getActiveAdministrators() {
    return this.prisma.adminUser.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async assignLead(
    leadId: string,
    actorAdminId: string,
    dto: LeadAssignmentDto,
  ) {
    if (dto.assignedAdminId === undefined) {
      throw new BadRequestException(
        'An administrator ID or null is required for assignment updates.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, deletedAt: null },
        select: { id: true, assignedAdminId: true },
      });
      if (!lead) throw new NotFoundException('Lead was not found.');
      const assignedAdminId = dto.assignedAdminId || null;
      if (assignedAdminId) await this.assertActiveAdmin(tx, assignedAdminId);
      if (lead.assignedAdminId === assignedAdminId) {
        return tx.lead.findUniqueOrThrow({
          where: { id: lead.id },
          select: { id: true, assignedAdminId: true },
        });
      }
      await tx.lead.update({
        where: { id: lead.id },
        data: { assignedAdminId },
      });
      await tx.leadActivity.create({
        data: {
          leadId,
          actorAdminId,
          type: LeadActivityType.NOTE_ADDED,
          description: assignedAdminId
            ? 'Lead assignment updated.'
            : 'Lead assignment cleared.',
          metadata: { kind: 'ASSIGNMENT_CHANGED', assignedAdminId },
        },
      });
      return tx.lead.findUniqueOrThrow({
        where: { id: lead.id },
        select: { id: true, assignedAdminId: true },
      });
    });
  }

  async qualifyLead(
    leadId: string,
    actorAdminId: string,
    dto: LeadQualificationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, deletedAt: null },
        select: { id: true, status: true, qualificationTier: true },
      });
      if (!lead) throw new NotFoundException('Lead was not found.');
      if (lead.status !== LeadStatus.QUALIFIED) {
        await this.applyTransition(
          tx,
          lead.id,
          lead.status,
          LeadStatus.QUALIFIED,
          actorAdminId,
        );
      }
      if (lead.qualificationTier !== dto.qualificationTier) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { qualificationTier: dto.qualificationTier },
        });
        await tx.leadActivity.create({
          data: {
            leadId,
            actorAdminId,
            type: LeadActivityType.NOTE_ADDED,
            description: `Qualification tier set to ${dto.qualificationTier}.`,
            metadata: {
              kind: 'QUALIFICATION_UPDATED',
              from: lead.qualificationTier,
              to: dto.qualificationTier,
            },
          },
        });
      }
      return tx.lead.findUniqueOrThrow({
        where: { id: lead.id },
        select: { id: true, status: true, qualificationTier: true },
      });
    });
  }

  async getFollowUps(query: OperationalQueueQueryDto) {
    const statusFilter = this.parseFollowUpStatus(query.status);
    const now = new Date();
    const where: Prisma.FollowUpWhereInput = {
      status: statusFilter
        ? statusFilter
        : { in: [FollowUpStatus.PENDING, FollowUpStatus.RESCHEDULED] },
      ...(query.assignedAdminId
        ? { assignedAdminId: query.assignedAdminId }
        : {}),
      ...(query.scope === 'overdue' ? { dueAt: { lt: now } } : {}),
      ...(query.scope === 'upcoming' ? { dueAt: { gte: now } } : {}),
    };
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await Promise.all([
      this.prisma.followUp.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        include: {
          lead: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              company: { select: { id: true, name: true } },
            },
          },
          assignedAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.followUp.count({ where }),
    ]);
    return {
      items: items.map((item) => ({ ...item, isOverdue: item.dueAt < now })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getWalkthroughs(query: OperationalQueueQueryDto) {
    const statusFilter = this.parseWalkthroughStatus(query.status);
    const where = statusFilter
      ? { status: statusFilter }
      : {
          status: {
            in: [WalkthroughStatus.PENDING, WalkthroughStatus.SCHEDULED],
          },
        };
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await Promise.all([
      this.prisma.walkthroughRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
        include: {
          lead: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
              company: { select: { id: true, name: true } },
              assessments: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  calculatorVersion: {
                    select: {
                      calculator: { select: { name: true, slug: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.walkthroughRequest.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createWalkthrough(
    leadId: string,
    actorAdminId: string,
    dto: CreateWalkthroughDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, deletedAt: null },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException('Lead was not found.');
      const request = await tx.walkthroughRequest.create({
        data: {
          leadId,
          preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
          notes: dto.notes?.trim() || null,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId,
          actorAdminId,
          type: LeadActivityType.WALKTHROUGH_REQUESTED,
          description:
            dto.notes?.trim() ||
            'Walkthrough request created by an administrator.',
          metadata: {
            walkthroughRequestId: request.id,
            preferredDate: request.preferredDate?.toISOString() ?? null,
          },
        },
      });
      return request;
    });
  }

  async getFollowUpsForLead(leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead was not found.');
    return this.prisma.followUp.findMany({
      where: { leadId },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdByAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignedAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async createFollowUp(
    leadId: string,
    actorAdminId: string,
    dto: CreateFollowUpDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, deletedAt: null },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException('Lead was not found.');
      if (dto.assignedAdminId)
        await this.assertActiveAdmin(tx, dto.assignedAdminId);
      const followUp = await tx.followUp.create({
        data: {
          leadId,
          createdByAdminId: actorAdminId,
          assignedAdminId: dto.assignedAdminId || null,
          dueAt: new Date(dto.dueAt),
          method: dto.method,
          notes: dto.notes.trim(),
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId,
          actorAdminId,
          type: LeadActivityType.FOLLOW_UP_CREATED,
          description: `Follow-up created for ${followUp.dueAt.toISOString()}.`,
          metadata: { followUpId: followUp.id, method: followUp.method },
        },
      });
      return followUp;
    });
  }

  async updateFollowUp(
    followUpId: string,
    actorAdminId: string,
    dto: UpdateFollowUpDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.findUnique({
        where: { id: followUpId },
      });
      if (!followUp) throw new NotFoundException('Follow-up was not found.');
      const nextStatus = dto.status ?? followUp.status;
      const assignmentChanged =
        dto.assignedAdminId !== undefined &&
        (dto.assignedAdminId || null) !== followUp.assignedAdminId;
      const allowed: Record<FollowUpStatus, FollowUpStatus[]> = {
        PENDING: [
          FollowUpStatus.COMPLETED,
          FollowUpStatus.RESCHEDULED,
          FollowUpStatus.CANCELLED,
        ],
        RESCHEDULED: [
          FollowUpStatus.COMPLETED,
          FollowUpStatus.RESCHEDULED,
          FollowUpStatus.CANCELLED,
        ],
        COMPLETED: [],
        CANCELLED: [],
      };
      if (
        nextStatus !== followUp.status &&
        !allowed[followUp.status].includes(nextStatus)
      ) {
        throw new ConflictException(
          `A ${followUp.status.toLowerCase()} follow-up cannot move to ${nextStatus.toLowerCase()}.`,
        );
      }
      if (nextStatus === FollowUpStatus.RESCHEDULED && !dto.dueAt) {
        throw new BadRequestException(
          'A new due date is required when rescheduling a follow-up.',
        );
      }
      if (dto.assignedAdminId)
        await this.assertActiveAdmin(tx, dto.assignedAdminId);
      if (
        dto.status === undefined &&
        dto.dueAt === undefined &&
        dto.notes === undefined &&
        dto.assignedAdminId === undefined
      ) {
        throw new BadRequestException(
          'At least one follow-up field must be updated.',
        );
      }
      const updated = await tx.followUp.update({
        where: { id: followUpId },
        data: {
          status: nextStatus,
          ...(dto.dueAt ? { dueAt: new Date(dto.dueAt) } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
          ...(dto.assignedAdminId !== undefined
            ? { assignedAdminId: dto.assignedAdminId || null }
            : {}),
          ...(nextStatus === FollowUpStatus.COMPLETED
            ? { completedAt: new Date() }
            : {}),
          ...(nextStatus === FollowUpStatus.CANCELLED
            ? { cancelledAt: new Date() }
            : {}),
        },
      });
      const eventType =
        nextStatus !== followUp.status
          ? transitionEventTypes[nextStatus]
          : null;
      if (eventType || assignmentChanged) {
        await tx.leadActivity.create({
          data: {
            leadId: followUp.leadId,
            actorAdminId,
            type: eventType ?? LeadActivityType.NOTE_ADDED,
            description: eventType
              ? `Follow-up ${nextStatus.toLowerCase()}.`
              : 'Follow-up assignment updated.',
            metadata: {
              followUpId,
              dueAt: updated.dueAt.toISOString(),
              ...(assignmentChanged
                ? { assignedAdminId: updated.assignedAdminId }
                : {}),
            },
          },
        });
      }
      return updated;
    });
  }

  async updateWalkthrough(
    requestId: string,
    actorAdminId: string,
    dto: UpdateWalkthroughDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.walkthroughRequest.findUnique({
        where: { id: requestId },
        select: { id: true, leadId: true, status: true, scheduledAt: true },
      });
      if (!request)
        throw new NotFoundException('Walkthrough request was not found.');
      const allowed: Record<WalkthroughStatus, WalkthroughStatus[]> = {
        PENDING: [WalkthroughStatus.SCHEDULED, WalkthroughStatus.CANCELLED],
        SCHEDULED: [
          WalkthroughStatus.SCHEDULED,
          WalkthroughStatus.COMPLETED,
          WalkthroughStatus.CANCELLED,
        ],
        COMPLETED: [],
        CANCELLED: [],
      };
      if (!allowed[request.status].includes(dto.status)) {
        throw new ConflictException(
          `A ${request.status.toLowerCase()} walkthrough cannot move to ${dto.status.toLowerCase()}.`,
        );
      }
      const scheduledAt = dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : request.scheduledAt;
      if (dto.status === WalkthroughStatus.SCHEDULED && !scheduledAt) {
        throw new BadRequestException(
          'A scheduled date is required for a walkthrough.',
        );
      }
      const updated = await tx.walkthroughRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          scheduledAt,
          ...(dto.outcome !== undefined
            ? { outcome: dto.outcome.trim() || null }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes.trim() || null }
            : {}),
        },
      });
      const scheduleChanged =
        dto.status === WalkthroughStatus.SCHEDULED &&
        (request.status !== WalkthroughStatus.SCHEDULED ||
          (dto.scheduledAt !== undefined &&
            scheduledAt?.getTime() !== request.scheduledAt?.getTime()));
      const activityType =
        dto.status === WalkthroughStatus.SCHEDULED
          ? request.status === WalkthroughStatus.SCHEDULED
            ? LeadActivityType.WALKTHROUGH_RESCHEDULED
            : LeadActivityType.WALKTHROUGH_SCHEDULED
          : dto.status === WalkthroughStatus.COMPLETED
            ? LeadActivityType.WALKTHROUGH_COMPLETED
            : LeadActivityType.WALKTHROUGH_CANCELLED;
      if (scheduleChanged || dto.status !== request.status)
        await tx.leadActivity.create({
          data: {
            leadId: request.leadId,
            actorAdminId,
            type: activityType,
            description: [
              `Walkthrough ${dto.status.toLowerCase()}`,
              scheduledAt ? `for ${scheduledAt.toISOString()}` : '',
              dto.outcome?.trim() || '',
            ]
              .filter(Boolean)
              .join(' — '),
            metadata: {
              walkthroughRequestId: requestId,
              status: dto.status,
              notes: dto.notes?.trim() || null,
              outcome: dto.outcome?.trim() || null,
            },
          },
        });
      if (dto.status === WalkthroughStatus.SCHEDULED) {
        const lead = await tx.lead.findFirst({
          where: { id: request.leadId, deletedAt: null },
          select: { id: true, status: true },
        });
        if (lead && lead.status !== LeadStatus.WALKTHROUGH_SCHEDULED) {
          await this.applyTransition(
            tx,
            lead.id,
            lead.status,
            LeadStatus.WALKTHROUGH_SCHEDULED,
            actorAdminId,
          );
        }
      }
      return updated;
    });
  }

  private async applyTransition(
    tx: Prisma.TransactionClient,
    leadId: string,
    current: LeadStatus,
    next: LeadStatus,
    actorAdminId: string,
    notes?: string,
    occurredAt?: Date,
  ) {
    if (current === next) return;
    if (!allowedLeadTransitions[current].includes(next)) {
      throw new ConflictException(
        `The lead cannot move from ${current.toLowerCase()} to ${next.toLowerCase()}.`,
      );
    }
    const updated = await tx.lead.updateMany({
      where: { id: leadId, status: current, deletedAt: null },
      data: { status: next },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'The lead changed while this transition was being saved. Reload and try again.',
      );
    }
    await tx.leadActivity.create({
      data: {
        leadId,
        actorAdminId,
        type: LeadActivityType.STATUS_CHANGED,
        description: `Lead moved from ${current} to ${next}.${notes?.trim() ? ` ${notes.trim()}` : ''}`,
        metadata: {
          from: current,
          to: next,
          ...(notes?.trim() ? { notes: notes.trim() } : {}),
        },
        ...(occurredAt ? { createdAt: occurredAt } : {}),
      },
    });
  }

  private async assertActiveAdmin(
    tx: Prisma.TransactionClient,
    adminId: string,
  ) {
    const admin = await tx.adminUser.findFirst({
      where: { id: adminId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!admin)
      throw new BadRequestException(
        'The assigned administrator is not active.',
      );
  }

  private parseFollowUpStatus(status?: string): FollowUpStatus | undefined {
    if (!status) return undefined;
    if (!Object.values(FollowUpStatus).includes(status as FollowUpStatus)) {
      throw new BadRequestException('Follow-up status is invalid.');
    }
    return status as FollowUpStatus;
  }

  private parseWalkthroughStatus(
    status?: string,
  ): WalkthroughStatus | undefined {
    if (!status) return undefined;
    if (
      !Object.values(WalkthroughStatus).includes(status as WalkthroughStatus)
    ) {
      throw new BadRequestException('Walkthrough status is invalid.');
    }
    return status as WalkthroughStatus;
  }
}
