import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

const MAX_FAILED = 5;
const LOCK_MIN = 15;
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export function signAccessToken(user: { id: string }) {
  return jwt.sign({ sub: user.id, role: "admin" }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60, issuer: "nrstudio-api", audience: "nrstudio-admin" });
}

export function verifyAccessToken(token: string): { sub: string } {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], issuer: "nrstudio-api", audience: "nrstudio-admin" }) as { sub: string };
  } catch {
    throw unauthorized();
  }
}

async function issueRefreshToken(userId: string, familyId: string = crypto.randomUUID()) {
  const raw = crypto.randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({ data: { userId, familyId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000) } });
  return raw;
}

const publicUser = (u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email });

export async function login(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError(429, "LOCKED", "Muitas tentativas. Tente novamente em alguns minutos.");
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.adminUser.update({ where: { id: user.id }, data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MIN * 60_000) } : { failedLogins: failed } });
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }
  await prisma.adminUser.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  return { accessToken: signAccessToken(user), refreshToken: await issueRefreshToken(user.id), user: publicUser(user) };
}

/** Rotating refresh tokens with reuse detection: replaying a revoked token kills the whole family. */
export async function refresh(raw: string | undefined) {
  if (!raw) throw unauthorized();
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!token) throw unauthorized();
  if (token.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthorized();
  }
  if (token.expiresAt < new Date()) throw unauthorized();
  const revoked = await prisma.refreshToken.updateMany({ where: { id: token.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (revoked.count === 0) throw unauthorized();
  return { accessToken: signAccessToken(token.user), refreshToken: await issueRefreshToken(token.userId, token.familyId), user: publicUser(token.user) };
}

export async function logout(raw: string | undefined) {
  if (!raw) return;
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (token) await prisma.refreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function me(userId: string) {
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return publicUser(user);
}
