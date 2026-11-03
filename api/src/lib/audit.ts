import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export function audit(req: Request, action: string, entity: string, entityId?: string | null, data?: Prisma.InputJsonValue) {
  return prisma.auditLog.create({ data: { actorId: req.adminId ?? null, action, entity, entityId: entityId ?? null, data, ip: req.ip } }).catch(() => undefined);
}
