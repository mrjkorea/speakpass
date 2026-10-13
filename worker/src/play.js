import { productCovers } from "./products.js";

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function idKey(id) {
  return String(id == null ? "" : id).trim().toLowerCase().replace(/\s+/g, " ");
}

function bytesToB64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToB64Url(text) {
  return bytesToB64Url(new TextEncoder().encode(text));
}

function pemToPkcs8(pem) {
  const body = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function signServiceJwt(account, nowSeconds) {
  const header = textToB64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const iat = nowSeconds;
  const claims = textToB64Url(JSON.stringify({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  ));
  return `${unsigned}.${bytesToB64Url(sig)}`;
}

export function readServiceAccount(raw) {
  const account = JSON.parse(String(raw || ""));
  if (!account || !account.client_email || !account.private_key) {
    throw new Error("service account");
  }
  return account;
}

let tokenCache = { value: "", exp: 0 };

export function clearTokenCache() {
  tokenCache = { value: "", exp: 0 };
}

export async function googleAccessToken(env, fetchImpl, nowSeconds) {
  if (tokenCache.value && tokenCache.exp > nowSeconds + 60) return tokenCache.value;
  const account = readServiceAccount(env.PLAY_SERVICE_ACCOUNT);
  const assertion = await signServiceJwt(account, nowSeconds);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) throw new Error("token");
  const json = await res.json();
  if (!json.access_token) throw new Error("token");
  tokenCache = {
    value: json.access_token,
    exp: nowSeconds + Number(json.expires_in || 3600)
  };
  return json.access_token;
}

function purchaseUrl(packageName, productId, token) {
  return "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
    + `${encodeURIComponent(packageName)}/purchases/products/`
    + `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
}

/**
 * Owned means purchased, not consumed, and not canceled.
 * purchaseType 2 is a Play Points reward, which is refused.
 */
export function purchaseDecision(purchase, body) {
  if (Number(purchase.purchaseState) !== 0) return "not_owned";
  if (Number(purchase.consumptionState || 0) !== 0) return "not_owned";
  if (Number(purchase.purchaseType) === 2) return "not_owned";
  const bound = idKey(purchase && purchase.obfuscatedExternalAccountId);
  if (bound && bound !== idKey(body && body.studentId)) return "not_owned";
  return "owned";
}

/**
 * Checks a one-time product with Google, then acknowledges it.
 * The worker never consumes a purchase and never refunds one.
 */
export async function verifyPurchase(env, body, fetchImpl, nowSeconds) {
  const productId = String(body.productId || "");
  const token = String(body.purchaseToken || "");
  const testId = String(body.testId || "");
  if (!token || !productCovers(productId, testId)) {
    return { ok: false, error: "not_owned" };
  }
  const access = await googleAccessToken(env, fetchImpl, nowSeconds);
  const url = purchaseUrl(env.PACKAGE_NAME, productId, token);
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${access}` }
  });
  if (!res.ok) return { ok: false, error: "not_owned" };
  const purchase = await res.json();
  if (purchaseDecision(purchase, body) !== "owned") return { ok: false, error: "not_owned" };
  if (Number(purchase.acknowledgementState) === 0) {
    await fetchImpl(`${url}:acknowledge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
  }
  return { ok: true };
}
