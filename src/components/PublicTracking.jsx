import React, { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { getPublicShipment } from "../lib/cargo.js";
import { isSupabaseConfigured } from "../lib/supabase.js";

const statusLabels = {
  booked: "Received",
  in_transit: "In transit",
  arrived: "Arrived",
  ready_for_pickup: "Ready for pickup",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function PublicTracking({ trackingCode }) {
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError("Public tracking is not available until Supabase is configured.");
      return () => { active = false; };
    }
    getPublicShipment(trackingCode)
      .then((result) => {
        if (active) setShipment(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load tracking details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [trackingCode]);

  return <main className="tracking-page">
    <header className="tracking-brand"><div className="brand-icon"><Package size={22} /></div><div><strong>Cargo shipment tracking</strong><small>Public shipment status</small></div></header>
    <section className="tracking-card">
      <p className="eyebrow">TRACKING NUMBER</p>
      <h1>{shipment?.receipt_no || "Shipment status"}</h1>
      {loading && <p className="notice">Loading tracking information…</p>}
      {!loading && error && <p className="form-error">{error}</p>}
      {!loading && !error && !shipment && <p className="notice">No shipment was found for this tracking link.</p>}
      {shipment && <>
        <div className="tracking-route"><span>{shipment.route_from || "Origin"}</span><b aria-hidden="true">→</b><span>{shipment.route_to || "Destination"}</span></div>
        <div className={`tracking-status status-${shipment.cargo_status}`}>{statusLabels[shipment.cargo_status] || shipment.cargo_status}</div>
        <p className="tracking-updated">Last updated: {formatDate(shipment.updated_at)}</p>
        <ol className="tracking-timeline">
          {(shipment.history || []).map((item, index) => <li key={`${item.created_at}-${index}`}>
            <span className="timeline-dot" />
            <div><strong>{statusLabels[item.status] || item.status}</strong><time>{formatDate(item.created_at)}</time></div>
          </li>)}
        </ol>
      </>}
    </section>
    <p className="tracking-privacy">This tracking page shows shipment status only. Contact details and payment information are not public.</p>
  </main>;
}
