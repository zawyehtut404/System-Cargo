import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import JsBarcode from "jsbarcode";
import { Printer, FileDown, Plus, RotateCcw, Package, Settings2 } from "lucide-react";

const todayLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultForm = {
  company: "MYAN CARGO",
  tagline: "DELIVERING HAPPINESS",
  address: "No. 6/A, Than Thu Mar Road, Thingangyun Township",
  city: "Yangon 11071, Myanmar",
  phone: "09 980 378 041",
  tracking: "",
  routeFrom: "DT",
  routeTo: "SG",
  boxSize: "Gold",
  weight: "0",
  createdAt: todayLocal(),
  senderName: "CC Agent",
  senderPhone: "",
  senderAddress: "DT",
  senderBranch: "DT",
  receiverName: "",
  receiverPhone: "",
  receiverAddress: "",
  receiverBranch: "SG office",
  itemDescription: "GCS (Gold Shop & agent)",
  declaredValue: "1520.50",
  percentage: "4.00",
  subtotal: "60.82",
  exchangeRate: "3650",
  totalLocal: "221993",
  paymentStatus: "Paid in Full (Agent)",
  paidBy: "Sender",
  codAmount: "None - Fully paid by sender",
  paymentMethod: "Other",
  remarks: "Credit/55550000",
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

function Field({ label, value, onChange, type="text", placeholder="" }) {
  return <label className="field"><span>{label}</span><input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e)=>onChange(e.target.value)} /></label>;
}
function SelectField({ label, value, onChange, options }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(e)=>onChange(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></label>;
}

export default function App() {
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem("cargo-receipt-form");
    const initial = saved ? { ...defaultForm, ...JSON.parse(saved) } : { ...defaultForm };
    if (!initial.tracking) initial.tracking = makeTracking();
    return initial;
  });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => localStorage.setItem("cargo-receipt-form", JSON.stringify(form)), [form]);
  const update = (key) => (value) => setForm((f)=>({...f, [key]:value}));
  const tracking = form.tracking.trim() || "SG0000CCGCSG00000";
  const qrPayload = useMemo(() => JSON.stringify({
    trackingNumber: tracking,
    route: `${form.routeFrom} → ${form.routeTo}`,
    receiver: form.receiverName,
    receiverPhone: form.receiverPhone,
    receiverAddress: form.receiverAddress,
    weight: form.weight,
    status: form.paymentStatus
  }), [tracking, form.routeFrom, form.routeTo, form.receiverName, form.receiverPhone, form.receiverAddress, form.weight, form.paymentStatus]);

  const printReceipt = () => window.print();
  const newReceipt = () => {
    if (!window.confirm("Start a new receipt? The current receipt is saved in this browser only.")) return;
    setForm({ ...defaultForm, tracking: makeTracking(), createdAt: todayLocal() });
  };
  const exportPdf = () => window.print();

  return <div className="app-shell">
    <header className="topbar no-print">
      <div className="brand"><div className="brand-icon"><Package size={22}/></div><div><strong>Cargo Receipt Generator</strong><small>80mm thermal receipt · QR + Code 128</small></div></div>
      <div className="top-actions">
        <button className="btn secondary" onClick={()=>setShowSettings(!showSettings)}><Settings2 size={16}/> Company</button>
        <button className="btn secondary" onClick={newReceipt}><Plus size={16}/> New receipt</button>
        <button className="btn primary" onClick={printReceipt}><Printer size={16}/> Print receipt</button>
      </div>
    </header>

    <main className="workspace">
      <section className="editor no-print">
        <div className="section-heading"><div><h1>Receipt details</h1><p>Enter shipment information. The preview updates automatically.</p></div><span className="autosave">Saved in this browser</span></div>
        {showSettings && <div className="panel">
          <h3>Company information</h3>
          <div className="form-grid">
            <Field label="Company name" value={form.company} onChange={update("company")}/>
            <Field label="Tagline" value={form.tagline} onChange={update("tagline")}/>
            <Field label="Address" value={form.address} onChange={update("address")}/>
            <Field label="City / Country" value={form.city} onChange={update("city")}/>
            <Field label="Phone" value={form.phone} onChange={update("phone")}/>
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
            <SelectField label="Payment status" value={form.paymentStatus} onChange={update("paymentStatus")} options={["Paid in Full (Agent)","Paid in Full","Unpaid","COD","Partially Paid"]}/>
            <SelectField label="Paid by" value={form.paidBy} onChange={update("paidBy")} options={["Sender","Receiver","Agent","Company"]}/>
            <Field label="COD amount / note" value={form.codAmount} onChange={update("codAmount")}/>
            <Field label="Payment method" value={form.paymentMethod} onChange={update("paymentMethod")}/>
            <Field label="Remarks" value={form.remarks} onChange={update("remarks")}/>
          </div>
          <label className="field full"><span>Receipt notes</span><textarea rows="3" value={form.notes} onChange={e=>update("notes")(e.target.value)}/></label>
        </div>
        <div className="editor-footer"><button className="btn primary wide" onClick={printReceipt}><Printer size={17}/> Print / Save as PDF</button><p>In the print dialog, select your 80mm thermal printer. To save a PDF, choose “Save as PDF”.</p></div>
      </section>

      <section className="preview-area">
        <div className="preview-heading no-print"><div><h2>Live preview</h2><p>80mm receipt layout</p></div><span className="paper-tag">80 mm</span></div>
        <article className="receipt" id="receipt">
          <div className="receipt-head">
            <div className="logo-mark">✦</div>
            <div className="company-name">{form.company || "CARGO COMPANY"}</div>
            <div className="tagline">{form.tagline}</div>
            <div className="company-address">{form.address}<br/>{form.city} · Ph: {form.phone}</div>
          </div>
          <div className="qr-wrap"><QRCodeSVG value={qrPayload} size={112} level="M" includeMargin={false}/><div className="qr-hint">Scan to view shipment details</div></div>
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
    <footer className="no-print">Cargo Receipt Generator · Local browser storage · No server required</footer>
  </div>;
}

function ReceiptRow({label,value,success=false}) {
  return <div className="receipt-row"><span>{label}:</span><b className={success ? "paid" : ""}>{value || "—"}</b></div>;
}
