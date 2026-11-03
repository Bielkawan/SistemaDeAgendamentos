import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({ eyebrow, title, description, onClose, children, className = "" }: { eyebrow: string; title: string; description?: string; onClose: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
      <div className="modal-head">
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
      </div>
      {children}
    </div>
  </div>;
}

export function SuccessMessage({ icon, title, text }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; text: string }) {
  return <div className="success-message"><div><Icon name={icon} size={30} /></div><h3>{title}</h3><p>{text}</p></div>;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="form-error" role="alert">{message}</div>;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{text}</span></div>;
}

export function Loading() {
  return <div className="loading-state" aria-busy="true"><span className="spinner" /></div>;
}
