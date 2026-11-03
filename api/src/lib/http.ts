import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError } from "./errors.js";

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.issues[0]?.message ?? "Dados inválidos.", details: err.flatten() } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: { code: "DUPLICATE", message: "Já existe um registro com esses dados." } });
    if (err.code === "P2025") return res.status(404).json({ error: { code: "NOT_FOUND", message: "Registro não encontrado." } });
    if (err.code === "P2003") return res.status(409).json({ error: { code: "IN_USE", message: "Registro em uso por outros dados." } });
  }
  if (isOverlapError(err)) {
    return res.status(409).json({ error: { code: "SLOT_TAKEN", message: "Esse horário acabou de ser reservado. Escolha outro." } });
  }
  if (typeof err === "object" && err && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "JSON inválido." } });
  }
  if (req.log) req.log.error({ err }, "unhandled error"); else console.error(err);
  return res.status(500).json({ error: { code: "INTERNAL", message: "Erro interno. Tente novamente." } });
}

/** Postgres exclusion_violation (23P01) from the no-overlap constraint. */
export function isOverlapError(err: unknown): boolean {
  const s = String((err as { message?: string })?.message ?? "") + JSON.stringify((err as { meta?: unknown })?.meta ?? {});
  return s.includes("23P01") || s.includes("appointment_no_overlap");
}
