const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAccessToken = (token: string | null) => { accessToken = token; };
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/v1/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async res => {
      if (!res.ok) { accessToken = null; return false; }
      const data = await res.json();
      accessToken = data.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>;
  auth?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const url = new URL(`${API_URL}/v1${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && opts.auth !== false && retry) {
    if (await refreshSession()) return api<T>(path, opts, false);
    onUnauthorized?.();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "UNKNOWN", data?.error?.message ?? "Erro inesperado. Tente novamente.", data?.error?.details);
  }
  return data as T;
}

export const errorMessage = (err: unknown) => err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor.";
