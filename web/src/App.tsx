import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/AuthContext";
import { AdminLayout } from "./admin/AdminLayout";
import { LoginPage } from "./admin/pages/LoginPage";
import { DashboardPage } from "./admin/pages/DashboardPage";
import { AgendaPage } from "./admin/pages/AgendaPage";
import { ClientsPage } from "./admin/pages/ClientsPage";
import { ServicesPage } from "./admin/pages/ServicesPage";
import { StockPage } from "./admin/pages/StockPage";
import { FinancePage } from "./admin/pages/FinancePage";
import { ReportsPage } from "./admin/pages/ReportsPage";
import { SettingsPage } from "./admin/pages/SettingsPage";
import { BookingPage } from "./public/BookingPage";
import { MyAppointmentPage } from "./public/MyAppointmentPage";

export default function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/agendar" replace />} />
    <Route path="/agendar" element={<BookingPage />} />
    <Route path="/agendamento/:token" element={<MyAppointmentPage />} />
    <Route path="/admin/login" element={<LoginPage />} />
    <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
      <Route index element={<DashboardPage />} />
      <Route path="agenda" element={<AgendaPage />} />
      <Route path="clientes" element={<ClientsPage />} />
      <Route path="servicos" element={<ServicesPage />} />
      <Route path="estoque" element={<StockPage />} />
      <Route path="financeiro" element={<FinancePage />} />
      <Route path="relatorios" element={<ReportsPage />} />
      <Route path="configuracoes" element={<SettingsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/agendar" replace />} />
  </Routes>;
}
