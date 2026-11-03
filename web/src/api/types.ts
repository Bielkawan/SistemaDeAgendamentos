export type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type PaymentMethod = "PIX" | "CARD" | "CASH";
export type AppointmentSource = "ADMIN" | "ONLINE";

export interface Service {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  description: string | null;
  active: boolean;
}

export interface Professional {
  id: string;
  name: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  lastVisitAt: string | null;
  visits: number;
  needsReactivation: boolean;
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  paymentMethod: PaymentMethod;
  priceCents: number;
  serviceName: string;
  notes: string | null;
  client: { id: string; name: string; phone: string };
  service: { id: string; name: string; durationMin: number };
  professional: { id: string; name: string };
}

export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  costCents: number;
  active: boolean;
  level: "CRITICAL" | "LOW" | "OK";
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  paymentMethod: PaymentMethod;
  amountCents: number;
  appointmentId: string | null;
}

export interface BusinessHour {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface TimeOff {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface Settings {
  name: string;
  legalName: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
  slotIntervalMin: number;
  minAdvanceMin: number;
  maxAdvanceDays: number;
  cancellationHours: number;
  autoConfirmOnline: boolean;
  paymentMethods: PaymentMethod[];
  pixKey: string | null;
  whatsappEnabled: boolean;
  businessHours: BusinessHour[];
}

export interface DashboardData {
  date: string;
  stats: {
    appointmentsToday: number;
    confirmedToday: number;
    completedMonth: number;
    completedMonthGrowth: number | null;
    newClientsMonth: number;
    newClientsGrowth: number | null;
    occupancy: { booked: number; total: number; percent: number };
  };
  today: Appointment[];
  week: { date: string; available: number; booked: number }[];
  reactivation: Client[];
  lowStock: Product[];
  pendingCount: number;
}

export interface FinanceSummary {
  month: string;
  revenueToday: number;
  revenueYesterday: number;
  revenueMonth: number;
  revenuePrevMonth: number;
  expensesMonth: number;
  averageTicket: number;
  completedMonth: number;
  daily: { date: string; revenueCents: number; count: number }[];
}

export interface ReportData {
  month: string;
  occupancy: { percent: number; prevPercent: number };
  completed: { count: number; prevCount: number };
  newClients: { count: number; prevCount: number };
  revenue: { cents: number; prevCents: number };
  servicesShare: { name: string; count: number; percent: number }[];
  today: { total: number; confirmed: number; pending: number };
}

export interface StockSummary {
  totalProducts: number;
  criticalCount: number;
  lowCount: number;
  stockValueCents: number;
  movementsMonth: { in: number; out: number };
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface PublicStudio {
  name: string;
  phone: string | null;
  address: string | null;
  timezone: string;
  paymentMethods: PaymentMethod[];
  cancellationHours: number;
  maxAdvanceDays: number;
  services: Service[];
  professionals: Professional[];
}

export interface Slot {
  startsAt: string;
  professionalId: string;
}

export interface PublicAppointment {
  token: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  priceCents: number;
  professionalName: string;
  clientName: string;
  canCancel: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
}
