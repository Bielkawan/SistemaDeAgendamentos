import { Router } from "express";
import { z } from "zod";
import { audit } from "../lib/audit.js";
import { AppError, notFound } from "../lib/errors.js";
import { parse } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { dateKeyIn, dayRange, monthRange } from "../lib/time.js";
import { requireAdmin } from "../middleware/auth.js";
import { dateKey, isoDateTime, monthKey, optionalText, paymentMethod, personName, phone, uuid } from "../schemas/common.js";
import { computeSlots } from "../services/availability.js";
import { appointmentInclude, changeStatus, createAppointment, toDto, updateAppointment } from "../services/appointments.js";
import { clientStats, dashboard, financeSummary, needsReactivation, productLevel, reports } from "../services/metrics.js";
import { getSettings } from "../services/settings.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);
const idParam = (p: Record<string, string | string[]>) => parse(uuid, p.id);

// Dashboard / reports
adminRouter.get("/dashboard", async (req, res) => { res.json(await dashboard(parse(dateKey.optional(), req.query.date))); });
adminRouter.get("/reports", async (req, res) => { res.json(await reports(parse(monthKey.optional(), req.query.month))); });

adminRouter.get("/search", async (req, res) => {
  const q = parse(z.string().trim().min(2).max(80), req.query.q);
  const contains = { contains: q, mode: "insensitive" as const };
  const [clients, appointments, services] = await Promise.all([
    prisma.client.findMany({ where: { deletedAt: null, OR: [{ name: contains }, { phone: { contains: q.replace(/\D/g, "") || q } }] }, take: 5 }),
    prisma.appointment.findMany({ where: { client: { name: contains }, startsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, include: appointmentInclude, take: 5, orderBy: { startsAt: "desc" } }),
    prisma.service.findMany({ where: { deletedAt: null, name: contains }, take: 5 }),
  ]);
  res.json({ clients, appointments: appointments.map(toDto), services });
});

// Availability (admin ignores advance window)
adminRouter.get("/availability", async (req, res) => {
  const q = parse(z.object({ serviceId: uuid, date: dateKey, professionalId: uuid.optional(), excludeAppointmentId: uuid.optional() }), req.query);
  res.json(await computeSlots({ ...q, enforceWindow: false }));
});

// Appointments
adminRouter.get("/appointments", async (req, res) => {
  const q = parse(z.object({ from: dateKey.optional(), to: dateKey.optional(), status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional().or(z.literal("").transform(() => undefined)), q: z.string().trim().max(80).optional() }), req.query);
  const tz = (await getSettings()).timezone;
  const from = q.from ? dayRange(q.from, tz).start : undefined;
  const to = q.to ? dayRange(q.to, tz).end : undefined;
  const where = { ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}), ...(q.status ? { status: q.status } : {}), ...(q.q ? { client: { name: { contains: q.q, mode: "insensitive" as const } } } : {}) };
  const [items, total] = await Promise.all([prisma.appointment.findMany({ where, include: appointmentInclude, orderBy: { startsAt: "asc" }, take: 500 }), prisma.appointment.count({ where })]);
  res.json({ items: items.map(toDto), total });
});

const apptCreate = z.object({ serviceId: uuid, professionalId: uuid.optional(), startsAt: isoDateTime, paymentMethod, notes: optionalText(500), client: z.object({ name: personName, phone }) });
adminRouter.post("/appointments", async (req, res) => {
  const body = parse(apptCreate, req.body);
  const a = await createAppointment({ ...body, source: "ADMIN" });
  await audit(req, "create", "Appointment", a.id);
  res.status(201).json(toDto(a));
});

adminRouter.patch("/appointments/:id", async (req, res) => {
  const body = parse(z.object({ serviceId: uuid.optional(), professionalId: uuid.optional(), startsAt: isoDateTime.optional(), paymentMethod: paymentMethod.optional(), notes: optionalText(500), priceCents: z.number().int().min(0).max(10_000_000).optional() }), req.body);
  const a = await updateAppointment(idParam(req.params), body);
  await audit(req, "update", "Appointment", a.id, JSON.parse(JSON.stringify(body)));
  res.json(toDto(a));
});

adminRouter.post("/appointments/:id/status", async (req, res) => {
  const body = parse(z.object({ status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]), reason: optionalText(300) }), req.body);
  const a = await changeStatus(idParam(req.params), body.status, body.reason);
  await audit(req, `status:${body.status}`, "Appointment", a.id);
  res.json(toDto(a));
});

// Clients
adminRouter.get("/clients", async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(80).optional(), filter: z.enum(["reactivate"]).optional() }), req.query);
  const digits = q.q?.replace(/\D/g, "");
  const clients = await prisma.client.findMany({ where: { deletedAt: null, ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, ...(digits ? [{ phone: { contains: digits } }] : [])] } : {}) }, orderBy: { name: "asc" }, take: 500 });
  const stats = await clientStats(clients.map(c => c.id));
  let items = clients.map(c => ({ ...c, lastVisitAt: stats.get(c.id)?.lastVisitAt ?? null, visits: stats.get(c.id)?.visits ?? 0, needsReactivation: needsReactivation(c, stats.get(c.id)) }));
  if (q.filter === "reactivate") items = items.filter(c => c.needsReactivation);
  res.json({ items, total: items.length });
});
const clientBody = z.object({ name: personName, phone, email: z.string().trim().email("E-mail inválido.").max(160).nullish().or(z.literal("")).transform(v => v || null), notes: optionalText(500) });
adminRouter.post("/clients", async (req, res) => { const c = await prisma.client.create({ data: parse(clientBody, req.body) }); await audit(req, "create", "Client", c.id); res.status(201).json(c); });
adminRouter.patch("/clients/:id", async (req, res) => { const c = await prisma.client.update({ where: { id: idParam(req.params), deletedAt: null }, data: parse(clientBody.partial(), req.body) }); await audit(req, "update", "Client", c.id); res.json(c); });
adminRouter.delete("/clients/:id", async (req, res) => {
  const id = idParam(req.params);
  const upcoming = await prisma.appointment.count({ where: { clientId: id, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: new Date() } } });
  if (upcoming) throw new AppError(409, "HAS_APPOINTMENTS", "Cliente possui agendamentos futuros. Cancele-os antes.");
  // LGPD: anonymize personal data but keep financial/appointment history.
  await prisma.client.update({ where: { id }, data: { deletedAt: new Date(), name: "Cliente removida", phone: `removed-${id}`, email: null, notes: null } });
  await audit(req, "delete", "Client", id);
  res.status(204).end();
});

// Services
const serviceBody = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().min(1).max(60), durationMin: z.number().int().min(5).max(600), bufferMin: z.number().int().min(0).max(120).default(0), priceCents: z.number().int().min(0).max(10_000_000), description: optionalText(300), active: z.boolean().default(true) });
adminRouter.get("/services", async (_req, res) => { res.json(await prisma.service.findMany({ where: { deletedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] })); });
adminRouter.post("/services", async (req, res) => { const s = await prisma.service.create({ data: parse(serviceBody, req.body) }); await audit(req, "create", "Service", s.id); res.status(201).json(s); });
adminRouter.patch("/services/:id", async (req, res) => { const s = await prisma.service.update({ where: { id: idParam(req.params), deletedAt: null }, data: parse(serviceBody.partial(), req.body) }); await audit(req, "update", "Service", s.id); res.json(s); });
adminRouter.delete("/services/:id", async (req, res) => { const id = idParam(req.params); await prisma.service.update({ where: { id }, data: { deletedAt: new Date(), active: false } }); await audit(req, "delete", "Service", id); res.status(204).end(); });

// Professionals
adminRouter.get("/professionals", async (_req, res) => { res.json(await prisma.professional.findMany({ orderBy: { createdAt: "asc" } })); });
adminRouter.post("/professionals", async (req, res) => { res.status(201).json(await prisma.professional.create({ data: parse(z.object({ name: personName }), req.body) })); });
adminRouter.patch("/professionals/:id", async (req, res) => { res.json(await prisma.professional.update({ where: { id: idParam(req.params) }, data: parse(z.object({ name: personName.optional(), active: z.boolean().optional() }), req.body) })); });

// Time offs
adminRouter.get("/time-offs", async (_req, res) => { res.json(await prisma.timeOff.findMany({ where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } })); });
adminRouter.post("/time-offs", async (req, res) => {
  const body = parse(z.object({ startsAt: isoDateTime, endsAt: isoDateTime, reason: optionalText(120), professionalId: uuid.nullish() }).refine(v => v.endsAt > v.startsAt, "O fim deve ser depois do início."), req.body);
  const t = await prisma.timeOff.create({ data: body });
  await audit(req, "create", "TimeOff", t.id);
  res.status(201).json(t);
});
adminRouter.delete("/time-offs/:id", async (req, res) => { await prisma.timeOff.delete({ where: { id: idParam(req.params) } }); res.status(204).end(); });

// Products / stock
const productBody = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().min(1).max(60), unit: z.string().trim().min(1).max(10).default("un."), quantity: z.number().int().min(0).max(1_000_000).default(0), minQuantity: z.number().int().min(0).max(1_000_000), costCents: z.number().int().min(0).max(10_000_000).default(0) });
adminRouter.get("/products", async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(80).optional(), level: z.enum(["CRITICAL", "LOW", "OK"]).optional() }), req.query);
  const products = await prisma.product.findMany({ where: { active: true, ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { category: { contains: q.q, mode: "insensitive" } }] } : {}) }, orderBy: { name: "asc" } });
  res.json(products.map(p => ({ ...p, level: productLevel(p) })).filter(p => !q.level || p.level === q.level));
});
adminRouter.get("/products/summary", async (_req, res) => {
  const tz = (await getSettings()).timezone;
  const { start, end } = monthRange(dateKeyIn(new Date(), tz).slice(0, 7), tz);
  const [products, moves] = await Promise.all([prisma.product.findMany({ where: { active: true } }), prisma.stockMovement.groupBy({ by: ["type"], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true } })]);
  const levels = products.map(productLevel);
  res.json({ totalProducts: products.length, criticalCount: levels.filter(l => l === "CRITICAL").length, lowCount: levels.filter(l => l === "LOW").length, stockValueCents: products.reduce((s, p) => s + p.quantity * p.costCents, 0), movementsMonth: { in: moves.find(m => m.type === "IN")?._count._all ?? 0, out: moves.find(m => m.type === "OUT")?._count._all ?? 0 } });
});
adminRouter.post("/products", async (req, res) => {
  const body = parse(productBody, req.body);
  const p = await prisma.product.create({ data: { ...body, movements: body.quantity ? { create: { type: "IN", quantity: body.quantity, reason: "Estoque inicial" } } : undefined } });
  await audit(req, "create", "Product", p.id);
  res.status(201).json({ ...p, level: productLevel(p) });
});
adminRouter.patch("/products/:id", async (req, res) => {
  const p = await prisma.product.update({ where: { id: idParam(req.params) }, data: parse(productBody.omit({ quantity: true }).partial(), req.body) });
  res.json({ ...p, level: productLevel(p) });
});
adminRouter.delete("/products/:id", async (req, res) => { await prisma.product.update({ where: { id: idParam(req.params) }, data: { active: false } }); res.status(204).end(); });
adminRouter.post("/products/:id/movements", async (req, res) => {
  const id = idParam(req.params);
  const body = parse(z.object({ type: z.enum(["IN", "OUT"]), quantity: z.number().int().min(1).max(1_000_000), reason: optionalText(200) }), req.body);
  const p = await prisma.$transaction(async db => {
    // Atomic conditional decrement: never goes negative even with concurrent requests.
    const updated = await db.product.updateMany({ where: { id, active: true, ...(body.type === "OUT" ? { quantity: { gte: body.quantity } } : {}) }, data: { quantity: body.type === "IN" ? { increment: body.quantity } : { decrement: body.quantity } } });
    if (!updated.count) {
      if (!(await db.product.findFirst({ where: { id, active: true } }))) throw notFound("Produto");
      throw new AppError(422, "INSUFFICIENT_STOCK", "Quantidade maior que o saldo em estoque.");
    }
    await db.stockMovement.create({ data: { productId: id, ...body } });
    return db.product.findUniqueOrThrow({ where: { id } });
  });
  await audit(req, `stock:${body.type}`, "Product", id, { quantity: body.quantity });
  res.status(201).json({ ...p, level: productLevel(p) });
});

// Finance
adminRouter.get("/finance/summary", async (req, res) => { res.json(await financeSummary(parse(monthKey.optional(), req.query.month))); });
adminRouter.get("/finance/transactions", async (req, res) => {
  const q = parse(z.object({ month: monthKey.optional(), type: z.enum(["INCOME", "EXPENSE"]).optional(), q: z.string().trim().max(80).optional() }), req.query);
  const m = q.month ?? new Date().toISOString().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const where = { date: { gte: new Date(Date.UTC(y, mo - 1, 1)), lt: new Date(Date.UTC(y, mo, 1)) }, ...(q.type ? { type: q.type } : {}), ...(q.q ? { description: { contains: q.q, mode: "insensitive" as const } } : {}) };
  const [items, total] = await Promise.all([prisma.transaction.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 }), prisma.transaction.count({ where })]);
  res.json({ items, total });
});
adminRouter.post("/finance/transactions", async (req, res) => {
  const body = parse(z.object({ type: z.enum(["INCOME", "EXPENSE"]), description: z.string().trim().min(2).max(160), category: z.string().trim().min(1).max(60), amountCents: z.number().int().min(1).max(100_000_000), date: dateKey.transform(d => new Date(d)), paymentMethod }), req.body);
  const t = await prisma.transaction.create({ data: body });
  await audit(req, "create", "Transaction", t.id);
  res.status(201).json(t);
});
adminRouter.delete("/finance/transactions/:id", async (req, res) => {
  const id = idParam(req.params);
  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t) throw notFound("Lançamento");
  if (t.appointmentId) throw new AppError(422, "LINKED", "Lançamento gerado por atendimento não pode ser excluído.");
  await prisma.transaction.delete({ where: { id } });
  await audit(req, "delete", "Transaction", id);
  res.status(204).end();
});

// Settings
adminRouter.get("/settings", async (_req, res) => {
  const [s, businessHours] = await Promise.all([getSettings(), prisma.businessHour.findMany({ orderBy: [{ weekday: "asc" }, { startMin: "asc" }] })]);
  res.json({ ...s, businessHours });
});
const hour = z.object({ weekday: z.number().int().min(0).max(6), startMin: z.number().int().min(0).max(1439), endMin: z.number().int().min(1).max(1440) }).refine(h => h.endMin > h.startMin, "Horário de fechamento deve ser depois da abertura.");
adminRouter.patch("/settings", async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(2).max(120), legalName: optionalText(160), phone: optionalText(30), address: optionalText(200),
    slotIntervalMin: z.number().int().min(5).max(120), minAdvanceMin: z.number().int().min(0).max(10080), maxAdvanceDays: z.number().int().min(1).max(365),
    cancellationHours: z.number().int().min(0).max(168), autoConfirmOnline: z.boolean(), paymentMethods: z.array(paymentMethod).min(1, "Selecione ao menos uma forma de pagamento."),
    pixKey: optionalText(120), whatsappEnabled: z.boolean(), businessHours: z.array(hour).max(21),
  }).partial(), req.body);
  const { businessHours, ...rest } = body;
  await getSettings();
  await prisma.$transaction(async db => {
    await db.settings.update({ where: { id: 1 }, data: rest });
    if (businessHours) { await db.businessHour.deleteMany(); await db.businessHour.createMany({ data: businessHours }); }
  });
  await audit(req, "update", "Settings", "1");
  const [s, hours] = await Promise.all([getSettings(), prisma.businessHour.findMany({ orderBy: [{ weekday: "asc" }, { startMin: "asc" }] })]);
  res.json({ ...s, businessHours: hours });
});
