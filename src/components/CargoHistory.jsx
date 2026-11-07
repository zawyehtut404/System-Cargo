import React, { useCallback, useEffect, useState } from "react";
import { Clipboard, ExternalLink, Eye, FileText, RefreshCw, X } from "lucide-react";
import { recordPayment } from "../lib/cargo.js";
import { publicTrackingUrl } from "../lib/tracking.js";
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

function ActionButtons({ shipment, onDetails, onLoad, onPayment, onCopy }) {
  return <div className="history-actions">
    <button className="text-btn" onClick={() => onDetails(shipment)}><Eye size={14}/> Details</button>
    <button className="text-btn" onClick={() => onLoad(shipment)}><FileText size={14}/> Load</button>
    <button className="text-btn" onClick={() => onPayment(shipment)} disabled={shipment.payment_status === "paid"}>Add payment</button>
    <a className="text-btn" href={publicTrackingUrl(shipment.receipt_no)} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open tracking</a>
    <button className="text-btn" onClick={() => onCopy(shipment.receipt_no)}><Clipboard size={14}/> Copy link</button>
  </div>;
}

function DetailRows({ title, rows }) {
  return <section className="detail-section">
    <h4>{title}</h4>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
  </section>;
}

export default function CargoHistory({ userId, onLoadReceipt }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [detailsData, setDetailsData] = useState({ payments: [], history: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [payment, setPayment] = useState({ amount: "", method: "Cash", paidBy: "Sender", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: requestError } = await supabase
        .from("cargo_shipments")
        .select("id, receipt_no, tracking_code, cargo_status, payment_status, amount_paid, fee_subtotal, exchange_rate, total_local, local_currency, created_at, updated_at, route_from, route_to, box_size, weight_kg, item_description, receipt_data, sender:customers!cargo_shipments_sender_id_fkey(full_name, phone, address), receiver:customers!cargo_shipments_receiver_id_fkey(full_name, phone, address), creator:profiles!cargo_shipments_created_by_fkey(id, full_name, email, role)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (requestError) throw new Error(requestError.message);
      setShipments(data || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load cargo history.");
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredShipments = shipments.filter((shipment) => [
    shipment.receipt_no,
    shipment.sender?.full_name,
    shipment.receiver?.full_name,
    shipment.creator?.full_name,
    shipment.creator?.email
  ].join(" ").toLowerCase().includes(query.trim().toLowerCase()));

  const changeStatus = async (shipment, cargoStatus) => {
    setSavingId(shipment.id);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("cargo_shipments")
        .update({ cargo_status: cargoStatus })
        .eq("id", shipment.id);
      if (updateError) throw new Error(updateError.message);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update shipment status.");
    } finally {
      setSavingId("");
    }
  };

  const openDetails = async (shipment) => {
    setDetailsTarget(shipment);
    setDetailsData({ payments: [], history: [] });
    setDetailsLoading(true);
    setError("");
    try {
      const [paymentsResult, historyResult] = await Promise.all([
        supabase.from("payments")
          .select("amount, currency, payment_method, paid_by, note, created_at, creator:profiles!payments_created_by_fkey(full_name)")
          .eq("shipment_id", shipment.id)
          .order("created_at", { ascending: false }),
        supabase.from("cargo_status_history")
          .select("status, created_at, actor:profiles!cargo_status_history_changed_by_fkey(full_name)")
          .eq("shipment_id", shipment.id)
          .order("created_at", { ascending: false })
      ]);
      if (paymentsResult.error) throw new Error(paymentsResult.error.message);
      if (historyResult.error) throw new Error(historyResult.error.message);
      setDetailsData({ payments: paymentsResult.data || [], history: historyResult.data || [] });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load shipment details.");
    } finally {
      setDetailsLoading(false);
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

  const copyTrackingLink = async (receiptNo) => {
    try {
      await navigator.clipboard.writeText(publicTrackingUrl(receiptNo));
      setNotice("Public tracking link copied.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (clipboardError) {
      setError(clipboardError instanceof Error ? `Could not copy tracking link: ${clipboardError.message}` : "Could not copy tracking link.");
    }
  };

  const paymentAction = (shipment) => {
    setPaymentTarget(shipment);
    setPayment({ amount: "", method: "Cash", paidBy: "Sender", note: "" });
  };

  const actions = (shipment) => <ActionButtons
    shipment={shipment}
    onDetails={openDetails}
    onLoad={onLoadReceipt}
    onPayment={paymentAction}
    onCopy={copyTrackingLink}
  />;

  return <section className="panel history-panel">
    <div className="panel-title">
      <div><h3>Cargo history</h3><p className="panel-subtitle">Showing the latest 100 shipments, including the staff account that created each one.</p></div>
      <div className="history-tools">
        <input aria-label="Search cargo history" placeholder="Search receipt, customer, staff" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="btn secondary" onClick={load} disabled={loading}><RefreshCw size={14}/> Refresh</button>
      </div>
    </div>
    {error && <p className="form-error">{error}</p>}
    {notice && <p className="notice success">{notice}</p>}
    {loading ? <p className="notice">Loading shipments…</p> : shipments.length === 0 ? <p className="notice">No cargo records yet. Save a receipt to add the first shipment.</p> : filteredShipments.length === 0 ? <p className="notice">No shipments match that search.</p> : <>
      <div className="table-scroll history-desktop">
        <table className="history-table">
          <thead><tr><th>Receipt</th><th>Sender / Receiver</th><th>Created by</th><th>Route status</th><th>Payment</th><th>Actions</th></tr></thead>
          <tbody>{filteredShipments.map((shipment) => <tr key={shipment.id}>
            <td><strong>{shipment.receipt_no}</strong><small>{new Date(shipment.created_at).toLocaleString()}</small></td>
            <td>{shipment.sender?.full_name || "—"}<small>To: {shipment.receiver?.full_name || "—"}</small></td>
            <td>{shipment.creator?.full_name || "Staff account"}<small>{shipment.creator?.email || "Account details unavailable"}</small></td>
            <td>
              <span className="route-summary">{shipment.route_from || "Origin"} → {shipment.route_to || "Destination"}</span>
              <select aria-label={`Status for ${shipment.receipt_no}`} value={shipment.cargo_status} disabled={savingId === shipment.id} onChange={(event) => changeStatus(shipment, event.target.value)}>
                {statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </td>
            <td><strong>{paymentLabels[shipment.payment_status] || shipment.payment_status}</strong><small>{formatMoney(shipment.amount_paid, shipment.local_currency)} / {formatMoney(shipment.total_local, shipment.local_currency)}</small></td>
            <td>{actions(shipment)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="history-mobile">
        {filteredShipments.map((shipment) => <article className="history-card" key={shipment.id}>
          <div className="history-card-heading"><strong>{shipment.receipt_no}</strong><small>{new Date(shipment.created_at).toLocaleString()}</small></div>
          <p><b>Sender:</b> {shipment.sender?.full_name || "—"} <span>→</span> <b>Receiver:</b> {shipment.receiver?.full_name || "—"}</p>
          <p><b>Created by:</b> {shipment.creator?.full_name || "Staff account"} <small>{shipment.creator?.email || ""}</small></p>
          <p><b>Route:</b> {shipment.route_from || "Origin"} → {shipment.route_to || "Destination"}</p>
          <div className="history-card-status">
            <select aria-label={`Status for ${shipment.receipt_no}`} value={shipment.cargo_status} disabled={savingId === shipment.id} onChange={(event) => changeStatus(shipment, event.target.value)}>
              {statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <span>{paymentLabels[shipment.payment_status]} · {formatMoney(shipment.amount_paid, shipment.local_currency)} / {formatMoney(shipment.total_local, shipment.local_currency)}</span>
          </div>
          {actions(shipment)}
        </article>)}
      </div>
    </>}
    {detailsTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsTarget(null); }}>
      <section className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail-dialog-heading"><div><h3 id="detail-title">{detailsTarget.receipt_no}</h3><p>Shipment details, creator account, payments, and status history.</p></div><button className="icon-btn" aria-label="Close details" onClick={() => setDetailsTarget(null)}><X size={18}/></button></div>
        {detailsLoading && <p className="notice">Loading shipment details…</p>}
        <DetailRows title="Account & shipment" rows={[
          ["Created by", detailsTarget.creator?.full_name],
          ["Account email", detailsTarget.creator?.email],
          ["Role", detailsTarget.creator?.role],
          ["Created at", new Date(detailsTarget.created_at).toLocaleString()],
          ["Tracking number", detailsTarget.receipt_no],
          ["Public tracking URL", publicTrackingUrl(detailsTarget.receipt_no)],
          ["Route", `${detailsTarget.route_from || "Origin"} → ${detailsTarget.route_to || "Destination"}`],
          ["Box size", detailsTarget.box_size],
          ["Weight", detailsTarget.weight_kg ? `${detailsTarget.weight_kg} kg` : "—"],
          ["Item description", detailsTarget.item_description],
          ["Current status", statusOptions.find(([value]) => value === detailsTarget.cargo_status)?.[1] || detailsTarget.cargo_status]
        ]}/>
        <DetailRows title="Sender" rows={[
          ["Name", detailsTarget.sender?.full_name], ["Phone", detailsTarget.sender?.phone], ["Address", detailsTarget.sender?.address]
        ]}/>
        <DetailRows title="Receiver" rows={[
          ["Name", detailsTarget.receiver?.full_name], ["Phone", detailsTarget.receiver?.phone], ["Address", detailsTarget.receiver?.address]
        ]}/>
        <section className="detail-section">
          <h4>Payment history · {formatMoney(detailsTarget.amount_paid, detailsTarget.local_currency)} / {formatMoney(detailsTarget.total_local, detailsTarget.local_currency)}</h4>
          {detailsData.payments.length === 0 ? <p>No payment entries recorded.</p> : <ul>{detailsData.payments.map((item, index) => <li key={`${item.created_at}-${index}`}>{formatMoney(item.amount, item.currency)} · {item.payment_method} · Paid by {item.paid_by} · {item.creator?.full_name || "Staff"} · {new Date(item.created_at).toLocaleString()}{item.note ? ` · ${item.note}` : ""}</li>)}</ul>}
        </section>
        <section className="detail-section">
          <h4>Status history</h4>
          {detailsData.history.length === 0 ? <p>No status changes recorded.</p> : <ul>{detailsData.history.map((item, index) => <li key={`${item.created_at}-${index}`}>{statusOptions.find(([value]) => value === item.status)?.[1] || item.status} · {item.actor?.full_name || "Staff"} · {new Date(item.created_at).toLocaleString()}</li>)}</ul>}
        </section>
        <div className="dialog-actions"><a className="btn secondary" href={publicTrackingUrl(detailsTarget.receipt_no)} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open public tracking</a><button className="btn primary" onClick={() => setDetailsTarget(null)}>Close</button></div>
      </section>
    </div>}
    {paymentTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentTarget(null); }}>
      <form className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title" onSubmit={submitPayment}>
        <h3 id="payment-title">Record payment</h3>
        <p>{paymentTarget.receipt_no} · Outstanding {formatMoney(paymentTarget.total_local - paymentTarget.amount_paid, paymentTarget.local_currency)}</p>
        <label className="field"><span>Amount ({paymentTarget.local_currency})</span><input type="number" min="0.01" step="0.01" required value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })}/></label>
        <label className="field"><span>Payment method</span><input required value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}/></label>
        <label className="field"><span>Paid by</span><select value={payment.paidBy} onChange={(event) => setPayment({ ...payment, paidBy: event.target.value })}><option>Sender</option><option>Receiver</option><option>Agent</option><option>Company</option></select></label>
        <label className="field"><span>Note (optional)</span><input value={payment.note} onChange={(event) => setPayment({ ...payment, note: event.target.value })}/></label>
        <div className="dialog-actions"><button type="button" className="btn secondary" onClick={() => setPaymentTarget(null)}>Cancel</button><button type="submit" className="btn primary" disabled={savingId === paymentTarget.id}>{savingId === paymentTarget.id ? "Saving…" : "Save payment"}</button></div>
      </form>
    </div>}
  </section>;
}
