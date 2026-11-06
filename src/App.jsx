import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import JsBarcode from "jsbarcode";
import { Printer, Plus, RotateCcw, Package, Settings2, Save, ClipboardList, Archive, UserRound, Upload, X } from "lucide-react";
import CargoHistory from "./components/CargoHistory.jsx";
import LoginPanel from "./components/LoginPanel.jsx";
import PublicTracking from "./components/PublicTracking.jsx";
import LocalReceipts from "./components/LocalReceipts.jsx";
import AccountPanel from "./components/AccountPanel.jsx";
import { getCompanyLogo, uploadCompanyLogo } from "./lib/company.js";
import { createShipment, updateShipment } from "./lib/cargo.js";
import { readLocalReceipts, saveLocalReceipt } from "./lib/localReceipts.js";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";

const todayLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultForm = {
  company: "MYAN CARGO",
  tagline: "DELIVERING HAPPINESS",
  address: "12 Ward, Near Than Lan Bus Stop, Insein Road, Yangon 11051, Myanmar",
  city: "Yangon 11051, Myanmar",
  phone: "09 980 378 041",
  tracking: "",
  routeFrom: "",
  routeTo: "",
  boxSize: "",
  weight: "0",
  createdAt: todayLocal(),
  senderName: "MM Agent",
  senderPhone: "",
  senderAddress: "",
  senderBranch: "",
  receiverName: "",
  receiverPhone: "",
  receiverAddress: "",
  receiverBranch: "YGN office",
  itemDescription: "",
  declaredValue: "1520.50",
  percentage: "4.00",
  subtotal: "60.82",
  exchangeRate: "3650",
  totalLocal: "221993",
  paymentStatus: "Paid in Full (Agent)",
  amountPaid: "0",
  paidBy: "Sender",
  codAmount: "None - Fully paid by sender",
  paymentMethod: "Other",
  remarks: "Credit/debit card payment received. Thank you for your business.",
  notes: "Please keep this receipt for reference. Scan the QR code to view shipment details."
};

function makeTracking() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const rand = (n) => Math.floor(Math.random() * n);
  return `SG${String(Date.now()).slice(-4)}${chars[rand(chars.length)]}${chars[rand(chars.length)]}SG${String(rand(100000)).padStart(5,"0")}`;
}
const money = (v) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && value) {
      try { JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, margin: 0, height: 42, width: 1.35, background: "#ffffff", lineColor: "#111111" }); }
      catch { /* invalid barcode input */ }
    }
  }, [value]);
  return <svg ref={ref} className="barcode" aria-label={`Barcode ${value}`} />;
}

function Field({ label, value, onChange, type="text", placeholder="", disabled=false }) {
  return <label className="field"><span>{label}</span><input type={type} value={value ?? ""} placeholder={placeholder} disabled={disabled} onChange={(e)=>onChange(e.target.value)} /></label>;
}
function SelectField({ label, value, onChange, options, disabled=false }) {
  return <label className="field"><span>{label}</span><select value={value} disabled={disabled} onChange={(e)=>onChange(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></label>;
}

export default function App() {
  const [initialForm] = useState(() => {
    try {
      const savedReceipts = readLocalReceipts();
      const latest = savedReceipts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      return { form: latest ? { ...defaultForm, ...latest.form } : { ...defaultForm }, localId: latest?.id || "", error: "" };
    } catch (error) {
      return {
        form: { ...defaultForm },
        localId: "",
        error: error instanceof SyntaxError
          ? "The local receipt archive was invalid. A fresh receipt has been loaded."
          : `Unable to read local receipts: ${error instanceof Error ? error.message : "storage is unavailable."}`
      };
    }
  });
  const [form, setForm] = useState(() => {
    const initial = initialForm.form;
    if (!initial.tracking) initial.tracking = makeTracking();
    return initial;
  });
  const [localReceiptId, setLocalReceiptId] = useState(() => initialForm.localId || crypto.randomUUID());
  const [showSettings, setShowSettings] = useState(false);
  const [companyLogo, setCompanyLogo] = useState("");
  const [companyLogoLoading, setCompanyLogoLoading] = useState(false);
  const [companyLogoError, setCompanyLogoError] = useState("");
  const [qrLogo, setQrLogo] = useState(() => {
    try { return localStorage.getItem("cargo-qr-logo") || ""; }
    catch { return ""; }
  });
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authError, setAuthError] = useState("");
  const [localError, setLocalError] = useState(initialForm.error);
  const [activeView, setActiveView] = useState("receipt");
  const [savedShipmentId, setSavedShipmentId] = useState("");
  const [savedTrackingCode, setSavedTrackingCode] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const publicTrackingCode = new URLSearchParams(window.location.search).get("track");

  useEffect(() => {
    let active = true;
    getCompanyLogo()
      .then((logo) => { if (active) setCompanyLogo(logo); })
      .catch((error) => { if (active) setCompanyLogoError(error instanceof Error ? error.message : "Unable to load the company logo."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.title = publicTrackingCode ? "Cargo Shipment Tracking" : "Cargo System";
  }, [publicTrackingCode]);

  useEffect(() => {
    if (publicTrackingCode) return;
    try {
      saveLocalReceipt(form, localReceiptId, {
        shipmentId: savedShipmentId,
        trackingCode: savedTrackingCode
      });
      if (!initialForm.error) setLocalError("");
    } catch (error) {
      setLocalError(error instanceof Error ? `Unable to save to the local receipt archive: ${error.message}` : "Unable to save to the local receipt archive.");
    }
  }, [form, initialForm.error, localReceiptId, publicTrackingCode, savedShipmentId, savedTrackingCode]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data?.session || null);
      setAuthReady(true);
    }).catch((error) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : "Unable to check the Supabase session.");
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthError("");
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null);
      return undefined;
    }
    setProfile(null);
    setAuthError("");
    let active = true;
    supabase.from("profiles")
      .select("id, full_name, role, branch_id, is_active")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setAuthError(error.message);
        else setProfile(data);
      })
      .catch((error) => {
        if (active) setAuthError(error instanceof Error ? error.message : "Unable to load the staff profile.");
      });
    return () => { active = false; };
  }, [session]);

  const update = (key) => (value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveMessage("");
    setSaveError("");
    setLocalError("");
  };
  const tracking = form.tracking.trim() || "SG0000CCGCSG00000";
  const qrPayload = useMemo(() => savedTrackingCode
    ? `${window.location.origin}/?track=${encodeURIComponent(savedTrackingCode)}`
    : JSON.stringify({ trackingNumber: tracking, route: `${form.routeFrom} → ${form.routeTo}` }),
  [savedTrackingCode, tracking, form.routeFrom, form.routeTo]);
  const hasActiveProfile = Boolean(session && profile?.is_active && profile.branch_id);

  const printReceipt = () => window.print();
  const newReceipt = () => {
    if (!window.confirm("Start a new receipt? Unsaved edits are kept in this browser; saved cargo records remain in history.")) return;
    setForm({ ...defaultForm, tracking: makeTracking(), createdAt: todayLocal() });
    setLocalReceiptId(crypto.randomUUID());
    setSavedShipmentId("");
    setSavedTrackingCode("");
    setSaveMessage("");
    setSaveError("");
    setLocalError("");
  };

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setAuthError(error.message);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  const uploadQrLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 200 * 1024) {
      setLocalError("Choose a PNG, JPEG, or WebP logo smaller than 200 KB.");
      return;
    }
    try {
      const logoDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read the selected logo."));
        reader.readAsDataURL(file);
      });
      localStorage.setItem("cargo-qr-logo", logoDataUrl);
      setQrLogo(logoDataUrl);
      setLocalError("");
    } catch (error) {
      setLocalError(error instanceof Error ? `Unable to save the QR logo: ${error.message}` : "Unable to save the QR logo.");
    }
  };

  const removeQrLogo = () => {
    try {
      localStorage.removeItem("cargo-qr-logo");
      setQrLogo("");
      setLocalError("");
    } catch (error) {
      setLocalError(error instanceof Error ? `Unable to remove the QR logo: ${error.message}` : "Unable to remove the QR logo.");
    }
  };

  const changeCompanyLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCompanyLogoLoading(true);
    setCompanyLogoError("");
    try {
      setCompanyLogo(await uploadCompanyLogo(file));
    } catch (error) {
      setCompanyLogoError(error instanceof Error ? error.message : "Unable to upload the company logo.");
    } finally {
      setCompanyLogoLoading(false);
    }
  };

  const saveShipment = async () => {
    setSaveMessage("");
    setSaveError("");
    if (!isSupabaseConfigured || !supabase) {
      setSaveError("Supabase is not configured. Add the project URL and publishable/anon key first.");
      return;
    }
    if (!hasActiveProfile) {
      setSaveError("Sign in with an active staff account assigned to a branch before saving.");
      return;
    }
    if (!form.tracking.trim()) {
      setSaveError("A receipt number is required.");
      return;
    }
    setSaving(true);
    try {
      const saved = savedShipmentId
        ? await updateShipment(form, savedShipmentId)
        : await createShipment(form, profile.branch_id);
      setSavedShipmentId(saved.id);
      setSavedTrackingCode(saved.tracking_code);
      setSaveMessage(`${savedShipmentId ? "Updated" : "Saved"} ${saved.receipt_no}. The receipt QR opens its public tracking page.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save this shipment.");
    } finally {
      setSaving(false);
    }
  };

  const loadReceipt = (shipment) => {
    const persisted = shipment.receipt_data || {};
    const paymentStatus = shipment.payment_status === "paid"
      ? "Paid in Full"
      : shipment.payment_status === "partial" ? "Partially Paid" : "Unpaid";
    setForm({
      ...defaultForm,
      ...persisted,
      tracking: shipment.receipt_no,
      paymentStatus,
      amountPaid: String(shipment.amount_paid || 0)
    });
    setSavedShipmentId(shipment.id);
    setSavedTrackingCode(shipment.tracking_code);
    setLocalReceiptId(`shipment-${shipment.id}`);
    setSaveMessage(`Loaded ${shipment.receipt_no} from cargo history.`);
    setSaveError("");
    setActiveView("receipt");
  };

  if (publicTrackingCode) return <PublicTracking trackingCode={publicTrackingCode} />;

  if (!isSupabaseConfigured || !authReady || !session || !hasActiveProfile) {
    return <div className="access-shell">
      <header className="access-brand">
        <div className="brand-icon"><Package size={22}/></div>
        <strong>Cargo System</strong>
      </header>
      <main className="access-content">
        <h1>Staff sign in</h1>
        <p>Sign in with an authorized account to continue.</p>
        <LoginPanel configured={isSupabaseConfigured} session={session} profile={profile} authReady={authReady} authError={authError} onLogin={signIn} onLogout={signOut}/>
        {session && profile?.is_active && !profile.branch_id && <p className="form-error">This staff profile is not assigned to a branch. Ask an administrator to update it.</p>}
      </main>
    </div>;
  }

  return <div className="app-shell">
    <header className="topbar no-print">
      <div className="brand"><div className="brand-icon"><Package size={22}/></div><div><strong>Cargo Receipt Generator</strong><small>80mm thermal receipt · QR + Code 128</small></div></div>
      <div className="top-actions">
        {hasActiveProfile && <>
          <button className={`btn ${activeView === "receipt" ? "primary" : "secondary"}`} onClick={() => setActiveView("receipt")}><Printer size={15}/> Receipt</button>
          <button className={`btn ${activeView === "history" ? "primary" : "secondary"}`} onClick={() => setActiveView("history")}><ClipboardList size={15}/> Cargo history</button>
          <button className={`btn ${activeView === "archive" ? "primary" : "secondary"}`} onClick={() => setActiveView("archive")}><Archive size={15}/> Local receipts</button>
          <button className={`btn ${activeView === "account" ? "primary" : "secondary"}`} onClick={() => setActiveView("account")}><UserRound size={15}/> Account</button>
        </>}
        {activeView === "receipt" && <>
          <button className="btn secondary" onClick={()=>setShowSettings(!showSettings)}><Settings2 size={16}/> Company</button>
          <button className="btn secondary" onClick={newReceipt}><Plus size={16}/> New receipt</button>
          <button className="btn primary" onClick={saveShipment} disabled={!isSupabaseConfigured || !hasActiveProfile || saving}><Save size={15}/> {saving ? "Saving…" : savedShipmentId ? "Update cargo" : "Save cargo"}</button>
          <button className="btn primary" onClick={printReceipt}><Printer size={16}/> Print receipt</button>
        </>}
      </div>
    </header>

    <div className="account-strip no-print">
      <LoginPanel configured={isSupabaseConfigured} session={session} profile={profile} authReady={authReady} authError={authError} onLogin={signIn} onLogout={signOut}/>
      {session && profile && !profile.branch_id && <p className="form-error">This staff profile is not assigned to a branch. Ask an administrator to update it.</p>}
    </div>

    {activeView === "history" && hasActiveProfile ? <main className="single-column no-print"><CargoHistory userId={session.user.id} onLoadReceipt={loadReceipt}/></main>
      : activeView === "archive" && hasActiveProfile ? <main className="single-column no-print"><LocalReceipts onLoadReceipt={(savedForm, localId, shipmentId, trackingCode) => {
        setForm({ ...defaultForm, ...savedForm });
        setLocalReceiptId(localId);
        setSavedShipmentId(shipmentId || (localId.startsWith("shipment-") ? localId.slice("shipment-".length) : ""));
        setSavedTrackingCode(trackingCode || "");
        setSaveMessage("Loaded local receipt.");
        setSaveError("");
        setActiveView("receipt");
      }}/></main>
      : activeView === "account" && hasActiveProfile ? <main className="single-column no-print"><AccountPanel session={session} profile={profile} onProfileChange={setProfile}/></main>
      : <main className="workspace">
      <section className="editor no-print">
        <div className="section-heading"><div><h1>Receipt details</h1><p>Enter shipment information. The preview updates automatically.</p></div><span className="autosave">Saved in this browser</span></div>
        {(localError || saveError || saveMessage) && <div className={`notice ${saveError || localError ? "warning" : "success"}`}>{saveError || localError || saveMessage}</div>}
        {showSettings && <div className="panel">
          <h3>Company information</h3>
          {companyLogoError && <p className="form-error">{companyLogoError}</p>}
          <div className="form-grid">
            <Field label="Company name" value={form.company} onChange={update("company")}/>
            <Field label="Tagline" value={form.tagline} onChange={update("tagline")}/>
            <Field label="Address" value={form.address} onChange={update("address")}/>
            <Field label="City / Country" value={form.city} onChange={update("city")}/>
            <Field label="Phone" value={form.phone} onChange={update("phone")}/>
          </div>
          <div className="qr-logo-control">
            <div><strong>Company logo</strong><small>Shared with public tracking and receipt print · JPEG, PNG, or WebP under 2 MB</small></div>
            <div className="qr-logo-actions">
              {companyLogo && <img src={companyLogo} alt="Company logo"/>}
              {profile.role === "admin" ? <label className="btn secondary"><Upload size={14}/>{companyLogoLoading ? "Uploading…" : "Upload company logo"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={changeCompanyLogo} disabled={companyLogoLoading}/></label>
                : <span className="panel-subtitle">Ask an admin to update this logo.</span>}
            </div>
          </div>
          <div className="qr-logo-control">
            <div><strong>QR code logo</strong><small>PNG, JPEG, or WebP · up to 200 KB · saved in this browser</small></div>
            <div className="qr-logo-actions">
              {qrLogo && <img src={qrLogo} alt="Current QR logo"/>}
              <label className="btn secondary"><Upload size={14}/>Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadQrLogo}/></label>
              {qrLogo && <button className="btn secondary" onClick={removeQrLogo}><X size={14}/>Remove</button>}
            </div>
          </div>
        </div>}
        <div className="panel">
          <div className="panel-title"><h3>Shipment</h3><button className="text-btn" onClick={()=>update("tracking")(makeTracking())}><RotateCcw size={14}/> Generate new ID</button></div>
          <div className="form-grid">
            <Field label="Tracking number" value={form.tracking} onChange={update("tracking")}/>
            <Field label="Created date & time" type="datetime-local" value={form.createdAt} onChange={update("createdAt")}/>
            <Field label="Route from" value={form.routeFrom} onChange={update("routeFrom")}/>
            <Field label="Route to" value={form.routeTo} onChange={update("routeTo")}/>
            <Field label="Box size" value={form.boxSize} onChange={update("boxSize")}/>
            <Field label="Weight (kg)" value={form.weight} onChange={update("weight")}/>
          </div>
        </div>
        <div className="panel">
          <h3>Sender</h3><div className="form-grid">
            <Field label="Name" value={form.senderName} onChange={update("senderName")}/>
            <Field label="Phone" value={form.senderPhone} onChange={update("senderPhone")}/>
            <Field label="Address" value={form.senderAddress} onChange={update("senderAddress")}/>
            <Field label="Branch" value={form.senderBranch} onChange={update("senderBranch")}/>
          </div>
        </div>
        <div className="panel">
          <h3>Receiver</h3><div className="form-grid">
            <Field label="Name" value={form.receiverName} onChange={update("receiverName")}/>
            <Field label="Phone" value={form.receiverPhone} onChange={update("receiverPhone")}/>
            <Field label="Address" value={form.receiverAddress} onChange={update("receiverAddress")}/>
            <Field label="Branch" value={form.receiverBranch} onChange={update("receiverBranch")}/>
          </div>
        </div>
        <div className="panel">
          <h3>Items & charges</h3><div className="form-grid">
            <Field label="Item description" value={form.itemDescription} onChange={update("itemDescription")}/>
            <Field label="Declared value (SGD)" value={form.declaredValue} onChange={update("declaredValue")}/>
            <Field label="Percentage (%)" value={form.percentage} onChange={update("percentage")}/>
            <Field label="Subtotal (SGD)" value={form.subtotal} onChange={update("subtotal")}/>
            <Field label="Exchange rate (MMK)" value={form.exchangeRate} onChange={update("exchangeRate")}/>
            <Field label="Total local (MMK)" value={form.totalLocal} onChange={update("totalLocal")}/>
          </div>
        </div>
        <div className="panel">
          <h3>Payment summary</h3><div className="form-grid">
            <SelectField label="Payment status" value={form.paymentStatus} onChange={update("paymentStatus")} options={["Paid in Full (Agent)","Paid in Full","Unpaid","COD","Partially Paid"]} disabled={Boolean(savedShipmentId)}/>
            <SelectField label="Paid by" value={form.paidBy} onChange={update("paidBy")} options={["Sender","Receiver","Agent","Company"]} disabled={Boolean(savedShipmentId)}/>
            {form.paymentStatus === "Partially Paid" && <Field label="Initial amount paid (MMK)" type="number" value={form.amountPaid} onChange={update("amountPaid")} disabled={Boolean(savedShipmentId)}/>}
            <Field label="COD amount / note" value={form.codAmount} onChange={update("codAmount")}/>
            <Field label="Payment method" value={form.paymentMethod} onChange={update("paymentMethod")} disabled={Boolean(savedShipmentId)}/>
            <Field label="Remarks" value={form.remarks} onChange={update("remarks")}/>
          </div>
          <label className="field full"><span>Receipt notes</span><textarea rows="3" value={form.notes} onChange={e=>update("notes")(e.target.value)}/></label>
        </div>
        <div className="editor-footer">
          <button className="btn primary wide" onClick={saveShipment} disabled={!isSupabaseConfigured || !hasActiveProfile || saving}><Save size={16}/> {saving ? "Saving cargo…" : savedShipmentId ? "Update saved cargo" : "Save cargo to Supabase"}</button>
          <button className="btn secondary wide" onClick={printReceipt}><Printer size={17}/> Print / Save as PDF</button>
          <p>In the print dialog, select your 80mm thermal printer. To save a PDF, choose “Save as PDF”.</p>
        </div>
      </section>

      <section className="preview-area">
        <div className="preview-heading no-print"><div><h2>Live preview</h2><p>80mm receipt layout</p></div><span className="paper-tag">80 mm</span></div>
        <article className="receipt" id="receipt">
          <div className="receipt-head">
            {companyLogo ? <img className="receipt-company-logo" src={companyLogo} alt="Company logo"/> : <div className="logo-mark">✦</div>}
            <div className="company-name">{form.company || "CARGO COMPANY"}</div>
            <div className="tagline">{form.tagline}</div>
            <div className="company-address">{form.address}<br/>{form.city} · Ph: {form.phone}</div>
          </div>
          <div className="qr-wrap"><QRCodeSVG value={qrPayload} size={112} level={qrLogo ? "H" : "M"} includeMargin={false} imageSettings={qrLogo ? { src: qrLogo, width: 26, height: 26, excavate: true } : undefined}/><div className="qr-hint">{savedTrackingCode ? "Scan to view public tracking" : "Save cargo to activate public tracking QR"}</div></div>
          <div className="tracking">{tracking}</div>
          <div className="route-grid">
            <div><b>ROUTE</b><span>{form.routeFrom} → {form.routeTo}</span></div>
            <div><b>Box Size</b><span>{form.boxSize}</span></div>
            <div><b>Weight</b><span>{form.weight || "0"} kg</span></div>
            <div><b>Created at</b><span>{form.createdAt ? new Date(form.createdAt).toLocaleString() : ""}</span></div>
          </div>
          <section className="receipt-section">
            <h4>SENDER</h4>
            <ReceiptRow label="Name" value={form.senderName}/><ReceiptRow label="Phone" value={form.senderPhone}/><ReceiptRow label="Address" value={form.senderAddress}/><ReceiptRow label="Branch" value={form.senderBranch}/>
          </section>
          <section className="receipt-section">
            <h4>RECEIVER</h4>
            <ReceiptRow label="Name" value={form.receiverName}/><ReceiptRow label="Phone" value={form.receiverPhone}/><ReceiptRow label="Address" value={form.receiverAddress}/><ReceiptRow label="Branch" value={form.receiverBranch}/>
            <ReceiptRow label="Remarks" value={form.remarks}/>
          </section>
          <section className="receipt-section">
            <h4>ITEMS</h4>
            <div className="item-line"><span>{form.itemDescription}<small>Value: ${money(form.declaredValue)} | Percentage @ {form.percentage}% of declared value</small></span><b>${money(form.subtotal)}</b></div>
            <div className="total-line"><span>Subtotal</span><b>${money(form.subtotal)}</b></div>
          </section>
          <div className="grand-total"><b>Total Cost</b><strong>${money(form.subtotal)}</strong></div>
          <div className="exchange"><span>Exchange Rate</span><b>1 SGD = {Number(form.exchangeRate||0).toLocaleString()} MMK</b></div>
          <div className="exchange"><span>Total (Local)</span><b>{Number(form.totalLocal||0).toLocaleString()} MMK</b></div>
          <section className="receipt-section payment">
            <h4>PAYMENT SUMMARY</h4>
            <ReceiptRow label="Shipping Fee Payer" value={form.paidBy}/>
            <ReceiptRow label="Payment Status" value={form.paymentStatus} success={form.paymentStatus.toLowerCase().includes("paid")}/>
            <ReceiptRow label="COD Amount" value={form.codAmount}/>
            <ReceiptRow label="Payment Method" value={form.paymentMethod}/>
          </section>
          <section className="receipt-section remarks"><h4>REMARKS</h4><p>{form.remarks}</p></section>
          <div className="barcode-wrap"><Barcode value={tracking.replace(/[^A-Za-z0-9\-.$/+% ]/g, "").slice(0,45) || "CARGO00001"}/><div className="barcode-number">{tracking}</div></div>
          <div className="notes"><b>NOTES</b><p>{form.notes}</p></div>
          <div className="thanks">Thank you for choosing {form.company || "us"}.</div>
        </article>
      </section>
    </main>
    }
    <footer className="no-print">Cargo Receipt Generator · Local drafts · Supabase cargo history when configured</footer>
  </div>;
}

function ReceiptRow({label,value,success=false}) {
  return <div className="receipt-row"><span>{label}:</span><b className={success ? "paid" : ""}>{value || "—"}</b></div>;
}
