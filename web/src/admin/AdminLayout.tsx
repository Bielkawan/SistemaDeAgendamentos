import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import logo from "../assets/logo.webp";
import { api } from "../api/client";
import { useDashboard } from "../api/hooks";
import type { Appointment, Client, Service } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Icon, type IconName } from "../components/Icon";
import { MoreMenu } from "../components/MoreMenu";
import { formatFullDate, formatTime, formatDate, initials, todayISO, dateKeyToNoon } from "../lib/format";
import { AppointmentModal } from "./modals/AppointmentModal";

const nav: { label: string; to: string; icon: IconName }[] = [
  { label: "Visão geral", to: "/admin", icon: "home" },
  { label: "Agenda", to: "/admin/agenda", icon: "calendar" },
  { label: "Clientes", to: "/admin/clientes", icon: "users" },
  { label: "Serviços", to: "/admin/servicos", icon: "sparkles" },
  { label: "Estoque", to: "/admin/estoque", icon: "box" },
  { label: "Financeiro", to: "/admin/financeiro", icon: "wallet" },
  { label: "Relatórios", to: "/admin/relatorios", icon: "chart" },
];

export interface AdminOutletContext { openAppointment: (appointment?: Appointment) => void }

function Sidebar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
    <button className="close-sidebar icon-button" onClick={() => setOpen(false)} aria-label="Fechar menu"><Icon name="close" /></button>
    <div className="brand">
      <div className="brand-logo"><img src={logo} alt="NR Nails & Sobrancelhas" /></div>
      <div><strong>NR Studio</strong><span>NAILS & BROWS</span></div>
    </div>
    <div className="nav-label">MENU PRINCIPAL</div>
    <nav>
      {nav.map(item => <NavLink key={item.to} to={item.to} end={item.to === "/admin"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setOpen(false)}>
        {({ isActive }) => <><Icon name={item.icon} /><span>{item.label}</span>{isActive && <i />}</>}
      </NavLink>)}
    </nav>
    <div className="sidebar-bottom">
      <NavLink to="/admin/configuracoes" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setOpen(false)}><Icon name="settings" /><span>Configurações</span></NavLink>
      <div className="profile">
        <div className="profile-avatar">{initials(user?.name ?? "NR")}</div>
        <div><strong>{user?.name}</strong><span>Administradora</span></div>
        <MoreMenu items={[
          { label: "Minha conta", onClick: () => navigate("/admin/configuracoes") },
          { label: "Página de agendamento", onClick: () => window.open("/agendar", "_blank", "noopener") },
          { label: "Sair do sistema", danger: true, onClick: () => { void logout().then(() => navigate("/admin/login")); } },
        ]} label="Opções do perfil" />
      </div>
    </div>
  </aside>;
}

function Header({ setSidebar, setSearch }: { setSidebar: (v: boolean) => void; setSearch: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { data } = useDashboard();
  const notifications = useMemo(() => {
    if (!data || dismissed) return [];
    const list: { title: string; detail: string; icon: IconName; to: string; tone: string }[] = [];
    if (data.lowStock.length) list.push({ title: `${data.lowStock.length} produto(s) com estoque baixo`, detail: "Reposição necessária", icon: "box", to: "/admin/estoque", tone: "alert" });
    if (data.pendingCount) list.push({ title: `${data.pendingCount} agendamento(s) aguardando`, detail: "Confirme os horários solicitados", icon: "calendar", to: "/admin/agenda?status=PENDING", tone: "calendar" });
    if (data.reactivation.length) list.push({ title: "Clientes para reativar", detail: `${data.reactivation.length} cliente(s) sem agendar há 45 dias`, icon: "users", to: "/admin/clientes?filter=reactivate", tone: "client" });
    return list;
  }, [data, dismissed]);

  return <header>
    <button className="mobile-menu icon-button" onClick={() => setSidebar(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
    <div className="mobile-brand"><img src={logo} alt="" /><div><strong>NR Studio</strong><span>NAILS & BROWS</span></div></div>
    <button className="search" onClick={() => setSearch(true)}><Icon name="search" /><span>Buscar clientes, agendamentos...</span><kbd>⌘ K</kbd></button>
    <div className="header-actions">
      <div className="today"><span>Hoje</span><strong>{formatFullDate(dateKeyToNoon(todayISO()))}</strong></div>
      <div className="notification-wrap">
        <button className="icon-button notification" aria-label="Notificações" aria-expanded={open} onClick={() => setOpen(v => !v)}><Icon name="bell" />{notifications.length > 0 && <i />}</button>
        {open && <div className="notification-panel">
          <div className="notification-head"><div><strong>Notificações</strong><span>{notifications.length} avisos novos</span></div>{notifications.length > 0 && <button onClick={() => setDismissed(true)}>Marcar como lidas</button>}</div>
          <div className="notification-list">
            {notifications.length > 0 ? notifications.map(note => <button key={note.title} onClick={() => { navigate(note.to); setOpen(false); }}>
              <span className={`notification-icon ${note.tone}`}><Icon name={note.icon} size={17} /></span>
              <span><strong>{note.title}</strong><small>{note.detail}</small></span>
              <Icon name="arrow" size={15} />
            </button>) : <div className="empty-notifications"><Icon name="bell" /><strong>Tudo em dia</strong><span>Você não possui novos avisos.</span></div>}
          </div>
        </div>}
      </div>
    </div>
  </header>;
}

function MobileNavigation({ openMenu }: { openMenu: () => void }) {
  const items: { label: string; to: string; icon: IconName }[] = [
    { label: "Início", to: "/admin", icon: "home" },
    { label: "Agenda", to: "/admin/agenda", icon: "calendar" },
    { label: "Clientes", to: "/admin/clientes", icon: "users" },
    { label: "Financeiro", to: "/admin/financeiro", icon: "wallet" },
  ];
  return <nav className="mobile-navigation" aria-label="Navegação principal">
    {items.map(item => <NavLink key={item.to} to={item.to} end={item.to === "/admin"} className={({ isActive }) => isActive ? "active" : ""}><Icon name={item.icon} size={20} /><span>{item.label}</span></NavLink>)}
    <button onClick={openMenu}><Icon name="menu" size={20} /><span>Menu</span></button>
  </nav>;
}

interface SearchResult { clients: Client[]; appointments: Appointment[]; services: Service[] }

function SearchDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data } = useQuery({ queryKey: ["search", debounced], enabled: debounced.length >= 2, queryFn: () => api<SearchResult>("/admin/search", { query: { q: debounced } }) });
  const go = (to: string) => { navigate(to); onClose(); };
  const empty = data && !data.clients.length && !data.appointments.length && !data.services.length;
  return <div className="search-overlay" onMouseDown={onClose}><div className="search-dialog" onMouseDown={e => e.stopPropagation()}>
    <Icon name="search" size={22} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Escape" && onClose()} placeholder="Buscar clientes, serviços ou agendamentos..." /><button onClick={onClose}>ESC</button>
    {data && <div className="search-results">
      {data.clients.map(c => <button key={c.id} onClick={() => go(`/admin/clientes?q=${encodeURIComponent(c.name)}`)}><strong>{c.name}</strong><span>Cliente</span></button>)}
      {data.appointments.map(a => <button key={a.id} onClick={() => go(`/admin/agenda?q=${encodeURIComponent(a.client.name)}`)}><strong>{a.client.name} · {a.serviceName}</strong><span>{formatDate(a.startsAt)} {formatTime(a.startsAt)}</span></button>)}
      {data.services.map(s => <button key={s.id} onClick={() => go("/admin/servicos")}><strong>{s.name}</strong><span>Serviço</span></button>)}
      {empty && <span className="search-empty">Nenhum resultado para “{debounced}”.</span>}
    </div>}
  </div></div>;
}

export function AdminLayout() {
  const [sidebar, setSidebar] = useState(false);
  const [search, setSearch] = useState(false);
  const [appointmentModal, setAppointmentModal] = useState<{ open: boolean; appointment?: Appointment }>({ open: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const ctx: AdminOutletContext = { openAppointment: appointment => setAppointmentModal({ open: true, appointment }) };
  return <div className="app-shell">
    <Sidebar open={sidebar} setOpen={setSidebar} />
    {sidebar && <div className="mobile-overlay" onClick={() => setSidebar(false)} />}
    <main>
      <Header setSidebar={setSidebar} setSearch={setSearch} />
      <div className="content"><Outlet context={ctx} /></div>
    </main>
    <MobileNavigation openMenu={() => setSidebar(true)} />
    {appointmentModal.open && <AppointmentModal appointment={appointmentModal.appointment} onClose={() => setAppointmentModal({ open: false })} />}
    {search && <SearchDialog onClose={() => setSearch(false)} />}
  </div>;
}
