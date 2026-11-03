import { createApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";

const server = createApp().listen(env.PORT, () => console.log(`API ouvindo em http://localhost:${env.PORT}`));

const shutdown = () => server.close(() => { void prisma.$disconnect().then(() => process.exit(0)); });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
