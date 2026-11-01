import "@tanstack/react-start/server-only";

// Connector logins and OAuth tokens are sealed with AES-256-GCM before they reach the
// database. The additional data binds each ciphertext to its organization and connector,
// so a sealed value copied to another row cannot be opened there.
// Key source: CONNECTOR_ENCRYPTION_KEY (base64, 32 bytes) when set; otherwise a key derived
// from the server-only service-role key. The key id is stored with every value.
type KeyId = "env" | "svc";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function fromBase64url(value: string) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function key(id: KeyId, env: Record<string, string | undefined>) {
  if (id === "env") {
    const raw = env["CONNECTOR_ENCRYPTION_KEY"];
    if (!raw) throw new Error("The connector encryption key is not configured.");
    const bytes = fromBase64url(raw.trim());
    if (bytes.length !== 32)
      throw new Error("CONNECTOR_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
    return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  const secret = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!secret) throw new Error("Connector storage is not configured on the server.");
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("civimeet-connectors"),
      info: encoder.encode("v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealConnectorSecret(
  value: unknown,
  scope: { organizationId: string; connector: string },
  env: Record<string, string | undefined> = process.env,
) {
  const id: KeyId = env["CONNECTOR_ENCRYPTION_KEY"] ? "env" : "svc";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(`${scope.organizationId}:${scope.connector}`),
    },
    await key(id, env),
    encoder.encode(JSON.stringify(value)),
  );
  return `v1.${id}.${base64url(iv)}.${base64url(new Uint8Array(sealed))}`;
}

export async function openConnectorSecret<T>(
  sealed: string,
  scope: { organizationId: string; connector: string },
  env: Record<string, string | undefined> = process.env,
): Promise<T> {
  const [version, id, iv, body] = sealed.split(".");
  if (version !== "v1" || (id !== "env" && id !== "svc") || !iv || !body)
    throw new Error("Saved login is in an unknown format. Save it again.");
  try {
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64url(iv),
        additionalData: encoder.encode(`${scope.organizationId}:${scope.connector}`),
      },
      await key(id, env),
      fromBase64url(body),
    );
    return JSON.parse(decoder.decode(opened)) as T;
  } catch {
    throw new Error("Saved login could not be unlocked. Save it again.");
  }
}

export function randomToken(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function pkceChallenge(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}
