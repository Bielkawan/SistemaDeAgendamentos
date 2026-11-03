import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface MenuItem { label: string; danger?: boolean; onClick?: () => void }

export function MoreMenu({ items, label = "Mais opções" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });
  const confirmedItem = items.find(item => item.label === confirming);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !dropRef.current?.contains(t)) { setOpen(false); setConfirming(null); } };
    const dismiss = () => { setOpen(false); setConfirming(null); };
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [open]);

  // Rendered in a fixed-position portal so table/panel overflow never clips it; flips up near the viewport bottom.
  useLayoutEffect(() => {
    if (!open || !ref.current || !dropRef.current) return;
    const b = ref.current.getBoundingClientRect();
    const h = dropRef.current.offsetHeight;
    const top = b.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, b.top - 6 - h) : b.bottom + 6;
    setPos({ position: "fixed", top, right: Math.max(8, window.innerWidth - b.right), left: "auto", bottom: "auto", zIndex: 1000 });
  }, [open, confirming]);

  return <div className="more-menu" ref={ref}>
    <button className="dots-button" aria-label={label} aria-expanded={open} onClick={() => { setPos({ visibility: "hidden" }); setOpen(v => !v); setConfirming(null); }}><Icon name="dots" /></button>
    {open && createPortal(<div className="more-dropdown" ref={dropRef} style={pos}>
      {confirming ? <div className="inline-confirm">
        <strong>Confirmar ação?</strong>
        <span>Essa alteração pode não ser reversível.</span>
        <div><button onClick={() => setConfirming(null)}>Voltar</button><button className="danger" onClick={() => { setOpen(false); setConfirming(null); confirmedItem?.onClick?.(); }}>Confirmar</button></div>
      </div> : items.map(item => <button key={item.label} className={item.danger ? "danger" : ""} onClick={() => item.danger ? setConfirming(item.label) : (setOpen(false), item.onClick?.())}>{item.label}</button>)}
    </div>, document.body)}
  </div>;
}
