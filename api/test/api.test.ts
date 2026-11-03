import crypto from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { addDays, dateKeyIn } from "../src/lib/time.js";

const app = createApp();
let token = "";
let serviceId = "";
let date = "";

async function nextOpenDate() {
  const hours = await prisma.businessHour.findMany();
  let d = addDays(dateKeyIn(new Date(), "America/Sao_Paulo"), 2);
  while (!hours.some(h => h.weekday === new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
}

beforeAll(async () => {
  await prisma.idempotencyKey.deleteMany();
  await prisma.transaction.deleteMany({ where: { appointmentId: { not: null } } });
  await prisma.appointment.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.settings.update({ where: { id: 1 }, data: { minAdvanceMin: 120, maxAdvanceDays: 60, autoConfirmOnline: false, paymentMethods: ["PIX", "CARD", "CASH"] } });
  const login = await request(app).post("/v1/auth/login").send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  expect(login.status).toBe(200);
  token = login.body.accessToken;
  serviceId = (await prisma.service.findFirstOrThrow({ where: { active: true, deletedAt: null }, orderBy: { durationMin: "desc" } })).id;
  date = await nextOpenDate();
});

const book = (startsAt: string, phone = "11987654321", key = crypto.randomUUID()) =>
  request(app).post("/v1/public/appointments").set("Idempotency-Key", key).send({ serviceId, startsAt, paymentMethod: "PIX", client: { name: "Cliente Teste", phone } });

describe("auth", () => {
  it("blocks admin routes without token", async () => {
    expect((await request(app).get("/v1/admin/dashboard")).status).toBe(401);
    expect((await request(app).get("/v1/admin/clients").set("Authorization", "Bearer invalid")).status).toBe(401);
  });
  it("rejects wrong password", async () => {
    expect((await request(app).post("/v1/auth/login").send({ email: process.env.ADMIN_EMAIL, password: "wrong-password" })).status).toBe(401);
    await prisma.adminUser.updateMany({ data: { failedLogins: 0, lockedUntil: null } });
  });
  it("rotates refresh token and detects reuse", async () => {
    const login = await request(app).post("/v1/auth/login").send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    const cookie = login.headers["set-cookie"];
    const r1 = await request(app).post("/v1/auth/refresh").set("Cookie", cookie);
    expect(r1.status).toBe(200);
    expect((await request(app).post("/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/v1/auth/refresh").set("Cookie", r1.headers["set-cookie"])).status).toBe(401);
  });
});

describe("public booking", () => {
  it("lists slots and books one as PENDING", async () => {
    const slots = await request(app).get("/v1/public/availability").query({ serviceId, date });
    expect(slots.status).toBe(200);
    expect(slots.body.length).toBeGreaterThan(0);
    const res = await book(slots.body[0].startsAt);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    const after = await request(app).get("/v1/public/availability").query({ serviceId, date });
    expect(after.body.some((s: { startsAt: string }) => s.startsAt === slots.body[0].startsAt)).toBe(false);
  });

  it("never double books under concurrency", async () => {
    const slots = await request(app).get("/v1/public/availability").query({ serviceId, date });
    const target = slots.body[slots.body.length - 1].startsAt;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => book(target, `1199000000${i}`)));
    if (results.filter(r => r.status === 201).length !== 1) console.log(results.map(r => [r.status, JSON.stringify(r.body).slice(0, 200)]));
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(7);
    expect(await prisma.appointment.count({ where: { startsAt: new Date(target), status: { in: ["PENDING", "CONFIRMED"] } } })).toBe(1);
  });

  it("is idempotent for retries with the same key", async () => {
    const slots = await request(app).get("/v1/public/availability").query({ serviceId, date });
    const key = crypto.randomUUID();
    const a = await book(slots.body[1].startsAt, "11955554444", key);
    const b = await book(slots.body[1].startsAt, "11955554444", key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.token).toBe(a.body.token);
    expect((await book(slots.body[2].startsAt, "11955554444", key)).status).toBe(422);
  });

  it("rejects times outside availability and past dates", async () => {
    expect((await book(`${date}T03:00:00.000Z`)).status).toBe(409);
    expect((await book(new Date(Math.floor(Date.now() / 60_000) * 60_000 - 86_400_000).toISOString())).status).toBe(409);
  });

  it("validates input", async () => {
    const res = await request(app).post("/v1/public/appointments").set("Idempotency-Key", crypto.randomUUID()).send({ serviceId, startsAt: "x", paymentMethod: "PIX", client: { name: "A", phone: "1" } });
    expect(res.status).toBe(400);
  });

  it("lets client view and cancel via token", async () => {
    const slots = await request(app).get("/v1/public/availability").query({ serviceId, date });
    const res = await book(slots.body[3].startsAt, "11944443333");
    const view = await request(app).get(`/v1/public/appointments/${res.body.token}`);
    expect(view.body.canCancel).toBe(true);
    const cancel = await request(app).post(`/v1/public/appointments/${res.body.token}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("CANCELLED");
  });
});

describe("admin", () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  it("creates, conflicts, completes and records revenue", async () => {
    const slots = await request(app).get("/v1/admin/availability").query({ serviceId, date }).set(auth());
    const startsAt = slots.body[4].startsAt;
    const created = await request(app).post("/v1/admin/appointments").set(auth()).send({ serviceId, startsAt, paymentMethod: "CARD", client: { name: "Admin Teste", phone: "11933332222" } });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("CONFIRMED");
    const dup = await request(app).post("/v1/admin/appointments").set(auth()).send({ serviceId, startsAt, paymentMethod: "CARD", client: { name: "Outra", phone: "11933332221" } });
    expect(dup.status).toBe(409);
    const done = await request(app).post(`/v1/admin/appointments/${created.body.id}/status`).set(auth()).send({ status: "COMPLETED" });
    expect(done.status).toBe(200);
    expect(await prisma.transaction.count({ where: { appointmentId: created.body.id } })).toBe(1);
    expect((await request(app).post(`/v1/admin/appointments/${created.body.id}/status`).set(auth()).send({ status: "CANCELLED" })).status).toBe(422);
  });

  it("blocks slots with time off", async () => {
    const before = await request(app).get("/v1/admin/availability").query({ serviceId, date }).set(auth());
    const off = await request(app).post("/v1/admin/time-offs").set(auth()).send({ startsAt: `${date}T00:00:00-03:00`, endsAt: `${date}T23:59:00-03:00`, reason: "Folga" });
    expect(off.status).toBe(201);
    const after = await request(app).get("/v1/admin/availability").query({ serviceId, date }).set(auth());
    expect(before.body.length).toBeGreaterThan(0);
    expect(after.body).toHaveLength(0);
    await request(app).delete(`/v1/admin/time-offs/${off.body.id}`).set(auth());
  });

  it("prevents negative stock", async () => {
    const p = await prisma.product.findFirstOrThrow({ where: { active: true } });
    const res = await request(app).post(`/v1/admin/products/${p.id}/movements`).set(auth()).send({ type: "OUT", quantity: p.quantity + 1 });
    expect(res.status).toBe(422);
  });

  it("serves dashboard, finance and reports", async () => {
    for (const path of ["/v1/admin/dashboard", "/v1/admin/finance/summary", "/v1/admin/reports", "/v1/admin/products/summary", "/v1/admin/settings"]) {
      expect((await request(app).get(path).set(auth())).status).toBe(200);
    }
  });
});
