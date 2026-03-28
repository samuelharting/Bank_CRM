import pkg from "@prisma/client";
const { ActivityType } = pkg;
import { prisma } from "../db/client.js";
import { getUserSentEmails } from "./graph.js";

export async function syncEmailsForUser(userId: string): Promise<{ matched: number; skipped: number; lastSyncAt: Date }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new Error("User not found or inactive");

  const since = new Date(Date.now() - 15 * 60 * 1000);
  const messages = await getUserSentEmails(user.entraId, since);
  let matched = 0;
  let skipped = 0;

  for (const message of messages) {
    try {
      const sentDateTime = message.sentDateTime ? new Date(message.sentDateTime) : null;
      const subject = (message.subject ?? "No subject").slice(0, 200);
      const bodyPreview = (message.bodyPreview ?? "").slice(0, 500);
      if (!sentDateTime) {
        skipped += 1;
        continue;
      }

      const dedup = await prisma.activity.findFirst({
        where: { userId: user.id, type: ActivityType.EMAIL, subject, completedAt: sentDateTime },
        select: { id: true },
      });
      if (dedup) {
        skipped += 1;
        continue;
      }

      const recipientEmails = (message.toRecipients ?? [])
        .map((recipient) => recipient.emailAddress?.address?.toLowerCase())
        .filter((value): value is string => Boolean(value));
      if (!recipientEmails.length) {
        skipped += 1;
        continue;
      }

      const lead = await prisma.lead.findFirst({
        where: {
          OR: [{ email: { in: recipientEmails, mode: "insensitive" } }, { contacts: { some: { email: { in: recipientEmails, mode: "insensitive" } } } }],
        },
        select: { id: true },
      });

      if (!lead) {
        skipped += 1;
        continue;
      }

      await prisma.activity.create({
        data: {
          type: ActivityType.EMAIL,
          subject,
          description: bodyPreview,
          completedAt: sentDateTime,
          leadId: lead.id,
          userId: user.id,
          autoLogged: true,
        },
      });
      matched += 1;
    } catch {
      skipped += 1;
    }
  }

  const lastSyncAt = new Date();
  await prisma.emailSyncStatus.upsert({
    where: { userId: user.id },
    update: {
      lastSyncAt,
      emailsMatched: { increment: matched },
      emailsSkipped: { increment: skipped },
    },
    create: {
      userId: user.id,
      lastSyncAt,
      emailsMatched: matched,
      emailsSkipped: skipped,
    },
  });

  return { matched, skipped, lastSyncAt };
}

export async function syncEmailsForAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  for (const user of users) {
    try {
      await syncEmailsForUser(user.id);
    } catch {
      // Continue syncing remaining users even if one fails.
    }
  }
}
