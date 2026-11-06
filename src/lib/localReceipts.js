const STORAGE_KEY = "cargo-receipts";
const LEGACY_KEY = "cargo-receipt-form";

export function readLocalReceipts() {
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (serialized) {
    const receipts = JSON.parse(serialized);
    if (!Array.isArray(receipts)) throw new Error("The local receipt archive has an invalid format.");
    return receipts;
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return [];
  const form = JSON.parse(legacy);
  const receipts = form && typeof form === "object"
    ? [{ id: form.tracking || "local-draft", updatedAt: new Date().toISOString(), form }]
    : [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
  localStorage.removeItem(LEGACY_KEY);
  return receipts;
}

export function saveLocalReceipt(form, id = form.tracking, metadata = {}) {
  const receipts = readLocalReceipts();
  const receiptId = String(id || "").trim();
  if (!receiptId) throw new Error("A local archive ID is required to save this receipt.");
  const next = [
    {
      id: receiptId,
      updatedAt: new Date().toISOString(),
      form,
      shipmentId: metadata.shipmentId || "",
      trackingCode: metadata.trackingCode || ""
    },
    ...receipts.filter((receipt) => receipt.id !== receiptId)
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("cargo-local-receipts-updated"));
}

export function deleteLocalReceipt(id) {
  const next = readLocalReceipts().filter((receipt) => receipt.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("cargo-local-receipts-updated"));
}
