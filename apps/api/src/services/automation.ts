import { ActivityType, Automation, AutomationAction, AutomationTrigger, Lead, LeadStatus, Prisma, User, UserRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { renderTemplate } from "../utils/templates.js";

interface AutomationEventInput {
  trigger: AutomationTrigger;
  lead: Lead;
  previousLead?: Lead | null;
  actorUserId?: string;
}

const activeLeadStatuses: LeadStatus[] = [LeadStatus.PROSPECT, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL];

const hasRecentExecution = async (automationId: string, leadId: string): Promise<boolean> => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.automationLog.findFirst({
    where: { automationId, leadId, executedAt: { gte: cutoff }, status: "success" },
    select: { id: true },
  });
  return Boolean(existing);
};

const resolveTargetUsers = async (targetRole: string | undefined, lead: Lead): Promise<User[]> => {
  if (targetRole === "ASSIGNED_REP") {
    const rep = await prisma.user.findUnique({ where: { id: lead.assignedToId } });
    return rep ? [rep] : [];
  }
  if (!targetRole) return [];
  return prisma.user.findMany({
    where: {
      role: targetRole as UserRole,
      isActive: true,
      OR: [{ branch: lead.branch }, { role: { in: [UserRole.EXECUTIVE, UserRole.ADMIN, UserRole.COMPLIANCE_READONLY] } }],
    },
  });
};

const executeAction = async (automation: Automation, lead: Lead): Promise<{ status: string; message: string }> => {
  const actionConfig = automation.actionConfig as Prisma.JsonObject;
  const targetRole = typeof actionConfig.targetRole === "string" ? actionConfig.targetRole : undefined;
  const context = {
    leadName: `${lead.firstName} ${lead.lastName}`,
    company: lead.company ?? "Unknown company",
    branch: lead.branch ?? "Unknown branch",
  };

  if (automation.action === AutomationAction.SEND_NOTIFICATION) {
    const users = await resolveTargetUsers(targetRole, lead);
    if (!users.length) return { status: "skipped", message: "No target users resolved for notification" };
    const titleTemplate = String(actionConfig.titleTemplate ?? "Lead alert: {{leadName}}");
    const messageTemplate = String(actionConfig.messageTemplate ?? "{{leadName}} requires attention.");
    await prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: renderTemplate(titleTemplate, context),
        message: renderTemplate(messageTemplate, context),
        link: `/leads?leadId=${lead.id}`,
      })),
    });
    return { status: "success", message: `Created notifications for ${users.length} users` };
  }

  if (automation.action === AutomationAction.CREATE_TASK) {
    const daysFromNow = Number(actionConfig.daysFromNow ?? 0);
    const subject = String(actionConfig.subject ?? "Follow-up task");
    const scheduledAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    await prisma.activity.create({
      data: {
        type: ActivityType.FOLLOW_UP,
        subject,
        description: "Created by automation engine",
        scheduledAt,
        leadId: lead.id,
        userId: lead.assignedToId,
      },
    });
    return { status: "success", message: "Created follow-up task activity" };
  }

  if (automation.action === AutomationAction.CHANGE_STATUS) {
    const newStatus = actionConfig.newStatus as LeadStatus | undefined;
    if (!newStatus) return { status: "skipped", message: "No newStatus configured" };
    await prisma.lead.update({ where: { id: lead.id }, data: { status: newStatus } });
    return { status: "success", message: `Changed status to ${newStatus}` };
  }

  if (automation.action === AutomationAction.ASSIGN_LEAD) {
    const targetUserId = typeof actionConfig.targetUserId === "string" ? actionConfig.targetUserId : undefined;
    if (!targetUserId) return { status: "skipped", message: "No targetUserId configured" };
    await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: targetUserId } });
    return { status: "success", message: `Assigned lead to user ${targetUserId}` };
  }

  if (automation.action === AutomationAction.SEND_EMAIL) {
    return { status: "skipped", message: "Email delivery not yet configured" };
  }

  return { status: "skipped", message: "Unhandled action type" };
};

const evaluateEventConditions = (automation: Automation, input: AutomationEventInput): boolean => {
  const conditions = automation.conditions as Prisma.JsonObject;
  if (automation.trigger === AutomationTrigger.LEAD_STATUS_CHANGE) {
    const fromStatus = conditions.fromStatus as LeadStatus | undefined;
    const toStatus = conditions.toStatus as LeadStatus | undefined;
    const previous = input.previousLead?.status;
    return (!fromStatus || previous === fromStatus) && (!toStatus || input.lead.status === toStatus);
  }
  if (automation.trigger === AutomationTrigger.LEAD_CREATED) {
    const sources = (conditions.sources as string[] | undefined) ?? [];
    const minimumValue = Number(conditions.minimumValue ?? 0);
    const value = Number(input.lead.pipelineValue ?? 0);
    return (sources.length === 0 || sources.includes(input.lead.source)) && value >= minimumValue;
  }
  if (automation.trigger === AutomationTrigger.LEAD_ASSIGNED) {
    return !input.previousLead || input.previousLead.assignedToId !== input.lead.assignedToId;
  }
  return false;
};

export const processLeadEventAutomations = async (input: AutomationEventInput): Promise<void> => {
  const automations = await prisma.automation.findMany({
    where: { isActive: true, trigger: input.trigger },
  });

  for (const automation of automations) {
    try {
      const matches = evaluateEventConditions(automation, input);
      if (!matches) {
        await prisma.automationLog.create({
          data: {
            automationId: automation.id,
            leadId: input.lead.id,
            userId: input.actorUserId,
            status: "skipped",
            message: "Conditions did not match",
          },
        });
        continue;
      }
      if (await hasRecentExecution(automation.id, input.lead.id)) {
        await prisma.automationLog.create({
          data: {
            automationId: automation.id,
            leadId: input.lead.id,
            userId: input.actorUserId,
            status: "skipped",
            message: "Deduped due to execution in last 24 hours",
          },
        });
        continue;
      }

      const result = await executeAction(automation, input.lead);
      await prisma.automationLog.create({
        data: {
          automationId: automation.id,
          leadId: input.lead.id,
          userId: input.actorUserId,
          status: result.status,
          message: result.message,
        },
      });
    } catch (error) {
      await prisma.automationLog.create({
        data: {
          automationId: automation.id,
          leadId: input.lead.id,
          userId: input.actorUserId,
          status: "failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
};

export const runTimerAutomations = async (): Promise<void> => {
  const automations = await prisma.automation.findMany({
    where: { isActive: true, trigger: { in: [AutomationTrigger.NO_ACTIVITY_DAYS, AutomationTrigger.FOLLOW_UP_OVERDUE] } },
  });

  for (const automation of automations) {
    try {
      const conditions = automation.conditions as Prisma.JsonObject;
      let leads: Lead[] = [];

      if (automation.trigger === AutomationTrigger.NO_ACTIVITY_DAYS) {
        const days = Number(conditions.days ?? 7);
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const statuses = ((conditions.statuses as string[] | undefined) ?? activeLeadStatuses) as LeadStatus[];
        const branches = (conditions.branches as string[] | undefined) ?? [];
        leads = await prisma.lead.findMany({
          where: {
            status: { in: statuses },
            ...(branches.length ? { branch: { in: branches } } : {}),
            OR: [{ activities: { none: {} } }, { activities: { none: { createdAt: { gte: cutoff } } } }],
          },
        });
      }

      if (automation.trigger === AutomationTrigger.FOLLOW_UP_OVERDUE) {
        const gracePeriodHours = Number(conditions.gracePeriodHours ?? 24);
        const cutoff = new Date(Date.now() - gracePeriodHours * 60 * 60 * 1000);
        leads = await prisma.lead.findMany({
          where: {
            nextFollowUp: { lt: cutoff },
            status: { in: activeLeadStatuses },
          },
        });
      }

      for (const lead of leads) {
        if (await hasRecentExecution(automation.id, lead.id)) continue;
        const result = await executeAction(automation, lead);
        await prisma.automationLog.create({
          data: {
            automationId: automation.id,
            leadId: lead.id,
            userId: lead.assignedToId,
            status: result.status,
            message: result.message,
          },
        });
      }
    } catch (error) {
      await prisma.automationLog.create({
        data: {
          automationId: automation.id,
          status: "failed",
          message: error instanceof Error ? error.message : "Timer automation failed",
        },
      });
    }
  }
};
