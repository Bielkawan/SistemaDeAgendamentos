import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = "Administradora" } = process.env;
  
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("❌ Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env");
    process.exit(1);
  }

  const email = ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // Atualiza ou cria o admin
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      name: ADMIN_NAME,
      passwordHash,
      failedLogins: 0,
      lockedUntil: null,
    },
    create: {
      name: ADMIN_NAME,
      email,
      passwordHash,
    },
  });

  console.log("✅ Admin atualizado/criado:", { id: admin.id, email: admin.email, name: admin.name });
}

main().finally(() => prisma.$disconnect());
