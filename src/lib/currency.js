export function calculateLocalTotal(subtotal, exchangeRate) {
  const subtotalText = String(subtotal ?? "").trim();
  const exchangeRateText = String(exchangeRate ?? "").trim();
  if (!subtotalText || !exchangeRateText) return "";

  const subtotalValue = Number(subtotalText);
  const exchangeRateValue = Number(exchangeRateText);
  if (!Number.isFinite(subtotalValue) || subtotalValue < 0
    || !Number.isFinite(exchangeRateValue) || exchangeRateValue <= 0) {
    return "";
  }

  const total = subtotalValue * exchangeRateValue;
  return Number.isFinite(total) ? Number(total.toFixed(2)).toString() : "";
}
