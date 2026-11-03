import type { ReactNode } from "react";
import { Icon } from "../components/Icon";

export function ModuleShell({ title, description, action, summary, tools, children }: { title: string; description: string; action?: { label: string; onClick: () => void }; summary?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  return <section className="module-page">
    <div className="module-title">
      <div><span className="eyebrow">GESTÃO DO STUDIO</span><h1>{title}</h1><p>{description}</p></div>
      {action && <button className="primary-button" onClick={action.onClick}><Icon name="plus" /> {action.label}</button>}
    </div>
    {summary}
    {tools && <div className="module-tools">{tools}</div>}
    {children}
  </section>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="inline-search"><Icon name="search" /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <select className="filter-select" value={value} onChange={e => onChange(e.target.value)} aria-label="Filtro">
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>;
}

export function DataTable({ columns, children, empty }: { columns: string[]; children: ReactNode; empty?: boolean }) {
  return <div className="panel data-panel">
    <table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}<th /></tr></thead><tbody>{children}</tbody></table>
    {empty && <div className="empty-state"><strong>Nenhum registro encontrado</strong><span>Ajuste a busca ou cadastre um novo item.</span></div>}
  </div>;
}

export function Cell({ label, children, status }: { label: string; children: ReactNode; status?: boolean }) {
  return <td data-label={label}><span className={status ? "table-status" : ""}>{children}</span></td>;
}
