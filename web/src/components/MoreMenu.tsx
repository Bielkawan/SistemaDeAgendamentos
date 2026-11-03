import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface MenuItem { label: string; danger?: boolean; onClick?: () => void }

export function MoreMenu({ items, label = "Mais opções" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const confirmedItem = items.find(item => item.label === confirming);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setConfirming(null); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return <div className="more-menu" ref={ref}>
    <button className="dots-button" aria-label={label} aria-expanded={open} onClick={() => { setOpen(v => !v); setConfirming(null); }}><Icon name="dots" /></button>
    {open && <div className="more-dropdown">
      {confirming ? <div className="inline-confirm">
        <strong>Confirmar ação?</strong>
        <span>Essa alteração pode não ser reversível.</span>
        <div><button onClick={() => setConfirming(null)}>Voltar</button><button className="danger" onClick={() => { setOpen(false); setConfirming(null); confirmedItem?.onClick?.(); }}>Confirmar</button></div>
      </div> : items.map(item => <button key={item.label} className={item.danger ? "danger" : ""} onClick={() => item.danger ? setConfirming(item.label) : (setOpen(false), item.onClick?.())}>{item.label}</button>)}
    </div>}
  </div>;
}
