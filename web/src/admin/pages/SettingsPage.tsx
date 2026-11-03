import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../api/client";
import { crud, useApiMutation, useProfessionals, useSettings, useTimeOffs } from "../../api/hooks";
import type { BusinessHour, PaymentMethod, Professional, Settings, TimeOff } from "../../api/types";
import { FormError, Loading } from "../../components/Modal";
import { formatDate, formatTime, localToISO, minToTime, paymentLabel, timeToMin, todayISO, weekdayNames } from "../../lib/format";
import { ModuleShell } from "../ModuleShell";

const timeOffApi = crud<TimeOff>("/admin/time-offs");
const proApi = crud<Professional>("/admin/professionals");

function GeneralForm({ settings }: { settings: Settings }) {
  const [form, setForm] = useState(settings);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(settings), [settings]);
  const m = useApiMutation((body: Partial<Settings>) => api<Settings>("/admin/settings", { method: "PATCH", body }), [["settings"], ["slots"]]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm(f => ({ ...f, [k]: v }));
  const setHour = (weekday: number, patch: Partial<BusinessHour> | null) => setForm(f => {
    const others = f.businessHours.filter(h => h.weekday !== weekday);
    if (patch === null) return { ...f, businessHours: others };
    const cur = f.businessHours.find(h => h.weekday === weekday) ?? { weekday, startMin: 540, endMin: 1080 };
    return { ...f, businessHours: [...others, { ...cur, ...patch }].sort((a, b) => a.weekday - b.weekday) };
  });
  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(null); setError(null);
    try {
      const { name, legalName, phone, address, slotIntervalMin, minAdvanceMin, maxAdvanceDays, cancellationHours, autoConfirmOnline, paymentMethods, pixKey, whatsappEnabled, businessHours } = form;
      await m.mutateAsync({ name, legalName, phone, address, slotIntervalMin, minAdvanceMin, maxAdvanceDays, cancellationHours, autoConfirmOnline, paymentMethods, pixKey, whatsappEnabled, businessHours });
      setMsg("Configurações salvas.");
    } catch (err) { setError(errorMessage(err)); }
  }
  const publicUrl = `${window.location.origin}/agendar`;
  return <form onSubmit={submit} className="settings-grid">
    <div className="panel"><div className="panel-heading compact"><div><h2>Dados do estabelecimento</h2><p>Exibidos na página de agendamento</p></div></div>
      <label>Nome<input required maxLength={120} value={form.name} onChange={e => set("name", e.target.value)} /></label>
      <label>Razão social<input maxLength={160} value={form.legalName ?? ""} onChange={e => set("legalName", e.target.value || null)} /></label>
      <label>Telefone<input maxLength={30} value={form.phone ?? ""} onChange={e => set("phone", e.target.value || null)} /></label>
      <label>Endereço<input maxLength={200} value={form.address ?? ""} onChange={e => set("address", e.target.value || null)} /></label>
      <span className="form-hint">Link para clientes:</span><div className="public-link">{publicUrl}</div>
    </div>
    <div className="panel"><div className="panel-heading compact"><div><h2>Horários de atendimento</h2><p>Fuso: {form.timezone}</p></div></div>
      {weekdayNames.map((n, i) => { const h = form.businessHours.find(b => b.weekday === i); return <div className="hours-row" key={i}>
        <label className="checkbox-line"><input type="checkbox" checked={!!h} onChange={e => setHour(i, e.target.checked ? {} : null)} /> {n}</label>
        <input type="time" disabled={!h} value={h ? minToTime(h.startMin) : ""} onChange={e => setHour(i, { startMin: timeToMin(e.target.value) })} aria-label={`Abertura ${n}`} />
        <input type="time" disabled={!h} value={h ? minToTime(h.endMin) : ""} onChange={e => setHour(i, { endMin: timeToMin(e.target.value) })} aria-label={`Fechamento ${n}`} />
        <span />
      </div>; })}
    </div>
    <div className="panel"><div className="panel-heading compact"><div><h2>Regras de agendamento online</h2><p>Aplicadas à página pública</p></div></div>
      <div className="form-row"><label>Intervalo entre horários (min)<input type="number" min={5} max={120} step={5} value={form.slotIntervalMin} onChange={e => set("slotIntervalMin", Number(e.target.value))} /></label>
        <label>Antecedência mínima (min)<input type="number" min={0} max={10080} value={form.minAdvanceMin} onChange={e => set("minAdvanceMin", Number(e.target.value))} /></label></div>
      <div className="form-row"><label>Agendar até (dias)<input type="number" min={1} max={365} value={form.maxAdvanceDays} onChange={e => set("maxAdvanceDays", Number(e.target.value))} /></label>
        <label>Cancelamento até (horas antes)<input type="number" min={0} max={168} value={form.cancellationHours} onChange={e => set("cancellationHours", Number(e.target.value))} /></label></div>
      <label className="checkbox-line"><input type="checkbox" checked={form.autoConfirmOnline} onChange={e => set("autoConfirmOnline", e.target.checked)} /> Confirmar automaticamente agendamentos online</label>
    </div>
    <div className="panel"><div className="panel-heading compact"><div><h2>Pagamentos e WhatsApp</h2><p>Formas aceitas</p></div></div>
      {(Object.keys(paymentLabel) as PaymentMethod[]).map(p => <label className="checkbox-line" key={p}><input type="checkbox" checked={form.paymentMethods.includes(p)} onChange={e => set("paymentMethods", e.target.checked ? [...form.paymentMethods, p] : form.paymentMethods.filter(x => x !== p))} /> {paymentLabel[p]}</label>)}
      <label>Chave PIX<input maxLength={120} value={form.pixKey ?? ""} onChange={e => set("pixKey", e.target.value || null)} /></label>
      <label className="checkbox-line"><input type="checkbox" checked={form.whatsappEnabled} onChange={e => set("whatsappEnabled", e.target.checked)} /> Integração WhatsApp ativa</label>
      <FormError message={error} />{msg && <span className="form-hint">{msg}</span>}
      <div className="modal-actions"><button className="primary-button" disabled={m.isPending}>Salvar configurações</button></div>
    </div>
  </form>;
}

function TimeOffPanel() {
  const { data } = useTimeOffs();
  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation(timeOffApi.create, [["time-offs"], ["slots"]]);
  const remove = useApiMutation(timeOffApi.remove, [["time-offs"], ["slots"]]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await create.mutateAsync({ startsAt: localToISO(date, start), endsAt: localToISO(date, end), reason: reason.trim() || null }); setReason(""); } catch (err) { setError(errorMessage(err)); }
  }
  return <div className="panel"><div className="panel-heading compact"><div><h2>Bloqueios de agenda</h2><p>Folgas, feriados e intervalos</p></div></div>
    <form onSubmit={submit}>
      <FormError message={error} />
      <div className="form-row"><label>Data<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label>Motivo<input maxLength={120} value={reason} onChange={e => setReason(e.target.value)} placeholder="Opcional" /></label></div>
      <div className="form-row"><label>Início<input type="time" required value={start} onChange={e => setStart(e.target.value)} /></label><label>Fim<input type="time" required value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      <button className="secondary-button" disabled={create.isPending}>Adicionar bloqueio</button>
    </form>
    <div className="critical-products" style={{ marginTop: 14 }}>{data?.map(t => <div className="critical-product" key={t.id}><div><strong>{formatDate(t.startsAt)} · {formatTime(t.startsAt)}–{formatTime(t.endsAt)}</strong><span>{t.reason ?? "Bloqueio"}</span></div><button className="btn-small danger" onClick={() => remove.mutate(t.id)}>Remover</button></div>)}</div>
  </div>;
}

function ProfessionalsPanel() {
  const { data } = useProfessionals();
  const [name, setName] = useState("");
  const create = useApiMutation(proApi.create, [["professionals"]]);
  const update = useApiMutation(proApi.update, [["professionals"]]);
  return <div className="panel"><div className="panel-heading compact"><div><h2>Profissionais</h2><p>Quem atende no studio</p></div></div>
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) create.mutateAsync({ name: name.trim() }).then(() => setName("")).catch(err => alert(errorMessage(err))); }} className="form-row">
      <label>Nome<input maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label><label>&nbsp;<button className="secondary-button">Adicionar</button></label>
    </form>
    <div className="critical-products">{data?.map(p => <div className="critical-product" key={p.id}><div><strong>{p.name}</strong><span>{p.active ? "Ativa" : "Inativa"}</span></div><button className="btn-small" onClick={() => update.mutate({ id: p.id, active: !p.active })}>{p.active ? "Desativar" : "Ativar"}</button></div>)}</div>
  </div>;
}

export function SettingsPage() {
  const { data } = useSettings();
  return <ModuleShell title="Configurações" description="Personalize seu studio, equipe e preferências de acesso.">
    {!data ? <Loading /> : <><GeneralForm settings={data} /><div className="settings-grid" style={{ marginTop: 20 }}><TimeOffPanel /><ProfessionalsPanel /></div></>}
  </ModuleShell>;
}
