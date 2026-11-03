import type { Product } from "../../api/types";
import { Icon } from "../../components/Icon";

export function LowStockModal({ products, onClose, onViewStock }: { products: Product[]; onClose: () => void; onViewStock: () => void }) {
  const missing = products.reduce((sum, p) => sum + Math.max(0, p.minQuantity - p.quantity), 0);
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal low-stock-modal" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
      <div className="modal-head">
        <div><span className="eyebrow alert-eyebrow">ATENÇÃO NECESSÁRIA</span><h2>Produtos com estoque baixo</h2><p>Faça a reposição para não interromper os atendimentos.</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar alerta"><Icon name="close" /></button>
      </div>
      <div className="critical-products">
        {products.map(p => <div className="critical-product" key={p.id}>
          <div className="critical-product-icon"><Icon name="box" /></div>
          <div><strong>{p.name}</strong><span>{p.category}</span></div>
          <div className="critical-quantity"><strong>{p.quantity} {p.unit}</strong><span>Mínimo: {p.minQuantity}</span></div>
        </div>)}
      </div>
      <div className="stock-warning"><span>Faltam</span><strong>{missing} unidades</strong><span>para atingir os níveis mínimos</span></div>
      <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button alert-button" onClick={onViewStock}>Ir para o estoque</button></div>
    </div>
  </div>;
}
