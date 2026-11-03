import { prisma } from "../lib/prisma.js";
import { addDays, dateKeyIn, dayRange, monthRange, prevMonth } from "../lib/time.js";
import { dayCapacity } from "./availability.js";
import { appointmentInclude, toDto } from "./appointments.js";
import { getSettings } from "./settings.js";

const REACTIVATE_DAYS = 45;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const growth = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);

export function productLevel(p: { quantity: number; minQuantity: number }) {
  if (p.quantity <= Math.floor(p.minQuantity / 2) || p.quantity === 0) return "CRITICAL" as const;
  if (p.quantity < p.minQuantity) return "LOW" as const;
  return "OK" as const;
}

/** Clients with last completed/confirmed visit older than 45 days (or never visited and created > 45 days ago). */
export async function clientStats(ids?: string[]) {
  const rows = await prisma.appointment.groupBy({ by: ["clientId"], where: { status: { in: ["COMPLETED", "CONFIRMED", "PENDING"] }, ...(ids ? { clientId: { in: ids } } : {}) }, _max: { startsAt: true }, _count: { _all: true } });
  const completed = await prisma.appointment.groupBy({ by: ["clientId"], where: { status: "COMPLETED", ...(ids ? { clientId: { in: ids } } : {}) }, _count: { _all: true }, _max: { startsAt: true } });
  const map = new Map<string, { lastVisitAt: Date | null; visits: number; lastAny: Date | null }>();
  for (const r of rows) map.set(r.clientId, { lastVisitAt: null, visits: 0, lastAny: r._max.startsAt });
  for (const c of completed) map.set(c.clientId, { ...(map.get(c.clientId) ?? { lastAny: null }), lastVisitAt: c._max.startsAt, visits: c._count._all });
  return map;
}

export function needsReactivation(client: { createdAt: Date }, s?: { lastAny: Date | null }) {
  const limit = Date.now() - REACTIVATE_DAYS * 86_400_000;
  const last = s?.lastAny ?? null;
  return last ? last.getTime() < limit : client.createdAt.getTime() < limit;
}

export async function reactivationList(limit = 10) {
  const clients = await prisma.client.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } });
  const stats = await clientStats();
  return clients.filter(c => needsReactivation(c, stats.get(c.id))).slice(0, limit).map(c => ({ ...c, lastVisitAt: stats.get(c.id)?.lastVisitAt ?? null, visits: stats.get(c.id)?.visits ?? 0, needsReactivation: true }));
}

export async function dashboard(date?: string) {
  const tz = (await getSettings()).timezone;
  const today = dateKeyIn(new Date(), tz);
  const selected = date ?? today;
  const { start, end } = dayRange(today, tz);
  const month = today.slice(0, 7);
  const cur = monthRange(month, tz);
  const prev = monthRange(prevMonth(month), tz);

  const [todayAppts, completedMonth, completedPrev, newClients, newClientsPrev, products, pendingCount] = await Promise.all([
    prisma.appointment.findMany({ where: { startsAt: { gte: start, lt: end }, status: { not: "CANCELLED" } }, include: appointmentInclude, orderBy: { startsAt: "asc" } }),
    prisma.appointment.count({ where: { status: "COMPLETED", startsAt: { gte: cur.start, lt: cur.end } } }),
    prisma.appointment.count({ where: { status: "COMPLETED", startsAt: { gte: prev.start, lt: prev.end } } }),
    prisma.client.count({ where: { deletedAt: null, createdAt: { gte: cur.start, lt: cur.end } } }),
    prisma.client.count({ where: { deletedAt: null, createdAt: { gte: prev.start, lt: prev.end } } }),
    prisma.product.findMany({ where: { active: true } }),
    prisma.appointment.count({ where: { status: "PENDING", startsAt: { gte: new Date() } } }),
  ]);

  const weekStart = addDays(selected, -((new Date(`${selected}T12:00:00Z`).getUTCDay() + 6) % 7));
  const week = await Promise.all(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(async d => ({ date: d, ...(await dayCapacity(d)) })));
  const cap = await dayCapacity(today);

  return {
    date: today,
    stats: {
      appointmentsToday: todayAppts.length,
      confirmedToday: todayAppts.filter(a => a.status === "CONFIRMED" || a.status === "COMPLETED").length,
      completedMonth, completedMonthGrowth: growth(completedMonth, completedPrev),
      newClientsMonth: newClients, newClientsGrowth: growth(newClients, newClientsPrev),
      occupancy: { booked: cap.booked, total: cap.total, percent: Math.round(pct(cap.booked, cap.total)) },
    },
    today: todayAppts.map(toDto),
    week: week.map(w => ({ date: w.date, available: w.available, booked: w.booked })),
    reactivation: await reactivationList(3),
    lowStock: products.map(p => ({ ...p, level: productLevel(p) })).filter(p => p.level !== "OK"),
    pendingCount,
  };
}

async function monthOccupancy(month: string, tz: string) {
  const { start } = monthRange(month, tz);
  const first = dateKeyIn(start, tz);
  const today = dateKeyIn(new Date(), tz);
  let total = 0, booked = 0;
  for (let d = first; d.startsWith(month) && d <= today; d = addDays(d, 1)) {
    const c = await dayCapacity(d);
    total += c.total; booked += c.booked;
  }
  return Math.round(pct(booked, total));
}

export async function reports(month?: string) {
  const tz = (await getSettings()).timezone;
  const m = month ?? dateKeyIn(new Date(), tz).slice(0, 7);
  const cur = monthRange(m, tz);
  const prev = monthRange(prevMonth(m), tz);
  const today = dayRange(dateKeyIn(new Date(), tz), tz);
  const sumIncome = async (r: { start: Date; end: Date }) => (await prisma.transaction.aggregate({ where: { type: "INCOME", date: { gte: new Date(dateKeyIn(r.start, tz)), lt: new Date(dateKeyIn(r.end, tz)) } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  const [completed, prevCompleted, newClients, prevNewClients, byService, todayAppts, revenue, prevRevenue, occ, prevOcc] = await Promise.all([
    prisma.appointment.count({ where: { status: "COMPLETED", startsAt: { gte: cur.start, lt: cur.end } } }),
    prisma.appointment.count({ where: { status: "COMPLETED", startsAt: { gte: prev.start, lt: prev.end } } }),
    prisma.client.count({ where: { deletedAt: null, createdAt: { gte: cur.start, lt: cur.end } } }),
    prisma.client.count({ where: { deletedAt: null, createdAt: { gte: prev.start, lt: prev.end } } }),
    prisma.appointment.groupBy({ by: ["serviceName"], where: { status: "COMPLETED", startsAt: { gte: cur.start, lt: cur.end } }, _count: { _all: true } }),
    prisma.appointment.findMany({ where: { startsAt: { gte: today.start, lt: today.end }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } }, select: { status: true } }),
    sumIncome(cur), sumIncome(prev), monthOccupancy(m, tz), monthOccupancy(prevMonth(m), tz),
  ]);
  return {
    month: m,
    occupancy: { percent: occ, prevPercent: prevOcc },
    completed: { count: completed, prevCount: prevCompleted },
    newClients: { count: newClients, prevCount: prevNewClients },
    revenue: { cents: revenue, prevCents: prevRevenue },
    servicesShare: byService.sort((a, b) => b._count._all - a._count._all).map(s => ({ name: s.serviceName, count: s._count._all, percent: Math.round(pct(s._count._all, completed)) })),
    today: { total: todayAppts.length, confirmed: todayAppts.filter(a => a.status !== "PENDING").length, pending: todayAppts.filter(a => a.status === "PENDING").length },
  };
}

export async function financeSummary(month?: string) {
  const tz = (await getSettings()).timezone;
  const todayKey = dateKeyIn(new Date(), tz);
  const m = month ?? todayKey.slice(0, 7);
  const firstOf = (mm: string) => new Date(`${mm}-01`);
  const next = (mm: string) => { const [y, mo] = mm.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
  const sum = async (type: "INCOME" | "EXPENSE", gte: Date, lt: Date) => (await prisma.transaction.aggregate({ where: { type, date: { gte, lt } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  const day = (k: string) => new Date(k);
  const [revenueToday, revenueYesterday, revenueMonth, revenuePrevMonth, expensesMonth, completedMonth, daily] = await Promise.all([
    sum("INCOME", day(todayKey), day(addDays(todayKey, 1))),
    sum("INCOME", day(addDays(todayKey, -1)), day(todayKey)),
    sum("INCOME", firstOf(m), firstOf(next(m))),
    sum("INCOME", firstOf(prevMonth(m)), firstOf(m)),
    sum("EXPENSE", firstOf(m), firstOf(next(m))),
    prisma.transaction.count({ where: { type: "INCOME", appointmentId: { not: null }, date: { gte: firstOf(m), lt: firstOf(next(m)) } } }),
    prisma.transaction.groupBy({ by: ["date"], where: { type: "INCOME", date: { gte: firstOf(m), lt: firstOf(next(m)) } }, _sum: { amountCents: true }, _count: { _all: true }, orderBy: { date: "desc" } }),
  ]);
  return {
    month: m, revenueToday, revenueYesterday, revenueMonth, revenuePrevMonth, expensesMonth, completedMonth,
    averageTicket: completedMonth ? Math.round(revenueMonth / completedMonth) : 0,
    daily: daily.map(d => ({ date: d.date.toISOString().slice(0, 10), revenueCents: d._sum.amountCents ?? 0, count: d._count._all })),
  };
}
