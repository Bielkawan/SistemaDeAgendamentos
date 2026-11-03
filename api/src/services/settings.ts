import { prisma } from "../lib/prisma.js";

export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (s) return s;
  return prisma.settings.create({ data: { id: 1, name: "NR Studio" } });
}
