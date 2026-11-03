import { useState, type FormEvent } from "react";
import { crud, useApiMutation, useServices } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import type { Service } from "../../api/types";
import { FormError, Loading, Modal } from "../../components/Modal";
import { MoreMenu } from "../../components/MoreMenu";
import { formatDuration, formatMoney, parseMoneyToCents } from "../../lib/format";
import { Cell, DataTable, ModuleShell, SearchInput } from "../ModuleShell";

const servicesApi = crud<Service>("/admin/services");

function ServiceModal({ service, onClose }: { service?: Service; onClose: () => void }) {
  const [name, setName] = useState(service?.name ?? "");
  const [category, setCategory] = useState(service?.category ?? "Unhas");
  const [duration, setDuration] = useState(String(service?.durationMin ?? 60));
  const [buffer, setBuffer] = useState(String(service?.bufferMin ?? 0));
  const [price, setPrice] = useState(service ? (service.priceCents / 100).toFixed(2).replace(".", ",") : "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [active, setActive] = useState(service?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const m = useApiMutation((body: Record<string, unknown>) => service ? servicesApi.update({ id: service.id, ...body }) : servicesApi.create(body), [["services"]]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const priceCents = parseMoneyToCents(price);
    if (!Number.isFinite(priceCents) || priceCents < 0) { setError("Valor inválido."); return; }
    try { await m.mutateAsync({ name: name.trim(), category: category.trim(), durationMin: Number(duration), bufferMin: Number(buffer), priceCents, description: description.trim() || null, active }); onClose(); }
    catch (err) { setError(errorMessage(err)); }
  }
  return <Modal eyebrow="CATÁLOGO" title={service ? "Editar serviço" : "Novo serviço"} description="Defina duração e valor exibidos na agenda." onClose={onClose}>
    <form onSubmit={submit}>
      <FormError message={error} />
      <label>Nome do serviço<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Alongamento em gel" /></label>
      <label>Categoria<input required maxLength={60} value={category} onChange={e => setCategory(e.target.value)} list="service-categories" /></label>
      <datalist id="service-categories"><option value="Unhas" /><option value="Sobrancelhas" /><option value="Cílios" /></datalist>
      <div className="form-row">
        <label>Duração (min)<input required type="number" min={5} max={600} step={5} value={duration} onChange={e => setDuration(e.target.value)} /></label>
        <label>Valor (R$)<input required inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" /></label>
      </div>
      <label>Intervalo após o atendimento (min)<input type="number" min={0} max={120} step={5} value={buffer} onChange={e => setBuffer(e.target.value)} /></label>
      <span className="form-hint">Tempo de limpeza/preparo bloqueado na agenda depois do serviço.</span>
      <label>Descrição<input maxLength={300} value={description} onChange={e => setDescription(e.target.value)} placeholder="Aparece na página de agendamento" /></label>
      <label className="checkbox-line"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Disponível para agendamento</label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={m.isPending}>Salvar serviço</button></div>
    </form>
  </Modal>;
}

export function ServicesPage() {
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{ service?: Service } | null>(null);
  const { data, isLoading } = useServices();
  const update = useApiMutation(servicesApi.update, [["services"]]);
  const remove = useApiMutation(servicesApi.remove, [["services"]]);
  const list = (data ?? []).filter(s => `${s.name} ${s.category}`.toLowerCase().includes(q.toLowerCase()));
  return <ModuleShell title="Serviços" description="Organize seu catálogo, duração e valores." action={{ label: "Novo serviço", onClick: () => setModal({}) }} tools={<SearchInput value={q} onChange={setQ} placeholder="Buscar em serviços..." />}>
    {isLoading ? <Loading /> : <DataTable columns={["Serviço", "Categoria", "Duração", "Valor", "Status"]} empty={!list.length}>
      {list.map(s => <tr key={s.id}>
        <Cell label="Serviço">{s.name}</Cell><Cell label="Categoria">{s.category}</Cell><Cell label="Duração">{formatDuration(s.durationMin)}</Cell><Cell label="Valor">{formatMoney(s.priceCents)}</Cell><Cell label="Status" status>{s.active ? "Ativo" : "Inativo"}</Cell>
        <td className="table-actions" data-label="Ações"><MoreMenu label={`Opções de ${s.name}`} items={[
          { label: "Editar", onClick: () => setModal({ service: s }) },
          { label: s.active ? "Desativar" : "Ativar", onClick: () => update.mutateAsync({ id: s.id, active: !s.active }).catch(err => alert(errorMessage(err))) },
          { label: "Excluir", danger: true, onClick: () => remove.mutateAsync(s.id).catch(err => alert(errorMessage(err))) },
        ]} /></td>
      </tr>)}
    </DataTable>}
    {modal && <ServiceModal service={modal.service} onClose={() => setModal(null)} />}
  </ModuleShell>;
}
