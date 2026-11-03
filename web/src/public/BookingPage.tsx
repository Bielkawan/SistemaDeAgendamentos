import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import logo from "../assets/logo.webp";
import { errorMessage } from "../api/client";
import { publicApi } from "../api/hooks";
import type { PaymentMethod, PublicAppointment, Slot } from "../api/types";
import { Icon } from "../components/Icon";
import { FormError, Loading } from "../components/Modal";
import { addDaysISO, dateKeyToNoon, formatDay, formatDuration, formatFullDate, formatLongDate, formatMoney, formatTime, formatWeekday, maskPhone, paymentLabel, todayISO } from "../lib/format";

export function BookingPage() {
  const studio = useQuery({ queryKey: ["public", "studio"], queryFn: publicApi.studio });
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [website, setWebsite] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [booked, setBooked] = useState<PublicAppointment | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const slots = useQuery({ queryKey: ["public", "slots", serviceId, date, professionalId], enabled: step >= 1 && !!serviceId, queryFn: () => publicApi.slots({ serviceId, date, professionalId: professionalId || undefined }) });
  const days = useMemo(() => Array.from({ length: Math.min(studio.data?.maxAdvanceDays ?? 30, 30) }, (_, i) => addDaysISO(todayISO(), i)), [studio.data]);
  const service = studio.data?.services.find(s => s.id === serviceId);

  if (studio.isLoading) return <Loading />;
  if (studio.isError || !studio.data) return <div className="auth-page"><div className="auth-card"><h1>Indisponível</h1><p>Não foi possível carregar a agenda agora. Tente novamente em instantes.</p></div></div>;
  const s = studio.data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setError(null); setSending(true);
    try {
      const res = await publicApi.book({ serviceId, professionalId: slot.professionalId, startsAt: slot.startsAt, client: { name: name.trim(), phone: phone.replace(/\D/g, "") }, paymentMethod, website }, idempotencyKey.current);
      setBooked(res);
      setStep(3);
    } catch (err) {
      setError(errorMessage(err));
      idempotencyKey.current = crypto.randomUUID();
      void slots.refetch();
    } finally { setSending(false); }
  }

  return <div className="booking-page">
    <div className="booking-hero"><img src={logo} alt="" /><h1>{s.name}</h1><p>AGENDAMENTO ONLINE</p></div>
    <div className="booking-card">
      <div className="booking-steps">{[0, 1, 2, 3].map(i => <span key={i} className={i <= step ? "done" : ""} />)}</div>

      {step === 0 && <>
        <h2>Escolha o serviço</h2><p className="booking-sub">Selecione o atendimento que você deseja.</p>
        <div className="service-options">
          {s.services.map(sv => <button key={sv.id} className={`service-option ${serviceId === sv.id ? "active" : ""}`} onClick={() => { setServiceId(sv.id); setSlot(null); setStep(1); }}>
            <div><strong>{sv.name}</strong><span>{formatDuration(sv.durationMin)}{sv.description ? ` · ${sv.description}` : ""}</span></div><b>{formatMoney(sv.priceCents)}</b>
          </button>)}
        </div>
      </>}

      {step === 1 && service && <>
        <h2>Escolha data e horário</h2><p className="booking-sub">{service.name} · {formatDuration(service.durationMin)}</p>
        {s.professionals.length > 1 && <label>Profissional<select value={professionalId} onChange={e => { setProfessionalId(e.target.value); setSlot(null); }}><option value="">Sem preferência</option>{s.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <div className="date-strip">{days.map(d => <button key={d} className={d === date ? "active" : ""} onClick={() => { setDate(d); setSlot(null); }}><span>{formatWeekday(dateKeyToNoon(d))}</span><strong>{formatDay(dateKeyToNoon(d))}</strong></button>)}</div>
        <p className="booking-sub">{formatLongDate(dateKeyToNoon(date))}</p>
        {slots.isLoading ? <Loading /> : slots.data?.length ? <div className="slot-grid">{slots.data.map(sl => <button key={sl.startsAt + sl.professionalId} className={slot?.startsAt === sl.startsAt && slot.professionalId === sl.professionalId ? "active" : ""} onClick={() => setSlot(sl)}>{formatTime(sl.startsAt)}</button>)}</div>
          : <div className="slot-empty">Nenhum horário livre neste dia. Tente outra data.</div>}
        <div className="booking-actions"><button className="secondary-button" onClick={() => setStep(0)}>Voltar</button><button className="primary-button" disabled={!slot} onClick={() => setStep(2)}>Continuar <Icon name="arrow" size={16} /></button></div>
      </>}

      {step === 2 && service && slot && <form onSubmit={submit}>
        <h2>Seus dados</h2><p className="booking-sub">Usamos seu WhatsApp apenas para confirmar o horário.</p>
        <div className="booking-summary">
          <div><span>Serviço</span><strong>{service.name}</strong></div>
          <div><span>Data</span><strong>{formatFullDate(slot.startsAt)}</strong></div>
          <div><span>Horário</span><strong>{formatTime(slot.startsAt)}</strong></div>
          <div><span>Valor</span><strong>{formatMoney(service.priceCents)}</strong></div>
        </div>
        <FormError message={error} />
        <label>Nome completo<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
        <label>WhatsApp<input required inputMode="tel" autoComplete="tel" pattern="\(\d{2}\) \d{4,5}-\d{4}" title="Informe DDD + número" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" /></label>
        <label>Forma de pagamento (no studio)<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>{s.paymentMethods.map(p => <option key={p} value={p}>{paymentLabel[p]}</option>)}</select></label>
        <div className="hp-field" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
        <label className="checkbox-line"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /> Autorizo o uso dos meus dados para contato sobre este agendamento (LGPD).</label>
        <div className="booking-actions"><button type="button" className="secondary-button" onClick={() => setStep(1)}>Voltar</button><button className="primary-button" disabled={sending}>{sending ? "Enviando..." : "Confirmar agendamento"}</button></div>
      </form>}

      {step === 3 && booked && <div className="success-message">
        <div><Icon name="check" size={30} /></div>
        <h3>{booked.status === "CONFIRMED" ? "Agendamento confirmado!" : "Pedido recebido!"}</h3>
        <p>{booked.serviceName} em {formatFullDate(booked.startsAt)} às {formatTime(booked.startsAt)}.{booked.status === "PENDING" ? " O studio vai confirmar pelo WhatsApp." : ""}</p>
        <p><Link to={`/agendamento/${booked.token}`}>Ver ou cancelar meu agendamento</Link></p>
        <p className="form-hint">Salve este link. Cancelamentos até {s.cancellationHours}h antes.</p>
      </div>}
    </div>
    <div className="booking-footer">{s.address}{s.phone ? ` · ${s.phone}` : ""}</div>
  </div>;
}
