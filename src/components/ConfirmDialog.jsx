import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onCancel
}) {
  const cancelButton = useRef(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    cancelButton.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return <div className="modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <div className={`confirm-dialog-icon${destructive ? " destructive" : ""}`}><AlertTriangle size={20}/></div>
      <div className="confirm-dialog-content">
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-message">{message}</p>
      </div>
      <div className="dialog-actions">
        <button ref={cancelButton} className="btn secondary" onClick={onCancel}>Cancel</button>
        <button className={`btn${destructive ? " danger" : " primary"}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}
