const PRODUCTION_ORIGIN = "https://system-cargo.vercel.app";

export function publicTrackingUrl(receiptNo) {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const origin = isLocalhost ? window.location.origin : PRODUCTION_ORIGIN;
  const url = new URL("/", origin);
  url.searchParams.set("track", String(receiptNo).trim());
  return url.toString();
}
