import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api } from "./client";
import type { Appointment, AppointmentStatus, Client, DashboardData, FinanceSummary, Paginated, Product, Professional, PublicAppointment, PublicStudio, ReportData, Service, Settings, Slot, StockSummary, TimeOff, Transaction } from "./types";

export const useDashboard = (date?: string) => useQuery({ queryKey: ["dashboard", date], queryFn: () => api<DashboardData>("/admin/dashboard", { query: { date } }) });

export const useAppointments = (params: { from?: string; to?: string; status?: string; q?: string }) =>
  useQuery({ queryKey: ["appointments", params], queryFn: () => api<Paginated<Appointment>>("/admin/appointments", { query: params }) });

export const useClients = (params: { q?: string; filter?: string } = {}) =>
  useQuery({ queryKey: ["clients", params], queryFn: () => api<Paginated<Client>>("/admin/clients", { query: params }) });

export const useServices = () => useQuery({ queryKey: ["services"], queryFn: () => api<Service[]>("/admin/services") });
export const useProfessionals = () => useQuery({ queryKey: ["professionals"], queryFn: () => api<Professional[]>("/admin/professionals") });
export const useProducts = (params: { q?: string; level?: string } = {}) => useQuery({ queryKey: ["products", params], queryFn: () => api<Product[]>("/admin/products", { query: params }) });
export const useStockSummary = () => useQuery({ queryKey: ["products", "summary"], queryFn: () => api<StockSummary>("/admin/products/summary") });
export const useTransactions = (params: { month?: string; type?: string; q?: string }) => useQuery({ queryKey: ["transactions", params], queryFn: () => api<Paginated<Transaction>>("/admin/finance/transactions", { query: params }) });
export const useFinanceSummary = (month?: string) => useQuery({ queryKey: ["finance", month], queryFn: () => api<FinanceSummary>("/admin/finance/summary", { query: { month } }) });
export const useReports = (month?: string) => useQuery({ queryKey: ["reports", month], queryFn: () => api<ReportData>("/admin/reports", { query: { month } }) });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/admin/settings") });
export const useTimeOffs = () => useQuery({ queryKey: ["time-offs"], queryFn: () => api<TimeOff[]>("/admin/time-offs") });
export const useAdminSlots = (params: { serviceId?: string; date?: string; professionalId?: string; excludeAppointmentId?: string }) =>
  useQuery({ queryKey: ["slots", "admin", params], enabled: !!params.serviceId && !!params.date, queryFn: () => api<Slot[]>("/admin/availability", { query: params }) });

/** Mutation that invalidates every query touched by scheduling/finance/stock changes. */
export function useApiMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, invalidate: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([...invalidate, ["dashboard"], ["reports"], ["finance"]].map(queryKey => qc.invalidateQueries({ queryKey }))),
  });
}

export const appointmentsApi = {
  create: (body: Record<string, unknown>) => api<Appointment>("/admin/appointments", { method: "POST", body }),
  update: ({ id, ...body }: { id: string } & Record<string, unknown>) => api<Appointment>(`/admin/appointments/${id}`, { method: "PATCH", body }),
  setStatus: ({ id, status, reason }: { id: string; status: AppointmentStatus; reason?: string }) => api<Appointment>(`/admin/appointments/${id}/status`, { method: "POST", body: { status, reason } }),
};

export const crud = <T,>(base: string) => ({
  create: (body: Partial<T> | Record<string, unknown>) => api<T>(base, { method: "POST", body }),
  update: ({ id, ...body }: { id: string } & Record<string, unknown>) => api<T>(`${base}/${id}`, { method: "PATCH", body }),
  remove: (id: string) => api<void>(`${base}/${id}`, { method: "DELETE" }),
});

export const publicApi = {
  studio: () => api<PublicStudio>("/public/studio", { auth: false }),
  slots: (params: { serviceId: string; date: string; professionalId?: string }) => api<Slot[]>("/public/availability", { query: params, auth: false }),
  book: (body: Record<string, unknown>, idempotencyKey: string) => api<PublicAppointment>("/public/appointments", { method: "POST", body, auth: false, headers: { "Idempotency-Key": idempotencyKey } }),
  get: (token: string) => api<PublicAppointment>(`/public/appointments/${token}`, { auth: false }),
  cancel: (token: string) => api<PublicAppointment>(`/public/appointments/${token}/cancel`, { method: "POST", auth: false }),
};
