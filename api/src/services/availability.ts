import { prisma } from "../lib/prisma.js";
import { addDays, dateKeyIn, dayRange, minutesToMs, weekdayOf, zonedToUtc } from "../lib/time.js";
import { getSettings } from "./settings.js";

export const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"] as const;

interface Interval { start: number; end: number }
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export interface SlotQuery {
  serviceId: string;
  date: string;
  professionalId?: string;
  excludeAppointmentId?: string;
  /** Public booking enforces min advance / max window. Admin can book anything inside business hours. */
  enforceWindow: boolean;
  now?: Date;
}

/** Computes free start times on the fly: business hours − time-offs − active appointments (with buffers). */
export async function computeSlots(q: SlotQuery) {
  const settings = await getSettings();
  const tz = settings.timezone;
  const service = await prisma.service.findFirst({ where: { id: q.serviceId, deletedAt: null } });
  if (!service || (!service.active && q.enforceWindow)) return [];
  const now = q.now ?? new Date();

  if (q.enforceWindow) {
    const today = dateKeyIn(now, tz);
    if (q.date < today || q.date > addDays(today, settings.maxAdvanceDays)) return [];
  }

  const hours = await prisma.businessHour.findMany({ where: { weekday: weekdayOf(q.date) }, orderBy: { startMin: "asc" } });
  if (!hours.length) return [];

  const professionals = await prisma.professional.findMany({ where: { active: true, ...(q.professionalId ? { id: q.professionalId } : {}) }, orderBy: { createdAt: "asc" } });
  if (!professionals.length) return [];

  const { start: dayStart, end: dayEnd } = dayRange(q.date, tz);
  const [appointments, timeOffs] = await Promise.all([
    prisma.appointment.findMany({ where: { status: { in: [...ACTIVE_STATUSES] }, professionalId: { in: professionals.map(p => p.id) }, startsAt: { lt: dayEnd }, blockedUntil: { gt: dayStart }, ...(q.excludeAppointmentId ? { id: { not: q.excludeAppointmentId } } : {}) }, select: { professionalId: true, startsAt: true, blockedUntil: true } }),
    prisma.timeOff.findMany({ where: { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } } }),
  ]);

  const duration = minutesToMs(service.durationMin);
  const blocked = minutesToMs(service.durationMin + service.bufferMin);
  const step = minutesToMs(settings.slotIntervalMin);
  const earliest = q.enforceWindow ? now.getTime() + minutesToMs(settings.minAdvanceMin) : -Infinity;

  const slots: { startsAt: string; professionalId: string }[] = [];
  const seen = new Set<string>();
  for (const h of hours) {
    const open = zonedToUtc(q.date, h.startMin, tz).getTime();
    const close = zonedToUtc(q.date, h.endMin, tz).getTime();
    for (let t = open; t + duration <= close; t += step) {
      if (t < earliest) continue;
      const candidate = { start: t, end: t + blocked };
      const service_ = { start: t, end: t + duration };
      for (const p of professionals) {
        const busy = appointments.some(a => a.professionalId === p.id && overlaps(candidate, { start: a.startsAt.getTime(), end: a.blockedUntil.getTime() }))
          || timeOffs.some(o => (!o.professionalId || o.professionalId === p.id) && overlaps(service_, { start: o.startsAt.getTime(), end: o.endsAt.getTime() }));
        if (busy) continue;
        const iso = new Date(t).toISOString();
        if (!q.professionalId && seen.has(iso)) break;
        seen.add(iso);
        slots.push({ startsAt: iso, professionalId: p.id });
        if (!q.professionalId) break;
      }
    }
  }
  return slots;
}

/** Number of slot-interval units open/booked on a day (used for occupancy KPIs). */
export async function dayCapacity(date: string) {
  const settings = await getSettings();
  const tz = settings.timezone;
  const hours = await prisma.businessHour.findMany({ where: { weekday: weekdayOf(date) } });
  const pros = await prisma.professional.count({ where: { active: true } });
  const unit = Math.max(settings.slotIntervalMin, 30);
  const total = hours.reduce((s, h) => s + Math.floor((h.endMin - h.startMin) / unit), 0) * pros;
  const { start, end } = dayRange(date, tz);
  const appts = await prisma.appointment.findMany({ where: { status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] }, startsAt: { gte: start, lt: end } }, select: { startsAt: true, endsAt: true } });
  const bookedMin = appts.reduce((s, a) => s + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000, 0);
  const booked = Math.min(total, Math.ceil(bookedMin / unit));
  return { total, booked, available: Math.max(0, total - booked) };
}
