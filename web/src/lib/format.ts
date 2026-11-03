import type { AppointmentStatus, PaymentMethod } from "../api/types";

export const TIMEZONE = "America/Sao_Paulo";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
export const formatMoney = (cents: number) => money.format(cents / 100).replace(/,00$/, "");

export function parseMoneyToCents(value: string): number {
  const clean = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, ...opts });
export const formatTime = (iso: string) => fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const formatDate = (iso: string) => fmt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
export const formatShortDate = (iso: string) => fmt({ day: "2-digit", month: "short" }).format(new Date(iso)).replace(".", "");
export const formatLongDate = (iso: string) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
export const formatFullDate = (iso: string) => fmt({ day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
export const formatWeekday = (iso: string) => fmt({ weekday: "short" }).format(new Date(iso)).replace(".", "").toUpperCase();
export const formatDay = (iso: string) => fmt({ day: "2-digit" }).format(new Date(iso));
export const formatMonthYear = (iso: string) => {
  const s = fmt({ month: "long", year: "numeric" }).format(new Date(iso)).replace(" de ", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** YYYY-MM-DD for "now" in the studio timezone. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const dateKeyToNoon = (date: string) => `${date}T15:00:00.000Z`;

/** Converts a local date (YYYY-MM-DD) + time (HH:mm) in the studio timezone (UTC-3, no DST) to ISO. */
export function localToISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function isoToLocalParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function maskPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const formatPhone = (e164: string) => maskPhone(e164.replace(/^\+?55/, ""));

export function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
}

const tones = ["rose", "sand", "mauve", "sage"];
export function toneFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
}

export const statusLabel: Record<AppointmentStatus, string> = {
  PENDING: "Aguardando",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export const statusClass: Record<AppointmentStatus, string> = {
  PENDING: "waiting",
  CONFIRMED: "confirmed",
  COMPLETED: "confirmed",
  CANCELLED: "cancelled",
  NO_SHOW: "cancelled",
};

export const paymentLabel: Record<PaymentMethod, string> = { PIX: "PIX", CARD: "Cartão", CASH: "Dinheiro" };

export function growth(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export const formatPercent = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export const weekdayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const timeToMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
