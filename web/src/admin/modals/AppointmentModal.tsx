import { useMemo, useState, type FormEvent } from "react";
import { appointmentsApi, useAdminSlots, useApiMutation, useClients, useProfessionals, useServices } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import type { Appointment, PaymentMethod } from "../../api/types";
import { Icon } from "../../components/Icon";
import { FormError, Modal, SuccessMessage } from "../../components/Modal";
import { formatDate, formatMoney, formatPhone, formatTime, isoToLocalParts, localToISO, maskPhone, paymentLabel, todayISO, whatsappLink } from "../../lib/format";

export function AppointmentModal({ appointment, onClose }: { appointment?: Appointment; onClose: () => void }) {
  const editing = !!appointment;
  const initial = appointment ? isoToLocalParts(appointment.startsAt) : { date: todayISO(), time: "" };
  const [clientName, setClientName] = useState(appointment?.client.name ?? "");
  const [phone, setPhone] = useState(appointment ? formatPhone(appointment.client.phone) : "");
  const [serviceId, setServiceId] = useState(appointment?.service.id ?? "");
  const [professionalId, setProfessionalId] = useState(appointment?.professional.id ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [manualTime, setManualTime] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(appointment?.paymentMethod ?? "PIX");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [sendWhatsApp, setSendWhatsApp] = useState(!editing);
  const [saved, setSaved] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const services = useServices();
  const professionals = useProfessionals();
  const clients = useClients({ q: clientName.trim().length >= 3 ? clientName.trim() : undefined });
  const slots = useAdminSlots({ serviceId, date, professionalId: professionalId || undefined, excludeAppointmentId: appointment?.id });

  const match = useMemo(() => clients.data?.items.find(c => c.name.toLocaleLowerCase("pt-BR") === clientName.trim().toLocaleLowerCase("pt-BR")), [clients.data, clientName]);
  const isNewClient = !editing && clientName.trim().length > 2 && !match;
  const activeServices = services.data?.filter(s => s.active || s.id === serviceId) ?? [];
  const selectedService = activeServices.find(s => s.id === serviceId);

  const mutation = useApiMutation((body: Record<string, unknown>) => editing ? appointmentsApi.update({ id: appointment!.id, ...body }) : appointmentsApi.create(body), [["appointments"], ["clients"], ["slots"]]);

  function handleClientName(value: string) {
    setClientName(value);
    const existing = clients.data?.items.find(c => c.name.toLocaleLowerCase("pt-BR") === value.trim().toLocaleLowerCase("pt-BR"));
    if (existing) setPhone(formatPhone(existing.phone));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!time) { setError("Escolha um horário."); return; }
    const slot = slots.data?.find(s => isoToLocalParts(s.startsAt).time === time);
    const body: Record<string, unknown> = {
      serviceId,
      professionalId: professionalId || slot?.professionalId || undefined,
      startsAt: localToISO(date, time),
      paymentMethod,
      notes: notes.trim() || null,
    };
    if (!editing) body.client = { name: clientName.trim(), phone: phone.replace(/\D/g, "") };
    try {
      const result = await mutation.mutateAsync(body);
      if (sendWhatsApp) {
        const text = `Olá, ${result.client.name}! Seu agendamento no NR Studio está confirmado para o dia ${formatDate(result.startsAt)}, às ${formatTime(result.startsAt)}. Serviço: ${result.serviceName}. Se precisar alterar o horário, fale com a gente por aqui.`;
        window.open(whatsappLink(result.client.phone, text), "_blank", "noopener,noreferrer");
      }
      setSaved(result);
      setTimeout(onClose, 1300);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return <Modal eyebrow="AGENDA" title={editing ? "Editar agendamento" : "Novo agendamento"} description={editing ? "Altere data, horário ou serviço do atendimento." : "Preencha os dados do próximo atendimento."} onClose={onClose}>
    {saved ? <SuccessMessage icon="calendar" title={editing ? "Agendamento atualizado" : "Agendamento criado"} text={isNewClient ? "A nova cliente também foi cadastrada automaticamente." : "O horário foi salvo na sua agenda."} /> :
    <form onSubmit={submit}>
      <FormError message={error} />
      <label>Cliente<input required minLength={2} maxLength={120} disabled={editing} value={clientName} onChange={e => handleClientName(e.target.value)} placeholder="Nome da cliente" list="client-options" autoComplete="off" /></label>
      <datalist id="client-options">{clients.data?.items.map(c => <option key={c.id} value={c.name} />)}</datalist>
      {isNewClient && <div className="auto-register-note"><div><Icon name="users" size={17} /></div><span><strong>Nova cliente identificada</strong>Ela será cadastrada automaticamente ao confirmar.</span></div>}
      <label>WhatsApp da cliente<input required disabled={editing} inputMode="tel" pattern="\(\d{2}\) \d{4,5}-\d{4}" title="Informe DDD + número" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" /></label>
      <label>Serviço<select required value={serviceId} onChange={e => { setServiceId(e.target.value); setTime(""); }}>
        <option value="" disabled>Selecione o serviço</option>
        {activeServices.map(s => <option key={s.id} value={s.id}>{s.name} · {formatMoney(s.priceCents)}</option>)}
      </select></label>
      {(professionals.data?.length ?? 0) > 1 && <label>Profissional<select value={professionalId} onChange={e => { setProfessionalId(e.target.value); setTime(""); }}>
        <option value="">Qualquer profissional disponível</option>
        {professionals.data?.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>}
      <div className="form-row">
        <label>Data<input required type="date" value={date} onChange={e => { setDate(e.target.value); setTime(""); }} /></label>
        <label>Horário{manualTime || !selectedService
          ? <input required type="time" step={300} value={time} onChange={e => setTime(e.target.value)} />
          : <select required value={time} onChange={e => setTime(e.target.value)}>
            <option value="" disabled>{slots.isLoading ? "Carregando..." : slots.data?.length ? "Selecione" : "Sem horários livres"}</option>
            {slots.data?.map(s => { const t = isoToLocalParts(s.startsAt).time; return <option key={s.startsAt + s.professionalId} value={t}>{t}</option>; })}
          </select>}
        </label>
      </div>
      {selectedService && <button type="button" className="text-button form-hint" onClick={() => setManualTime(v => !v)}>{manualTime ? "Escolher entre horários livres" : "Digitar horário manualmente (encaixe)"}</button>}
      <label>Forma de pagamento<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
        {(Object.keys(paymentLabel) as PaymentMethod[]).map(p => <option key={p} value={p}>{paymentLabel[p]}</option>)}
      </select></label>
      <label>Observações<input maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" /></label>
      <label className="whatsapp-confirmation">
        <input type="checkbox" checked={sendWhatsApp} onChange={e => setSendWhatsApp(e.target.checked)} />
        <span className="checkmark"><Icon name="whatsapp" size={17} /></span>
        <span><strong>Enviar confirmação pelo WhatsApp</strong><small>A mensagem será aberta pronta para envio ao confirmar.</small></span>
      </label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : editing ? "Salvar alterações" : "Confirmar agendamento"}</button></div>
    </form>}
  </Modal>;
}
