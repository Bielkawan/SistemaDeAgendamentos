import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

const TTL_MS = 24 * 3_600_000;
export const hashRequest = (body: unknown) => crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");

export async function findReplay(key: string, requestHash: string) {
  const found = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (!found || found.createdAt.getTime() < Date.now() - TTL_MS) return null;
  if (found.requestHash !== requestHash) throw new AppError(422, "IDEMPOTENCY_MISMATCH", "Chave de idempotência reutilizada com outros dados.");
  return found.response;
}

export async function storeKey(db: Prisma.TransactionClient, key: string, requestHash: string, response: Prisma.InputJsonValue) {
  await db.idempotencyKey.deleteMany({ where: { key, createdAt: { lt: new Date(Date.now() - TTL_MS) } } });
  await db.idempotencyKey.create({ data: { key, requestHash, response } });
}
