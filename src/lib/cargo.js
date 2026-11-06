import { supabase } from "./supabase.js";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
}

function numericValue(value, label, { minimum = 0, emptyValue = 0 } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return emptyValue;
  const number = Number(text);
  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(`${label} must be a valid number greater than or equal to ${minimum}.`);
  }
  return number;
}

function initialPaymentAmount(form) {
  if (form.paymentStatus === "Partially Paid") {
    return numericValue(form.amountPaid, "Initial payment");
  }
  return form.paymentStatus.toLowerCase().includes("paid")
    ? numericValue(form.totalLocal, "Local total")
    : 0;
}

function shipmentPayload(form, branchId) {
  const senderName = String(form.senderName ?? "").trim();
  const receiverName = String(form.receiverName ?? "").trim();
  if (!senderName || !receiverName) {
    throw new Error("Sender and receiver names are required.");
  }
  const createdAt = form.createdAt ? new Date(form.createdAt) : null;
  if (createdAt && Number.isNaN(createdAt.getTime())) {
    throw new Error("The shipment date is invalid.");
  }
  return {
    ...(branchId ? { branch_id: branchId } : {}),
    receipt_no: form.tracking.trim(),
    route_from: form.routeFrom,
    route_to: form.routeTo,
    box_size: form.boxSize,
    weight_kg: numericValue(form.weight, "Weight"),
    item_description: form.itemDescription,
    declared_value: numericValue(form.declaredValue, "Declared value"),
    declared_currency: "SGD",
    fee_subtotal: numericValue(form.subtotal, "Fee subtotal"),
    fee_currency: "SGD",
    exchange_rate: numericValue(form.exchangeRate, "Exchange rate", { minimum: 0.0001, emptyValue: 1 }),
    total_local: numericValue(form.totalLocal, "Local total"),
    local_currency: "MMK",
    initial_payment_amount: initialPaymentAmount(form),
    payment_method: form.paymentMethod,
    paid_by: form.paidBy,
    created_at: createdAt ? createdAt.toISOString() : null,
    sender: {
      name: form.senderName,
      phone: form.senderPhone,
      address: form.senderAddress
    },
    receiver: {
      name: form.receiverName,
      phone: form.receiverPhone,
      address: form.receiverAddress
    },
    receipt_data: form
  };
}

export async function createShipment(form, branchId) {
  requireSupabase();
  const { data, error } = await supabase.rpc("create_shipment", {
    p_payload: shipmentPayload(form, branchId)
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function updateShipment(form, shipmentId) {
  requireSupabase();
  const { data, error } = await supabase.rpc("update_shipment", {
    p_shipment_id: shipmentId,
    p_payload: shipmentPayload(form)
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getPublicShipment(trackingCode) {
  requireSupabase();
  const { data, error } = await supabase.rpc("track_shipment", {
    p_tracking_code: trackingCode
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function recordPayment({ shipmentId, amount, currency, method, paidBy, note, userId }) {
  requireSupabase();
  const { error } = await supabase.from("payments").insert({
    shipment_id: shipmentId,
    amount: numericValue(amount, "Payment amount", { minimum: 0.01 }),
    currency,
    payment_method: method,
    paid_by: paidBy,
    note,
    created_by: userId
  });
  if (error) throw new Error(error.message);
}
