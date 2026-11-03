import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../env.js";
import { AppError, badRequest, notFound } from "../lib/errors.js";
import { parse } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { dateKey, isoDateTime, paymentMethod, personName, phone, uuid } from "../schemas/common.js";
import { computeSlots } from "../services/availability.js";
import { appointmentInclude, changeStatus, createAppointment, publicDto, toPublicDto } from "../services/appointments.js";
import { findReplay, hashRequest, storeKey } from "../services/idempotency.js";
import { getSettings } from "../services/settings.js";

export const publicRouter = Router();
const limited = (limit: number, windowMin: number) => rateLimit({ windowMs: windowMin * 60_000, limit, skip: () => env.NODE_ENV === "test", standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Muitas requisições. Tente novamente em instantes." } } });

publicRouter.use(limited(120, 1));

publicRouter.get("/studio", async (_req, res) => {
  const s = await getSettings();
  const [services, professionals] = await Promise.all([
    prisma.service.findMany({ where: { active: true, deletedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.professional.findMany({ where: { active: true }, select: { id: true, name: true, active: true }, orderBy: { createdAt: "asc" } }),
  ]);
  res.json({ name: s.name, phone: s.phone, address: s.address, timezone: s.timezone, paymentMethods: s.paymentMethods, cancellationHours: s.cancellationHours, maxAdvanceDays: s.maxAdvanceDays, services, professionals });
});

publicRouter.get("/availability", async (req, res) => {
  const q = parse(z.object({ serviceId: uuid, date: dateKey, professionalId: uuid.optional() }), req.query);
  res.json(await computeSlots({ ...q, enforceWindow: true }));
});

const bookSchema = z.object({
  serviceId: uuid,
  professionalId: uuid.optional(),
  startsAt: isoDateTime,
  paymentMethod,
  client: z.object({ name: personName, phone }),
  website: z.string().max(200).optional(),
});

publicRouter.post("/appointments", limited(10, 15), async (req, res) => {
  const key = req.header("Idempotency-Key");
  if (!key || !/^[A-Za-z0-9-]{16,100}$/.test(key)) throw badRequest("Cabeçalho Idempotency-Key ausente ou inválido.");
  const body = parse(bookSchema, req.body);
  // Honeypot: bots fill hidden fields. Respond like a validation error without creating anything.
  if (body.website) throw badRequest("Não foi possível concluir o agendamento.");
  const settings = await getSettings();
  if (!settings.paymentMethods.includes(body.paymentMethod)) throw badRequest("Forma de pagamento não aceita.");

  const requestHash = hashRequest(req.body);
  const replay = await findReplay(key, requestHash);
  if (replay) return res.status(201).json(replay);

  try {
    let dto: ReturnType<typeof publicDto> | undefined;
    await createAppointment({ ...body, notes: null, source: "ONLINE" }, async (db, created) => {
      dto = publicDto(created, settings.cancellationHours);
      await storeKey(db, key, requestHash, JSON.parse(JSON.stringify(dto)));
    });
    res.status(201).json(dto);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target ?? "").includes("key")) {
      const again = await findReplay(key, requestHash);
      if (again) return res.status(201).json(again);
    }
    throw err;
  }
});

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
async function byToken(raw: string) {
  const token = parse(tokenSchema, raw);
  const a = await prisma.appointment.findUnique({ where: { publicToken: token }, include: appointmentInclude });
  if (!a) throw notFound("Agendamento");
  return a;
}

publicRouter.get("/appointments/:token", limited(30, 1), async (req, res) => { res.json(await toPublicDto(await byToken(String(req.params.token)))); });

publicRouter.post("/appointments/:token/cancel", limited(10, 15), async (req, res) => {
  const a = await byToken(String(req.params.token));
  const dto = await toPublicDto(a);
  if (!dto.canCancel) throw new AppError(422, "CANCEL_NOT_ALLOWED", `Cancelamento online só é permitido até ${(await getSettings()).cancellationHours}h antes. Fale com o studio.`);
  res.json(await toPublicDto(await changeStatus(a.id, "CANCELLED", "Cancelado pela cliente")));
});
