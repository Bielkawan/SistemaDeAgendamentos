import crypto from "node:crypto";
import { Prisma, type AppointmentStatus, type PaymentMethod } from "@prisma/client";
import { AppError, badRequest, conflict, notFound } from "../lib/errors.js";
import { isOverlapError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { dateKeyIn, minutesToMs } from "../lib/time.js";
import { computeSlots } from "./availability.js";
import { getSettings } from "./settings.js";

export const appointmentInclude = {
  client: { select: { id: true, name: true, phone: true } },
  service: { select: { id: true, name: true, durationMin: true } },
  professional: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

export const toDto = (a: AppointmentWithRelations) => ({
  id: a.id, startsAt: a.startsAt, endsAt: a.endsAt, status: a.status, source: a.source, paymentMethod: a.paymentMethod,
  priceCents: a.priceCents, serviceName: a.serviceName, notes: a.notes, client: a.client, service: a.service, professional: a.professional,
});

export async function toPublicDto(a: AppointmentWithRelations) {
  return publicDto(a, (await getSettings()).cancellationHours);
}

export function publicDto(a: AppointmentWithRelations, cancellationHours: number) {
  const canCancel = (a.status === "PENDING" || a.status === "CONFIRMED") && a.startsAt.getTime() - Date.now() >= cancellationHours * 3_600_000;
  return { token: a.publicToken, status: a.status, startsAt: a.startsAt, endsAt: a.endsAt, serviceName: a.serviceName, priceCents: a.priceCents, professionalName: a.professional.name, clientName: a.client.name, canCancel };
}

export interface CreateInput {
  client: { name: string; phone: string };
  serviceId: string;
  professionalId?: string;
  startsAt: Date;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  source: "ADMIN" | "ONLINE";
}

async function resolveService(serviceId: string, online: boolean) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, deletedAt: null } });
  if (!service || (online && !service.active)) throw notFound("Serviço");
  return service;
}

/**
 * Creates an appointment. Overlaps are rejected by the DB exclusion constraint (appointment_no_overlap),
 * so two concurrent requests for the same slot can never both succeed.
 */
export async function createAppointment(input: CreateInput, tx?: (db: Prisma.TransactionClient, created: AppointmentWithRelations) => Promise<void>) {
  const online = input.source === "ONLINE";
  const settings = await getSettings();
  const service = await resolveService(input.serviceId, online);
  if (input.startsAt.getTime() % 60_000 !== 0) throw badRequest("Horário inválido.");

  let candidates: string[];
  if (online) {
    const slots = await computeSlots({ serviceId: service.id, date: dateKeyIn(input.startsAt, settings.timezone), professionalId: input.professionalId, enforceWindow: true });
    const iso = input.startsAt.toISOString();
    candidates = slots.filter(s => s.startsAt === iso && (!input.professionalId || s.professionalId === input.professionalId)).map(s => s.professionalId);
    if (!candidates.length) {
      const any = await computeSlots({ serviceId: service.id, date: dateKeyIn(input.startsAt, settings.timezone), enforceWindow: true });
      if (!input.professionalId && any.some(s => s.startsAt === iso)) candidates = any.filter(s => s.startsAt === iso).map(s => s.professionalId);
      else throw conflict("Esse horário não está mais disponível. Escolha outro.", "SLOT_TAKEN");
    }
  } else if (input.professionalId) {
    candidates = [input.professionalId];
  } else {
    candidates = (await prisma.professional.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true } })).map(p => p.id);
  }
  if (!candidates.length) throw badRequest("Nenhuma profissional ativa cadastrada.");

  const endsAt = new Date(input.startsAt.getTime() + minutesToMs(service.durationMin));
  const blockedUntil = new Date(endsAt.getTime() + minutesToMs(service.bufferMin));
  const status: AppointmentStatus = online && !settings.autoConfirmOnline ? "PENDING" : "CONFIRMED";

  for (const professionalId of candidates) {
    try {
      return await prisma.$transaction(async db => {
        const existing = await db.client.findUnique({ where: { phone: input.client.phone } });
        const client = existing
          ? (existing.deletedAt ? await db.client.update({ where: { id: existing.id }, data: { deletedAt: null, name: input.client.name } }) : existing)
          : await db.client.create({ data: { name: input.client.name, phone: input.client.phone } });
        const created = await db.appointment.create({
          data: { clientId: client.id, serviceId: service.id, professionalId, startsAt: input.startsAt, endsAt, blockedUntil, status, source: input.source, paymentMethod: input.paymentMethod, priceCents: service.priceCents, serviceName: service.name, notes: input.notes ?? null, publicToken: crypto.randomBytes(24).toString("base64url") },
          include: appointmentInclude,
        });
        if (tx) await tx(db, created);
        return created;
      });
    } catch (err) {
      if (isOverlapError(err)) continue;
      throw err;
    }
  }
  throw conflict("Esse horário acabou de ser reservado. Escolha outro.", "SLOT_TAKEN");
}

const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW", "PENDING"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export async function changeStatus(id: string, status: AppointmentStatus, reason?: string | null) {
  const current = await prisma.appointment.findUnique({ where: { id } });
  if (!current) throw notFound("Agendamento");
  if (current.status === status) return prisma.appointment.findUniqueOrThrow({ where: { id }, include: appointmentInclude });
  if (!transitions[current.status].includes(status)) throw new AppError(422, "INVALID_TRANSITION", "Não é possível alterar o status deste agendamento.");
  const { timezone } = await getSettings();
  return prisma.$transaction(async db => {
    const updated = await db.appointment.update({
      where: { id, status: current.status },
      data: { status, ...(status === "CANCELLED" ? { cancelledAt: new Date(), cancelReason: reason ?? null } : {}) },
      include: appointmentInclude,
    });
    if (status === "COMPLETED") {
      await db.transaction.create({ data: { date: new Date(dateKeyIn(updated.startsAt, timezone)), description: updated.serviceName, type: "INCOME", category: "Atendimento", paymentMethod: updated.paymentMethod, amountCents: updated.priceCents, appointmentId: updated.id } }).catch(err => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      });
    }
    return updated;
  });
}

export interface UpdateInput { serviceId?: string; professionalId?: string; startsAt?: Date; paymentMethod?: PaymentMethod; notes?: string | null; priceCents?: number }

export async function updateAppointment(id: string, input: UpdateInput) {
  const current = await prisma.appointment.findUnique({ where: { id } });
  if (!current) throw notFound("Agendamento");
  if (current.status !== "PENDING" && current.status !== "CONFIRMED") throw new AppError(422, "NOT_EDITABLE", "Só é possível editar agendamentos ativos.");
  const service = await resolveService(input.serviceId ?? current.serviceId, false);
  const startsAt = input.startsAt ?? current.startsAt;
  const endsAt = new Date(startsAt.getTime() + minutesToMs(service.durationMin));
  const serviceChanged = service.id !== current.serviceId;
  try {
    return await prisma.appointment.update({
      where: { id },
      data: {
        serviceId: service.id, professionalId: input.professionalId ?? current.professionalId, startsAt, endsAt,
        blockedUntil: new Date(endsAt.getTime() + minutesToMs(service.bufferMin)),
        serviceName: serviceChanged ? service.name : current.serviceName,
        priceCents: input.priceCents ?? (serviceChanged ? service.priceCents : current.priceCents),
        paymentMethod: input.paymentMethod ?? current.paymentMethod,
        notes: input.notes === undefined ? current.notes : input.notes,
      },
      include: appointmentInclude,
    });
  } catch (err) {
    if (isOverlapError(err)) throw conflict("Conflito com outro agendamento nesse horário.", "SLOT_TAKEN");
    throw err;
  }
}
