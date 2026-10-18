/** free: signed-in students. play: Google Play packs. Anything else stays free. */
export function paymentMode(env) {
  const raw = String(env && env.PAYMENT_MODE || "free").trim().toLowerCase();
  return raw === "play" ? "play" : "free";
}
