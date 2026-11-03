import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import logo from "../assets/logo.webp";
import { errorMessage } from "../api/client";
import { publicApi } from "../api/hooks";
import { FormError, Loading } from "../components/Modal";
import { formatFullDate, formatMoney, formatTime, statusLabel } from "../lib/format";

export function MyAppointmentPage() {
  const { token = "" } = useParams();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["public", "appointment", token], queryFn: () => publicApi.get(token), retry: false });
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  async function cancel() {
    if (!confirm("Deseja mesmo cancelar este agendamento?")) return;
    setCancelling(true); setError(null);
    try { qc.setQueryData(["public", "appointment", token], await publicApi.cancel(token)); } catch (err) { setError(errorMessage(err)); } finally { setCancelling(false); }
  }
  if (isLoading) return <Loading />;
  return <div className="booking-page">
    <div className="booking-hero"><img src={logo} alt="" /><h1>Meu agendamento</h1><p>NR STUDIO</p></div>
    <div className="booking-card">
      {isError || !data ? <><h2>Agendamento não encontrado</h2><p className="booking-sub">Verifique o link recebido.</p></> : <>
        <h2>Olá, {data.clientName.split(" ")[0]}</h2><p className="booking-sub">Status: <strong>{statusLabel[data.status]}</strong></p>
        <div className="booking-summary">
          <div><span>Serviço</span><strong>{data.serviceName}</strong></div>
          <div><span>Data</span><strong>{formatFullDate(data.startsAt)}</strong></div>
          <div><span>Horário</span><strong>{formatTime(data.startsAt)} – {formatTime(data.endsAt)}</strong></div>
          <div><span>Profissional</span><strong>{data.professionalName}</strong></div>
          <div><span>Valor</span><strong>{formatMoney(data.priceCents)}</strong></div>
        </div>
        <FormError message={error} />
        <div className="booking-actions"><Link className="secondary-button" to="/agendar">Novo agendamento</Link>{data.canCancel && <button className="primary-button alert-button" disabled={cancelling} onClick={cancel}>Cancelar agendamento</button>}</div>
      </>}
    </div>
  </div>;
}
