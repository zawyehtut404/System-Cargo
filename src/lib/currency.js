const numericPattern = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)$/;

export function parseNumericValue(value) {
  const text = String(value ?? "").trim();
  if (!text || !numericPattern.test(text)) return null;

  const number = Number(text.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

export function calculateLocalTotal(subtotal, exchangeRate) {
  const subtotalValue = parseNumericValue(subtotal);
  const exchangeRateValue = parseNumericValue(exchangeRate);
  if (subtotalValue === null || subtotalValue < 0
    || exchangeRateValue === null || exchangeRateValue <= 0) {
    return "";
  }

  const total = subtotalValue * exchangeRateValue;
  return Number.isFinite(total) ? Number(total.toFixed(2)).toString() : "";
}
