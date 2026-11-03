import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { crud, useApiMutation, useClients } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import type { Client } from "../../api/types";
import { FormError, Loading, Modal } from "../../components/Modal";
import { MoreMenu } from "../../components/MoreMenu";
import { formatDate, formatPhone, maskPhone, whatsappLink } from "../../lib/format";
import { Cell, DataTable, FilterSelect, ModuleShell, SearchInput } from "../ModuleShell";

const clientsApi = crud<Client>("/admin/clients");

function ClientModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const [name, setName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client ? formatPhone(client.phone) : "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const m = useApiMutation((body: Record<string, unknown>) => client ? clientsApi.update({ id: client.id, ...body }) : clientsApi.create(body), [["clients"]]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await m.mutateAsync({ name: name.trim(), phone: phone.replace(/\D/g, ""), email: email.trim() || null, notes: notes.trim() || null }); onClose(); }
    catch (err) { setError(errorMessage(err)); }
  }
  return <Modal eyebrow="CLIENTES" title={client ? "Editar cliente" : "Nova cliente"} onClose={onClose}>
    <form onSubmit={submit}>
      <FormError message={error} />
      <label>Nome<input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>WhatsApp<input required inputMode="tel" pattern="\(\d{2}\) \d{4,5}-\d{4}" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" /></label>
      <label>E-mail<input type="email" maxLength={160} value={email} onChange={e => setEmail(e.target.value)} placeholder="Opcional" /></label>
      <label>Observações<input maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Alergias, preferências..." /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={m.isPending}>Salvar</button></div>
    </form>
  </Modal>;
}

export function ClientsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const filter = params.get("filter") ?? "";
  const [modal, setModal] = useState<{ client?: Client } | null>(null);
  const { data, isLoading } = useClients({ q: q.trim() || undefined, filter: filter || undefined });
  const remove = useApiMutation(clientsApi.remove, [["clients"]]);
  return <ModuleShell title="Clientes" description="Cadastro, histórico e relacionamento com seus clientes." action={{ label: "Nova cliente", onClick: () => setModal({}) }}
    tools={<><SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou telefone..." /><FilterSelect value={filter} onChange={v => setParams(v ? { filter: v } : {})} options={[["", "Todas as clientes"], ["reactivate", "Para reativar"]]} /></>}>
    {isLoading ? <Loading /> : <DataTable columns={["Cliente", "Contato", "Última visita", "Total de visitas", "Situação"]} empty={!data?.items.length}>
      {data?.items.map(c => <tr key={c.id}>
        <Cell label="Cliente">{c.name}</Cell>
        <Cell label="Contato">{formatPhone(c.phone)}</Cell>
        <Cell label="Última visita">{c.lastVisitAt ? formatDate(c.lastVisitAt) : "—"}</Cell>
        <Cell label="Total de visitas">{c.visits}</Cell>
        <Cell label="Situação" status>{c.needsReactivation ? "Reativar" : "Ativa"}</Cell>
        <td className="table-actions" data-label="Ações"><MoreMenu label={`Opções de ${c.name}`} items={[
          { label: "Chamar no WhatsApp", onClick: () => window.open(whatsappLink(c.phone, `Olá, ${c.name.split(" ")[0]}!`), "_blank", "noopener,noreferrer") },
          { label: "Editar", onClick: () => setModal({ client: c }) },
          { label: "Excluir", danger: true, onClick: () => remove.mutateAsync(c.id).catch(err => alert(errorMessage(err))) },
        ]} /></td>
      </tr>)}
    </DataTable>}
    {modal && <ClientModal client={modal.client} onClose={() => setModal(null)} />}
  </ModuleShell>;
}
