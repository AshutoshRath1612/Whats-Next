import { PrismaService } from "../prisma/prisma.service";

export async function writeAuditLog(
  prisma: PrismaService,
  input: {
    workspaceId: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }
) {
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : input.before as object,
      after: input.after === undefined ? undefined : input.after as object
    }
  });
}
