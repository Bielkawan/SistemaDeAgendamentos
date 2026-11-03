import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { errorHandler } from "./lib/http.js";
import { prisma } from "./lib/prisma.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  const origins = env.CORS_ORIGIN.split(",").map(o => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true, allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"], methods: ["GET", "POST", "PATCH", "DELETE"] }));
  app.use(express.json({ limit: "50kb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") app.use(pinoHttp({ redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'] }));

  app.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });
  app.use("/v1/auth", authRouter);
  app.use("/v1/public", publicRouter);
  app.use("/v1/admin", adminRouter);
  app.use((_req, res) => { res.status(404).json({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } }); });
  app.use(errorHandler);
  return app;
}
