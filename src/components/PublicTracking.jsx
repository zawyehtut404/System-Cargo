import React, { useEffect, useState } from "react";
import { Package, Search } from "lucide-react";
import { getPublicShipment } from "../lib/cargo.js";
import { getCompanyLogo } from "../lib/company.js";
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
  const [query, setQuery] = useState(trackingCode);
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(Boolean(trackingCode));
  const [error, setError] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [brandingError, setBrandingError] = useState("");

  useEffect(() => {
    let active = true;
    getCompanyLogo()
      .then((logo) => { if (active) setCompanyLogo(logo); })
      .catch((requestError) => {
        if (active) setBrandingError(requestError instanceof Error ? requestError.message : "Unable to load the company logo.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!trackingCode) {
      setLoading(false);
      setShipment(null);
      return undefined;
    }

    let active = true;
    setQuery(trackingCode);
    setLoading(true);
    setError("");
    getPublicShipment(trackingCode)
      .then((result) => { if (active) setShipment(result); })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load tracking details.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [trackingCode]);

  const search = async (event) => {
    event.preventDefault();
    const code = query.trim();
    if (!code) {
      setError("Enter a receipt number or tracking code.");
      setShipment(null);
      return;
    }
    if (!isSupabaseConfigured) {
      setError("Public tracking is not available until Supabase is configured.");
      return;
    }
    window.history.replaceState(null, "", `/?track=${encodeURIComponent(code)}`);
    setLoading(true);
    setShipment(null);
    setError("");
    try {
      setShipment(await getPublicShipment(code));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load tracking details.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="tracking-page">
    <header className="tracking-brand">
      {companyLogo ? <img className="tracking-company-logo" src={companyLogo} alt="Company logo" /> : <div className="brand-icon"><Package size={22} /></div>}
      <div><strong>Cargo shipment tracking</strong><small>Public shipment status</small></div>
    </header>
    {brandingError && <p className="tracking-brand-error">Company logo could not be loaded: {brandingError}</p>}
    <section className="tracking-card">
      <p className="eyebrow">TRACK SHIPMENT</p>
      <form className="tracking-search" onSubmit={search}>
        <label className="field">
          <span>Receipt number or QR tracking code</span>
          <input autoComplete="off" maxLength={80} placeholder="Enter receipt number or scan a QR code" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={loading}><Search size={15}/>{loading ? "Searching…" : "Search"}</button>
      </form>
      {shipment && <h1 className="tracking-receipt">{shipment.receipt_no}</h1>}
      {loading && <p className="notice">Loading tracking information…</p>}
      {!loading && error && <div className="tracking-error"><p className="form-error">{error}</p><button className="btn secondary" onClick={search}>Retry search</button></div>}
      {!loading && !error && !shipment && query.trim() && <p className="notice">No shipment was found for that receipt number or tracking code.</p>}
      {shipment && <div className="tracking-result">
        <div className="tracking-route"><span>{shipment.route_from || "Origin"}</span><b aria-hidden="true">→</b><span>{shipment.route_to || "Destination"}</span></div>
        <div className={`tracking-status status-${shipment.cargo_status}`}>{statusLabels[shipment.cargo_status] || shipment.cargo_status}</div>
        <p className="tracking-updated">Last updated: {formatDate(shipment.updated_at)}</p>
        <ol className="tracking-timeline">
          {(shipment.history || []).map((item, index) => <li key={`${item.created_at}-${index}`}>
            <span className="timeline-dot" />
            <div><strong>{statusLabels[item.status] || item.status}</strong><time>{formatDate(item.created_at)}</time></div>
          </li>)}
        </ol>
      </div>}
    </section>
    <p className="tracking-privacy">This tracking page shows shipment status and route only. Customer contact details and payment information are not public.</p>
  </main>;
}
