import { useReports } from "../../api/hooks";
import { Icon } from "../../components/Icon";
import { Loading } from "../../components/Modal";
import { formatMoney, formatMonthYear, formatPercent, growth } from "../../lib/format";
import { Cell, DataTable, ModuleShell } from "../ModuleShell";

const cmp = (cur: number, prev: number) => { const g = growth(cur, prev); return g === null ? "—" : `${g >= 0 ? "+" : "−"} ${formatPercent(Math.abs(g))}`; };
const trendLabel = (cur: number, prev: number) => cur > prev ? "Em crescimento" : cur < prev ? "Em queda" : "Estável";

export function ReportsPage() {
  const { data } = useReports();
  if (!data) return <Loading />;
  const period = formatMonthYear(`${data.month}-15T12:00:00Z`);
  const rows = [
    ["Ocupação da agenda", period, `${data.occupancy.percent}%`, cmp(data.occupancy.percent, data.occupancy.prevPercent), data.occupancy.percent >= 70 ? "Muito boa" : trendLabel(data.occupancy.percent, data.occupancy.prevPercent)],
    ["Serviços realizados", period, `${data.completed.count} serviços`, cmp(data.completed.count, data.completed.prevCount), trendLabel(data.completed.count, data.completed.prevCount)],
    ["Novos clientes", period, `${data.newClients.count} clientes`, cmp(data.newClients.count, data.newClients.prevCount), trendLabel(data.newClients.count, data.newClients.prevCount)],
    ["Agendamentos", "Hoje", `${data.today.total} horários`, `${data.today.confirmed} confirmados`, `${data.today.pending} aguardando`],
    ["Resumo financeiro", period, formatMoney(data.revenue.cents), cmp(data.revenue.cents, data.revenue.prevCents), data.revenue.cents >= data.revenue.prevCents ? "Positivo" : "Atenção"],
  ];
  const ng = growth(data.newClients.count, data.newClients.prevCount);
  return <ModuleShell title="Relatórios" description="Visualize indicadores operacionais, financeiros e de desempenho."
    summary={<div className="reports-summary">
      <div className="panel services-report">
        <div className="panel-heading compact"><div><h2>Percentual de serviços realizados</h2><p>Distribuição dos {data.completed.count} atendimentos de {period.split(" ")[0].toLowerCase()}</p></div><div className="stat-icon copper"><Icon name="sparkles" /></div></div>
        <div className="service-percentages">
          {data.servicesShare.length === 0 && <div className="slot-empty">Nenhum atendimento concluído neste mês.</div>}
          {data.servicesShare.map(s => <div className="percentage-row" key={s.name}><div><span>{s.name}</span><strong>{s.percent}%</strong></div><i><b style={{ width: `${s.percent}%` }} /></i></div>)}
        </div>
      </div>
      <div className="panel clients-report">
        <div className="stat-icon mauve"><Icon name="users" /></div>
        <span>Novos clientes</span><strong>{data.newClients.count}</strong><p>clientes cadastrados no mês</p>
        <small><Icon name="trend" size={14} /> {ng === null ? "Sem base de comparação" : `${formatPercent(Math.abs(ng))} ${ng >= 0 ? "a mais" : "a menos"} que no mês anterior`}</small>
      </div>
    </div>}>
    <DataTable columns={["Relatório", "Período", "Indicador", "Comparativo", "Situação"]}>
      {rows.map(r => <tr key={r[0]}>{r.map((c, j) => <Cell key={j} label={["Relatório", "Período", "Indicador", "Comparativo", "Situação"][j]} status={j === 4}>{c}</Cell>)}<td /></tr>)}
    </DataTable>
  </ModuleShell>;
}
