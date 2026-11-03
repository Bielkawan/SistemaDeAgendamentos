import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../lib/errors.js";
import { verifyAccessToken } from "../services/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { adminId?: string } }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());
  req.adminId = verifyAccessToken(header.slice(7)).sub;
  next();
}
