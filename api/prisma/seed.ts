import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = "Administradora" } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. 8 caracteres) no .env");

  await prisma.adminUser.upsert({ where: { email: ADMIN_EMAIL.toLowerCase() }, update: {}, create: { name: ADMIN_NAME, email: ADMIN_EMAIL.toLowerCase(), passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12) } });
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: "NR Studio", legalName: "NR Nails & Sobrancelhas", phone: "(11) 99999-0000", address: "São Paulo - SP" } });

  if (!(await prisma.businessHour.count())) {
    await prisma.businessHour.createMany({ data: [1, 2, 3, 4, 5].map(weekday => ({ weekday, startMin: 9 * 60, endMin: 19 * 60 })).concat({ weekday: 6, startMin: 9 * 60, endMin: 15 * 60 }) });
  }
  if (!(await prisma.professional.count())) await prisma.professional.create({ data: { name: ADMIN_NAME } });
  if (!(await prisma.service.count())) {
    await prisma.service.createMany({ data: [
      { name: "Alongamento em gel", category: "Unhas", durationMin: 90, bufferMin: 10, priceCents: 14500 },
      { name: "Design de sobrancelhas", category: "Sobrancelhas", durationMin: 45, bufferMin: 5, priceCents: 6500 },
      { name: "Manicure + esmaltação", category: "Unhas", durationMin: 60, bufferMin: 5, priceCents: 7500 },
      { name: "Manutenção de gel", category: "Unhas", durationMin: 75, bufferMin: 10, priceCents: 11000 },
    ] });
  }
  if (!(await prisma.product.count())) {
    for (const p of [
      { name: "Base em gel Crystal", category: "Unhas", quantity: 2, minQuantity: 5, costCents: 4500 },
      { name: "Henna Castanho Médio", category: "Sobrancelhas", quantity: 1, minQuantity: 4, costCents: 3800 },
      { name: "Top Coat Premium", category: "Unhas", quantity: 3, minQuantity: 5, costCents: 3200 },
      { name: "Luvas descartáveis", category: "Descartáveis", quantity: 48, minQuantity: 20, costCents: 60 },
    ]) await prisma.product.create({ data: { ...p, movements: { create: { type: "IN", quantity: p.quantity, reason: "Estoque inicial" } } } });
  }
  console.log("Seed concluído.");
}

main().finally(() => prisma.$disconnect());
