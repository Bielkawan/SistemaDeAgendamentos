import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api/client";
import { crud, useApiMutation, useFinanceSummary, useTransactions } from "../../api/hooks";
import type { PaymentMethod, Transaction } from "../../api/types";
import { Icon } from "../../components/Icon";
import { FormError, Loading, Modal } from "../../components/Modal";
import { MoreMenu } from "../../components/MoreMenu";
import { dateKeyToNoon, formatLongDate, formatMoney, formatPercent, formatShortDate, growth, parseMoneyToCents, paymentLabel, todayISO } from "../../lib/format";
import { Cell, DataTable, FilterSelect, ModuleShell, SearchInput } from "../ModuleShell";

const txApi = crud<Transaction>("/admin/finance/transactions");
const monthOptions = (): [string, string][] => Array.from({ length: 12 }, (_, i) => {
  const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i);
  const key = d.toISOString().slice(0, 7);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(d).replace(" de ", " ");
  return [key, label.charAt(0).toUpperCase() + label.slice(1)];
});

function TransactionModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Insumos");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [error, setError] = useState<string | null>(null);
  const m = useApiMutation(txApi.create, [["transactions"]]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const amountCents = parseMoneyToCents(amount);
    if (!Number.isFinite(amountCents) || amountCents <= 0) { setError("Valor inválido."); return; }
    try { await m.mutateAsync({ type, description: description.trim(), category: category.trim(), amountCents, date, paymentMethod }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return <Modal eyebrow="FINANCEIRO" title="Novo lançamento" description="Receitas de atendimentos concluídos entram automaticamente." onClose={onClose}>
    <form onSubmit={submit}>
      <FormError message={error} />
      <label>Tipo<select value={type} onChange={e => setType(e.target.value as "INCOME" | "EXPENSE")}><option value="EXPENSE">Despesa</option><option value="INCOME">Receita avulsa</option></select></label>
      <label>Descrição<input required maxLength={160} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: Compra de insumos" /></label>
      <div className="form-row"><label>Categoria<input required maxLength={60} value={category} onChange={e => setCategory(e.target.value)} /></label><label>Valor (R$)<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></label></div>
      <div className="form-row"><label>Data<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Forma<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>{(Object.keys(paymentLabel) as PaymentMethod[]).map(p => <option key={p} value={p}>{paymentLabel[p]}</option>)}</select></label></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={m.isPending}>Salvar</button></div>
    </form>
  </Modal>;
}

function Trend({ value, text }: { value: number | null; text: string }) {
  return <small><b><Icon name="trend" size={13} /> {value === null ? "—" : `${value < 0 ? "−" : ""}${formatPercent(Math.abs(value))}`}</b> {text}</small>;
}

export function FinancePage() {
  const months = monthOptions();
  const [month, setMonth] = useState(months[0][0]);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const summary = useFinanceSummary(month).data;
  const { data, isLoading } = useTransactions({ month, type: type || undefined, q: q.trim() || undefined });
  const remove = useApiMutation(txApi.remove, [["transactions"]]);
  const max = Math.max(1, ...(summary?.daily.map(d => d.revenueCents) ?? []));
  return <ModuleShell title="Financeiro" description="Controle receitas, despesas, pagamentos e lucratividade." action={{ label: "Novo lançamento", onClick: () => setModal(true) }}
    summary={summary && <>
      <div className="finance-stats">
        <div className="finance-card"><span>Faturamento hoje</span><strong>{formatMoney(summary.revenueToday)}</strong><Trend value={growth(summary.revenueToday, summary.revenueYesterday)} text="comparado a ontem" /></div>
        <div className="finance-card featured"><span>Faturamento mensal</span><strong>{formatMoney(summary.revenueMonth)}</strong><Trend value={growth(summary.revenueMonth, summary.revenuePrevMonth)} text="comparado ao mês anterior" /></div>
        <div className="finance-card"><span>Ticket médio</span><strong>{formatMoney(summary.averageTicket)}</strong><small>{summary.completedMonth} atendimentos · despesas {formatMoney(summary.expensesMonth)}</small></div>
      </div>
      <div className="panel daily-revenue">
        <div className="panel-heading compact"><div><h2>Faturamento por dia</h2><p>Acompanhe o desempenho diário do studio</p></div><FilterSelect value={month} onChange={setMonth} options={months} /></div>
        <div className="daily-list">
          {summary.daily.length === 0 && <div className="slot-empty">Sem receitas neste mês.</div>}
          {summary.daily.map(d => <div className="daily-row" key={d.date}>
            <div><strong>{d.date === todayISO() ? "Hoje" : formatLongDate(dateKeyToNoon(d.date))}</strong><span>{d.count} lançamento(s)</span></div>
            <i><b style={{ width: `${d.revenueCents / max * 100}%` }} /></i>
            <strong>{formatMoney(d.revenueCents)}</strong>
          </div>)}
        </div>
      </div>
    </>}
    tools={<><SearchInput value={q} onChange={setQ} placeholder="Buscar em financeiro..." /><FilterSelect value={type} onChange={setType} options={[["", "Todos os registros"], ["INCOME", "Receitas"], ["EXPENSE", "Despesas"]]} /></>}>
    {isLoading ? <Loading /> : <DataTable columns={["Data", "Descrição", "Categoria", "Forma", "Valor"]} empty={!data?.items.length}>
      {data?.items.map(t => <tr key={t.id}>
        <Cell label="Data">{formatShortDate(dateKeyToNoon(t.date.slice(0, 10)))}</Cell><Cell label="Descrição">{t.description}</Cell><Cell label="Categoria">{t.type === "INCOME" ? "Receita" : "Despesa"} · {t.category}</Cell><Cell label="Forma">{paymentLabel[t.paymentMethod]}</Cell>
        <Cell label="Valor" status>{t.type === "INCOME" ? "+ " : "− "}{formatMoney(t.amountCents)}</Cell>
        <td className="table-actions" data-label="Ações">{!t.appointmentId && <MoreMenu label={`Opções de ${t.description}`} items={[{ label: "Excluir", danger: true, onClick: () => remove.mutateAsync(t.id).catch(err => alert(errorMessage(err))) }]} />}</td>
      </tr>)}
    </DataTable>}
    {modal && <TransactionModal onClose={() => setModal(false)} />}
  </ModuleShell>;
}
