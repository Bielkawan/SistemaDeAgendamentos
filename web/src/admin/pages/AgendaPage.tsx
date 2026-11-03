import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useAppointments } from "../../api/hooks";
import { Loading } from "../../components/Modal";
import { MoreMenu } from "../../components/MoreMenu";
import { addDaysISO, formatDate, formatMoney, formatTime, paymentLabel, statusLabel, todayISO } from "../../lib/format";
import type { AdminOutletContext } from "../AdminLayout";
import { Cell, DataTable, FilterSelect, ModuleShell, SearchInput } from "../ModuleShell";
import { useAppointmentActions } from "../useAppointmentActions";

export function AgendaPage() {
  const { openAppointment } = useOutletContext<AdminOutletContext>();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "";
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(addDaysISO(todayISO(), 30));
  const { data, isLoading } = useAppointments({ from, to, status, q: q.trim() || undefined });
  const actions = useAppointmentActions(openAppointment);

  return <ModuleShell title="Agenda" description="Gerencie horários disponíveis, confirmações e atendimentos." action={{ label: "Novo agendamento", onClick: () => openAppointment() }}
    tools={<>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar por cliente..." />
      <input className="filter-select" type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="De" />
      <input className="filter-select" type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="Até" />
      <FilterSelect value={status} onChange={v => setParams(v ? { status: v } : {})} options={[["", "Todos os status"], ["PENDING", "Aguardando"], ["CONFIRMED", "Confirmados"], ["COMPLETED", "Concluídos"], ["CANCELLED", "Cancelados"], ["NO_SHOW", "Não compareceu"]]} />
    </>}>
    {isLoading ? <Loading /> : <DataTable columns={["Data", "Horário", "Cliente", "Serviço", "Profissional", "Valor", "Status"]} empty={!data?.items.length}>
      {data?.items.map(a => <tr key={a.id}>
        <Cell label="Data">{formatDate(a.startsAt)}</Cell>
        <Cell label="Horário">{formatTime(a.startsAt)} – {formatTime(a.endsAt)}</Cell>
        <Cell label="Cliente">{a.client.name}{a.source === "ONLINE" && <small className="form-hint"> · online</small>}</Cell>
        <Cell label="Serviço">{a.serviceName}</Cell>
        <Cell label="Profissional">{a.professional.name}</Cell>
        <Cell label="Valor">{formatMoney(a.priceCents)} · {paymentLabel[a.paymentMethod]}</Cell>
        <Cell label="Status" status>{statusLabel[a.status]}</Cell>
        <td className="table-actions" data-label="Ações">{actions(a).length > 0 && <MoreMenu items={actions(a)} label={`Opções de ${a.client.name}`} />}</td>
      </tr>)}
    </DataTable>}
  </ModuleShell>;
}
