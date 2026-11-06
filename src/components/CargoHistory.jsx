import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, RefreshCw } from "lucide-react";
import { recordPayment } from "../lib/cargo.js";
import { supabase } from "../lib/supabase.js";

const statusOptions = [
  ["booked", "Received"],
  ["in_transit", "In transit"],
  ["arrived", "Arrived"],
  ["ready_for_pickup", "Ready for pickup"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"]
];

const paymentLabels = { unpaid: "Unpaid", partial: "Partially paid", paid: "Paid" };

function formatMoney(value, currency) {
  return `${Number(value || 0).toLocaleString()} ${currency || "MMK"}`;
}

export default function CargoHistory({ userId, onLoadReceipt }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [payment, setPayment] = useState({ amount: "", method: "Cash", paidBy: "Sender", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: requestError } = await supabase
        .from("cargo_shipments")
        .select("id, receipt_no, tracking_code, cargo_status, payment_status, amount_paid, total_local, local_currency, created_at, receipt_data, sender:customers!cargo_shipments_sender_id_fkey(full_name), receiver:customers!cargo_shipments_receiver_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (requestError) {
        setError(requestError.message);
        setShipments([]);
      } else {
        setShipments(data || []);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load cargo history.");
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredShipments = shipments.filter((shipment) => {
    const searchText = [
      shipment.receipt_no,
      shipment.sender?.full_name,
      shipment.receiver?.full_name
    ].join(" ").toLowerCase();
    return searchText.includes(query.trim().toLowerCase());
  });

  const changeStatus = async (shipment, cargoStatus) => {
    setSavingId(shipment.id);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("cargo_shipments")
        .update({ cargo_status: cargoStatus })
        .eq("id", shipment.id);
      if (updateError) setError(updateError.message);
      else await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update shipment status.");
    } finally {
      setSavingId("");
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    setSavingId(paymentTarget.id);
    setError("");
    try {
      await recordPayment({
        shipmentId: paymentTarget.id,
        amount,
        currency: paymentTarget.local_currency,
        method: payment.method,
        paidBy: payment.paidBy,
        note: payment.note,
        userId
      });
      setPaymentTarget(null);
      setPayment({ amount: "", method: "Cash", paidBy: "Sender", note: "" });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to record payment.");
    } finally {
      setSavingId("");
    }
  };

  const copyTrackingLink = async (trackingCode) => {
    const url = `${window.location.origin}/?track=${encodeURIComponent(trackingCode)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch (clipboardError) {
      setError(clipboardError instanceof Error ? `Could not copy tracking link: ${clipboardError.message}` : "Could not copy tracking link.");
    }
  };

  return <section className="panel history-panel">
    <div className="panel-title">
      <div><h3>Cargo history</h3><p className="panel-subtitle">Showing the latest 100 shipments.</p></div>
      <div className="history-tools">
        <input aria-label="Search cargo history" placeholder="Search receipt or customer" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="btn secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>
    </div>
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="notice">Loading shipments…</p> : shipments.length === 0 ? <p className="notice">No cargo records yet. Save a receipt to add the first shipment.</p> : filteredShipments.length === 0 ? <p className="notice">No shipments match that search.</p> : <div className="table-scroll">
      <table className="history-table">
        <thead><tr><th>Receipt</th><th>Sender / Receiver</th><th>Route status</th><th>Payment</th><th>Actions</th></tr></thead>
        <tbody>{filteredShipments.map((shipment) => <tr key={shipment.id}>
          <td><strong>{shipment.receipt_no}</strong><small>{new Date(shipment.created_at).toLocaleString()}</small></td>
          <td>{shipment.sender?.full_name || "—"}<small>To: {shipment.receiver?.full_name || "—"}</small></td>
          <td>
            <select aria-label={`Status for ${shipment.receipt_no}`} value={shipment.cargo_status} disabled={savingId === shipment.id} onChange={(event) => changeStatus(shipment, event.target.value)}>
              {statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </td>
          <td><strong>{paymentLabels[shipment.payment_status] || shipment.payment_status}</strong><small>{formatMoney(shipment.amount_paid, shipment.local_currency)} / {formatMoney(shipment.total_local, shipment.local_currency)}</small></td>
          <td><div className="history-actions">
            <button className="text-btn" onClick={() => onLoadReceipt(shipment)}><FileText size={14} /> Load</button>
            <button className="text-btn" onClick={() => { setPaymentTarget(shipment); setPayment({ amount: "", method: "Cash", paidBy: "Sender", note: "" }); }} disabled={shipment.payment_status === "paid"}>Add payment</button>
            <button className="text-btn" onClick={() => copyTrackingLink(shipment.tracking_code)}><ExternalLink size={14} /> Tracking link</button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {paymentTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentTarget(null); }}>
      <form className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title" onSubmit={submitPayment}>
        <h3 id="payment-title">Record payment</h3>
        <p>{paymentTarget.receipt_no} · Outstanding {formatMoney(paymentTarget.total_local - paymentTarget.amount_paid, paymentTarget.local_currency)}</p>
        <label className="field"><span>Amount ({paymentTarget.local_currency})</span><input type="number" min="0.01" step="0.01" required value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></label>
        <label className="field"><span>Payment method</span><input required value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} /></label>
        <label className="field"><span>Paid by</span><select value={payment.paidBy} onChange={(event) => setPayment({ ...payment, paidBy: event.target.value })}><option>Sender</option><option>Receiver</option><option>Agent</option><option>Company</option></select></label>
        <label className="field"><span>Note (optional)</span><input value={payment.note} onChange={(event) => setPayment({ ...payment, note: event.target.value })} /></label>
        <div className="dialog-actions"><button type="button" className="btn secondary" onClick={() => setPaymentTarget(null)}>Cancel</button><button type="submit" className="btn primary" disabled={savingId === paymentTarget.id}>{savingId === paymentTarget.id ? "Saving…" : "Save payment"}</button></div>
      </form>
    </div>}
  </section>;
}
