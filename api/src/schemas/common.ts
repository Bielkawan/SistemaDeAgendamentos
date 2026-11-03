import { z } from "zod";

export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");
export const monthKey = z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido (use AAAA-MM).");
export const uuid = z.string().uuid("ID inválido.");
export const phone = z.string().transform(v => v.replace(/\D/g, "")).pipe(z.string().regex(/^(55)?\d{10,11}$/, "WhatsApp inválido. Informe DDD + número.")).transform(v => (v.length <= 11 ? `55${v}` : v));
export const personName = z.string().trim().min(2, "Nome muito curto.").max(120);
export const paymentMethod = z.enum(["PIX", "CARD", "CASH"]);
export const isoDateTime = z.string().datetime({ offset: true, message: "Data/hora inválida." }).transform(v => new Date(v));
export const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);
