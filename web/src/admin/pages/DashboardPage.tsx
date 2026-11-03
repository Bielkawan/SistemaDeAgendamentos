import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useAppointments, useDashboard } from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { Icon, type IconName } from "../../components/Icon";
import { EmptyState, Loading } from "../../components/Modal";
import { MoreMenu } from "../../components/MoreMenu";
import { dateKeyToNoon, formatDay, formatDuration, formatLongDate, formatMoney, formatPercent, formatTime, formatWeekday, initials, statusClass, statusLabel, todayISO, toneFor, whatsappLink } from "../../lib/format";
import type { AdminOutletContext } from "../AdminLayout";
import { LowStockModal } from "../modals/LowStockModal";
import { useAppointmentActions } from "../useAppointmentActions";

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function StatCard({ label, value, detail, icon, tone, progress, onClick }: { label: string; value: string; detail: string; icon: IconName; tone: string; progress?: number; onClick: () => void }) {
  return <button className="stat-card" onClick={onClick} aria-label={`Abrir detalhes de ${label}`}>
    <div className={`stat-icon ${tone}`}><Icon name={icon} /></div>
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{value}</strong>
    <div className="stat-detail">
      {progress !== undefined ? <><div className="mini-progress"><i style={{ width: `${progress}%` }} /></div><span>{detail}</span></> : <><span className="positive"><Icon name="trend" size={14} />{detail}</span><span>vs. mês anterior</span></>}
    </div>
    <span className="stat-link">Ver detalhes <Icon name="arrow" size={13} /></span>
  </button>;
}

const greeting = () => { const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(new Date())); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
const growthText = (g: number | null) => g === null ? "—" : formatPercent(Math.abs(g));

export function DashboardPage() {
  const { openAppointment } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = todayISO();
  const [selected, setSelected] = useState(today);
  const [showMonth, setShowMonth] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const { data, isLoading } = useDashboard(selected);
  const todayList = useAppointments({ from: today, to: today });
  const actions = useAppointmentActions(openAppointment);

  const [y, m] = selected.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const changeMonth = (dir: number) => { const d = new Date(Date.UTC(y, m - 1 + dir, 1)); setSelected(d.toISOString().slice(0, 10)); };
  const selectedWeek = data?.week.find(d => d.date === selected);
  const upcoming = useMemo(() => (todayList.data?.items ?? []).filter(a => a.status !== "CANCELLED"), [todayList.data]);

  if (isLoading || !data) return <Loading />;
  const s = data.stats;
  const firstName = user?.name.split(" ")[0] ?? "";

  return <>
    <section className="welcome">
      <div><span className="eyebrow">{formatLongDate(dateKeyToNoon(today)).toUpperCase()}</span><h1>{greeting()}, {firstName}</h1><p>{s.appointmentsToday ? `Você tem ${s.appointmentsToday} atendimento(s) hoje.` : "Nenhum atendimento marcado para hoje ainda."}</p></div>
      <button className="primary-button" onClick={() => openAppointment()}><Icon name="plus" /> Novo agendamento</button>
    </section>
    <section className="stats-grid">
      <StatCard label="Agendamentos hoje" value={String(s.appointmentsToday)} detail={`${s.confirmedToday} confirmados`} icon="calendar" tone="rose" progress={s.appointmentsToday ? Math.round(s.confirmedToday / s.appointmentsToday * 100) : 0} onClick={() => navigate("/admin/agenda")} />
      <StatCard label="Serviços realizados" value={String(s.completedMonth)} detail={growthText(s.completedMonthGrowth)} icon="sparkles" tone="copper" onClick={() => navigate("/admin/relatorios")} />
      <StatCard label="Novos clientes" value={String(s.newClientsMonth)} detail={growthText(s.newClientsGrowth)} icon="users" tone="mauve" onClick={() => navigate("/admin/relatorios")} />
      <StatCard label="Ocupação da agenda" value={`${s.occupancy.percent}%`} detail={`${s.occupancy.booked} de ${s.occupancy.total} horários`} icon="clock" tone="green" progress={s.occupancy.percent} onClick={() => navigate("/admin/relatorios")} />
    </section>
    <section className="dashboard-grid">
      <div className="panel schedule-panel">
        <div className="panel-heading">
          <div><h2>Agenda de hoje</h2><p>{upcoming.length} atendimento(s)</p></div>
          <button className="text-button" onClick={() => navigate("/admin/agenda")}>Ver agenda completa <Icon name="arrow" size={16} /></button>
        </div>
        <div className="appointment-list">
          {upcoming.length === 0 && <EmptyState title="Agenda livre" text="Nenhum atendimento para hoje." />}
          {upcoming.map(a => <div className="appointment" key={a.id}>
            <div className="appointment-time"><strong>{formatTime(a.startsAt)}</strong><span>{formatDuration(a.service.durationMin)}</span></div>
            <div className="line-dot" />
            <div className={`client-avatar ${toneFor(a.client.id)}`}>{initials(a.client.name)}</div>
            <div className="appointment-info"><strong>{a.client.name}</strong><span>{a.serviceName}</span></div>
            <div className="appointment-value"><strong>{formatMoney(a.priceCents)}</strong><span className={`status ${statusClass[a.status]}`}>{statusLabel[a.status]}</span></div>
            <MoreMenu items={actions(a)} label={`Opções do agendamento de ${a.client.name}`} />
          </div>)}
        </div>
      </div>
      <div className="side-stack">
        <div className="panel calendar-panel">
          <div className="panel-heading compact"><div><h2>{months[m - 1]} {y}</h2><p>Dia {selected.slice(8)} selecionado</p></div><div className="calendar-nav"><button onClick={() => changeMonth(-1)} aria-label="Mês anterior"><Icon name="arrow" /></button><button className="calendar-today" onClick={() => setShowMonth(v => !v)} aria-label="Abrir calendário" aria-expanded={showMonth}><Icon name="calendar" size={15} /></button><button onClick={() => changeMonth(1)} aria-label="Próximo mês"><Icon name="arrow" /></button></div></div>
          {showMonth && <div className="mini-month-calendar">
            <div className="mini-calendar-title"><strong>{months[m - 1]} {y}</strong><button onClick={() => { setSelected(today); setShowMonth(false); }}>Hoje</button></div>
            <div className="mini-weekdays">{["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="mini-days">
              {Array.from({ length: firstWeekday }).map((_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => `${selected.slice(0, 8)}${String(i + 1).padStart(2, "0")}`).map(d => <button key={d} className={selected === d ? "active" : ""} onClick={() => { setSelected(d); setShowMonth(false); }}>{Number(d.slice(8))}</button>)}
            </div>
          </div>}
          <div className="week">
            {data.week.map(d => <button key={d.date} className={selected === d.date ? "selected" : ""} onClick={() => setSelected(d.date)} aria-label={`Selecionar dia ${d.date}`}><span>{formatWeekday(dateKeyToNoon(d.date))}</span><strong>{formatDay(dateKeyToNoon(d.date))}</strong>{selected === d.date && <i />}</button>)}
          </div>
          <div className="calendar-summary"><div><span>Disponíveis</span><strong>{selectedWeek?.available ?? 0} horários</strong></div><div><span>Ocupados</span><strong>{selectedWeek?.booked ?? 0} horários</strong></div></div>
        </div>
      </div>
    </section>
    <section className="lower-grid">
      <div className="panel attention-panel">
        <div className="panel-heading compact"><div><h2>Clientes para reativar</h2><p>Sem agendamento há mais de 45 dias</p></div><button className="text-button" onClick={() => navigate("/admin/clientes?filter=reactivate")}>Ver todos <Icon name="arrow" size={16} /></button></div>
        <div className="reactivation-row">
          {data.reactivation.length === 0 && <EmptyState title="Tudo certo" text="Nenhuma cliente inativa." />}
          {data.reactivation.slice(0, 3).map(c => {
            const days = c.lastVisitAt ? Math.floor((Date.now() - new Date(c.lastVisitAt).getTime()) / 86_400_000) : null;
            return <div className="reactivation" key={c.id}><div className={`client-avatar ${toneFor(c.id)}`}>{initials(c.name)}</div><div><strong>{c.name}</strong><span>{days !== null ? `Último atendimento há ${days} dias` : "Sem atendimentos"}</span></div>
              <a href={whatsappLink(c.phone, `Olá, ${c.name.split(" ")[0]}! Estamos com saudades no NR Studio. Que tal agendar seu próximo horário?`)} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${c.name} no WhatsApp`}><button tabIndex={-1}><Icon name="whatsapp" /></button></a></div>;
          })}
        </div>
      </div>
      {data.lowStock.length > 0 && <button className="urgent-stock" onClick={() => setShowStock(true)}>
        <div className="urgent-stock-head"><div className="urgent-stock-icon"><Icon name="box" /></div><span>ALERTA DE ESTOQUE</span></div>
        <strong>{data.lowStock.length} produto(s) em nível crítico</strong>
        <p>{data.lowStock.slice(0, 3).map(p => p.name).join(", ")} precisam de reposição.</p>
        <div className="urgent-stock-action"><span>Ver produtos</span><Icon name="arrow" size={16} /></div>
      </button>}
    </section>
    {showStock && <LowStockModal products={data.lowStock} onClose={() => setShowStock(false)} onViewStock={() => navigate("/admin/estoque")} />}
  </>;
}
