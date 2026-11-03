import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env, isProd } from "../env.js";
import { parse } from "../lib/http.js";
import { requireAdmin } from "../middleware/auth.js";
import * as auth from "../services/auth.js";

const COOKIE = "nr_refresh";
const cookieOpts = { httpOnly: true, secure: isProd, sameSite: (isProd ? "none" : "lax") as "none" | "lax", path: "/", maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 };
const setCookie = (res: Response, token: string) => res.cookie(COOKIE, token, cookieOpts);

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, skip: () => env.NODE_ENV === "test", standardHeaders: "draft-7", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Muitas tentativas. Aguarde alguns minutos." } } });

authRouter.post("/login", loginLimiter, async (req, res) => {
  const body = parse(z.object({ email: z.string().trim().email("E-mail inválido.").max(160), password: z.string().min(1).max(200) }), req.body);
  const r = await auth.login(body.email, body.password);
  setCookie(res, r.refreshToken);
  res.json({ accessToken: r.accessToken, user: r.user });
});

authRouter.post("/refresh", async (req, res) => {
  try {
    const r = await auth.refresh(req.cookies?.[COOKIE]);
    setCookie(res, r.refreshToken);
    res.json({ accessToken: r.accessToken, user: r.user });
  } catch (err) {
    res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
    throw err;
  }
});

authRouter.post("/logout", async (req, res) => {
  await auth.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
  res.status(204).end();
});

authRouter.get("/me", requireAdmin, async (req, res) => { res.json(await auth.me(req.adminId!)); });
