import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../../api/client";
import { crud, useApiMutation, useProducts, useStockSummary } from "../../api/hooks";
import type { Product } from "../../api/types";
import { Icon } from "../../components/Icon";
import { FormError, Loading, Modal } from "../../components/Modal";
import { MoreMenu } from "../../components/MoreMenu";
import { formatMoney, parseMoneyToCents } from "../../lib/format";
import { Cell, DataTable, FilterSelect, ModuleShell, SearchInput } from "../ModuleShell";

const productsApi = crud<Product>("/admin/products");
const levelLabel = { CRITICAL: "Crítico", LOW: "Baixo", OK: "Normal" };

function ProductModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "Unhas");
  const [unit, setUnit] = useState(product?.unit ?? "un.");
  const [quantity, setQuantity] = useState(String(product?.quantity ?? 0));
  const [min, setMin] = useState(String(product?.minQuantity ?? 1));
  const [cost, setCost] = useState(product ? (product.costCents / 100).toFixed(2).replace(".", ",") : "");
  const [error, setError] = useState<string | null>(null);
  const m = useApiMutation((body: Record<string, unknown>) => product ? productsApi.update({ id: product.id, ...body }) : productsApi.create(body), [["products"]]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const costCents = cost ? parseMoneyToCents(cost) : 0;
    if (!Number.isFinite(costCents) || costCents < 0) { setError("Custo inválido."); return; }
    const body: Record<string, unknown> = { name: name.trim(), category: category.trim(), unit: unit.trim(), minQuantity: Number(min), costCents };
    if (!product) body.quantity = Number(quantity);
    try { await m.mutateAsync(body); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return <Modal eyebrow="ESTOQUE" title={product ? "Editar produto" : "Novo produto"} description="Cadastre o item e o nível mínimo para alertas." onClose={onClose}>
    <form onSubmit={submit}>
      <FormError message={error} />
      <label>Produto<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Base em gel Crystal" /></label>
      <div className="form-row"><label>Categoria<input required maxLength={60} value={category} onChange={e => setCategory(e.target.value)} /></label><label>Unidade<input required maxLength={10} value={unit} onChange={e => setUnit(e.target.value)} /></label></div>
      <div className="form-row">
        {!product && <label>Quantidade inicial<input required type="number" min={0} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>}
        <label>Estoque mínimo<input required type="number" min={0} value={min} onChange={e => setMin(e.target.value)} /></label>
      </div>
      <label>Custo unitário (R$)<input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="0,00" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={m.isPending}>Salvar produto</button></div>
    </form>
  </Modal>;
}

function MovementModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useApiMutation((body: Record<string, unknown>) => api(`/admin/products/${product.id}/movements`, { method: "POST", body }), [["products"]]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await m.mutateAsync({ type, quantity: Number(qty), reason: reason.trim() || null }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return <Modal eyebrow="MOVIMENTAÇÃO" title={product.name} description={`Saldo atual: ${product.quantity} ${product.unit}`} onClose={onClose}>
    <form onSubmit={submit}>
      <FormError message={error} />
      <label>Tipo<select value={type} onChange={e => setType(e.target.value as "IN" | "OUT")}><option value="IN">Entrada (compra/reposição)</option><option value="OUT">Saída (uso/perda)</option></select></label>
      <label>Quantidade<input required type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></label>
      <label>Motivo<input maxLength={200} value={reason} onChange={e => setReason(e.target.value)} placeholder="Opcional" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={m.isPending}>Registrar</button></div>
    </form>
  </Modal>;
}

export function StockPage() {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [modal, setModal] = useState<{ product?: Product; movement?: boolean } | null>(null);
  const { data, isLoading } = useProducts({ q: q.trim() || undefined, level: level || undefined });
  const summary = useStockSummary().data;
  const remove = useApiMutation(productsApi.remove, [["products"]]);
  const alerts = (summary?.criticalCount ?? 0) + (summary?.lowCount ?? 0);
  return <ModuleShell title="Estoque" description="Acompanhe produtos, entradas, saídas e níveis críticos." action={{ label: "Novo produto", onClick: () => setModal({}) }}
    summary={summary && <div className="stock-summary">
      <div className="panel stock-alert">
        <div className="panel-heading compact"><div><h2>Estoque baixo</h2><p>{alerts} produto(s) precisam de reposição</p></div><div className="stat-icon rose"><Icon name="box" /></div></div>
        <div className="stock-progress"><div><span>Itens em nível crítico</span><strong>{summary.criticalCount} de {summary.totalProducts} produtos</strong></div><i><b style={{ width: `${summary.totalProducts ? summary.criticalCount / summary.totalProducts * 100 : 0}%` }} /></i></div>
      </div>
      <div className="panel stock-summary-card"><span>Valor em estoque</span><strong>{formatMoney(summary.stockValueCents)}</strong><small>{summary.totalProducts} produtos cadastrados</small></div>
      <div className="panel stock-summary-card"><span>Movimentações no mês</span><strong>{summary.movementsMonth.in + summary.movementsMonth.out}</strong><small>{summary.movementsMonth.out} saídas e {summary.movementsMonth.in} entradas</small></div>
    </div>}
    tools={<><SearchInput value={q} onChange={setQ} placeholder="Buscar em estoque..." /><FilterSelect value={level} onChange={setLevel} options={[["", "Todos os produtos"], ["CRITICAL", "Crítico"], ["LOW", "Baixo"], ["OK", "Normal"]]} /></>}>
    {isLoading ? <Loading /> : <DataTable columns={["Produto", "Categoria", "Quantidade", "Mínimo", "Situação"]} empty={!data?.length}>
      {data?.map(p => <tr key={p.id}>
        <Cell label="Produto">{p.name}</Cell><Cell label="Categoria">{p.category}</Cell><Cell label="Quantidade">{p.quantity} {p.unit}</Cell><Cell label="Mínimo">{p.minQuantity} {p.unit}</Cell><Cell label="Situação" status>{levelLabel[p.level]}</Cell>
        <td className="table-actions" data-label="Ações"><MoreMenu label={`Opções de ${p.name}`} items={[
          { label: "Entrada / saída", onClick: () => setModal({ product: p, movement: true }) },
          { label: "Editar", onClick: () => setModal({ product: p }) },
          { label: "Excluir", danger: true, onClick: () => remove.mutateAsync(p.id).catch(err => alert(errorMessage(err))) },
        ]} /></td>
      </tr>)}
    </DataTable>}
    {modal?.movement && modal.product ? <MovementModal product={modal.product} onClose={() => setModal(null)} /> : modal && <ProductModal product={modal.product} onClose={() => setModal(null)} />}
  </ModuleShell>;
}
