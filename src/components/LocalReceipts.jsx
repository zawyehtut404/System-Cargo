import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Search, Trash2 } from "lucide-react";
import { deleteLocalReceipt, readLocalReceipts } from "../lib/localReceipts.js";

export default function LocalReceipts({ onLoadReceipt }) {
  const [receipts, setReceipts] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    try {
      setReceipts(readLocalReceipts().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to read the local receipt archive.");
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("cargo-local-receipts-updated", refresh);
    return () => window.removeEventListener("cargo-local-receipts-updated", refresh);
  }, [refresh]);

  const filtered = useMemo(() => receipts.filter(({ id, form }) => [
    id, form?.senderName, form?.receiverName, form?.routeFrom, form?.routeTo
  ].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [receipts, query]);

  const removeReceipt = (id) => {
    if (!window.confirm(`Delete local receipt ${id}? This does not delete a Supabase cargo record.`)) return;
    try {
      deleteLocalReceipt(id);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete the local receipt.");
    }
  };

  return <section className="panel archive-panel">
    <div className="panel-title">
      <div><h3>Local receipts</h3><p className="panel-subtitle">Drafts are kept together in this browser and are not shared with other devices.</p></div>
      <label className="archive-search"><Search size={15}/><input aria-label="Search local receipts" placeholder="Search number or customer" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    </div>
    {error && <p className="form-error">{error}</p>}
    {filtered.length === 0 ? <p className="notice">{receipts.length ? "No local receipts match that search." : "Receipts you edit are saved here automatically."}</p> : <div className="archive-list">
      {filtered.map(({ id, form, updatedAt, shipmentId, trackingCode }) => <article className="archive-item" key={id}>
        <div className="archive-item-icon"><FileText size={17}/></div>
        <div className="archive-item-content">
          <strong>{form?.tracking || id}</strong>
          <span>{form?.senderName || "—"} → {form?.receiverName || "—"}</span>
          <small>{form?.routeFrom || "Origin"} → {form?.routeTo || "Destination"} · {shipmentId ? "Synced cargo" : "Local draft"} · Saved {new Date(updatedAt).toLocaleString()}</small>
        </div>
        <div className="archive-actions">
          <button className="btn secondary" onClick={() => onLoadReceipt(form, id, shipmentId, trackingCode)}>Load</button>
          <button className="btn danger" aria-label={`Delete ${form?.tracking || id}`} onClick={() => removeReceipt(id)}><Trash2 size={14}/> Delete</button>
        </div>
      </article>)}
    </div>}
  </section>;
}
