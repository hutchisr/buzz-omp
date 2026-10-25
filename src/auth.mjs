import { schnorr } from "@noble/curves/secp256k1.js";

const KEY = /^[0-9a-f]{64}$/;
const SIG = /^[0-9a-f]{128}$/;
const bytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));

// The host supplies signature-verified relay events; this verifies their NIP-OA delegation.
export async function ownerAttested(event, owner) {
  if (!KEY.test(owner ?? "") || !event || !KEY.test(event.pubkey ?? "")
    || !Number.isInteger(event.kind) || event.kind < 0 || event.kind > 65535
    || !Number.isInteger(event.created_at) || event.created_at < 0 || event.created_at > 4294967295
    || !Array.isArray(event.tags) || !event.tags.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === "string"))) return false;
  if (event.pubkey === owner) return true;
  const auth = event.tags.filter((tag) => tag[0] === "auth");
  if (auth.length !== 1) return false;
  const tag = auth[0];
  if (tag.length !== 4 || tag[1] !== owner || !SIG.test(tag[3])) return false;
  const conditions = tag[2];
  if (conditions && !conditions.split("&").every((clause) => {
    const match = /^(kind=|created_at<|created_at>)(0|[1-9][0-9]*)$/.exec(clause);
    if (!match) return false;
    const value = Number(match[2]);
    if (value > (match[1] === "kind=" ? 65535 : 4294967295)) return false;
    return match[1] === "kind=" ? event.kind === value
      : match[1] === "created_at<" ? event.created_at < value : event.created_at > value;
  })) return false;
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(`nostr:agent-auth:${event.pubkey}:${conditions}`)));
    return schnorr.verify(bytes(tag[3]), digest, bytes(owner));
  } catch { return false; }
}
