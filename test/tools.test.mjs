import test from "node:test";
import assert from "node:assert/strict";
import { schnorr } from "@noble/curves/secp256k1.js";
import { ownerAttested } from "../src/auth.mjs";
import { callTool, publish } from "../src/tools.mjs";

const hex = (byte) => byte.repeat(64);
const channel = hex("a"), root = hex("b"), other = hex("c"), author = hex("d");
const key = new Uint8Array(32);
key[31] = 1;
const owner = Buffer.from(schnorr.getPublicKey(key)).toString("hex");
const base = { pubkey: author, kind: 9, created_at: 100, tags: [] };
async function authorized(conditions = "", target = author) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nostr:agent-auth:${target}:${conditions}`)));
  const signature = Buffer.from(schnorr.sign(digest, key)).toString("hex");
  return { ...base, pubkey: target, tags: [["auth", owner, conditions, signature]] };
}

function message(id, time, destination = channel, thread, extra = {}) {
  return { id, kind: 9, pubkey: author, created_at: time, content: `message ${time}`, tags: [["h", destination], ...(thread ? [["e", thread, "", "reply"]] : [])], ...extra };
}
function host(events = []) {
  const published = [], queried = [];
  return {
    published, queried,
    async publish(event) { published.push(event); return { ...event, id: hex("f") }; },
    async query(filters) {
      queried.push(filters);
      return events.filter((event) => filters.some((filter) =>
        (!filter.ids || filter.ids.includes(event.id))
        && (!filter.kinds || filter.kinds.includes(event.kind))
        && (!filter["#h"] || event.tags.some((tag) => tag[0] === "h" && filter["#h"].includes(tag[1])))
        && (!filter["#e"] || event.tags.some((tag) => tag[0] === "e" && filter["#e"].includes(tag[1])))));
    },
  };
}
const text = (result) => result.content[0].text;

// These tests exercise cryptographically signed delegations, not a stub verifier.
test("owner authorization binds delegation to key, kind, and strict time bounds", async () => {
  assert.equal(await ownerAttested({ ...base, pubkey: owner }, owner), true);
  assert.equal(await ownerAttested(base, owner), false);
  const event = await authorized("kind=9&created_at>99&created_at<101");
  assert.equal(await ownerAttested(event, owner), true);
  for (const changed of [{ created_at: 99 }, { created_at: 101 }, { kind: 1 }, { pubkey: hex("e") }]) {
    assert.equal(await ownerAttested({ ...event, ...changed }, owner), false);
  }
  assert.equal(await ownerAttested(await authorized(), owner), true);
  assert.equal(await ownerAttested(event, hex("f")), false);
  const broken = structuredClone(event);
  broken.tags[0][3] = "0".repeat(128);
  assert.equal(await ownerAttested(broken, owner), false);
  assert.equal(await ownerAttested({ ...event, tags: [...event.tags, ...event.tags] }, owner), false);
  assert.equal(await ownerAttested({ ...event, tags: [[...event.tags[0], "extra"]] }, owner), false);
  for (const conditions of ["kind=65536", "created_at<4294967296", "kind=09", "kind=-1", "created_at<=101", "kind=9&", "unknown=1", "created_at<9999999999999999999999999999999999"]) {
    assert.equal(await ownerAttested(await authorized(conditions), owner), false, conditions);
  }
  for (const event of [null, { ...base, pubkey: owner, kind: NaN }, { ...base, pubkey: owner, created_at: -1 }, { ...base, tags: [null] }]) {
    assert.equal(await ownerAttested(event, owner), false);
  }
});


test("sending defaults to current thread; explicit channels select top-level destinations", async () => {
  const agent = host();
  const sent = [];
  const context = { agent, channel, root, onSend: (event) => sent.push(event) };
  assert.equal((await callTool("buzz_send", { text: "hello" }, context)).isError, undefined);
  assert.deepEqual(agent.published[0], { kind: 9, content: "hello", tags: [["h", channel], ["e", root, "", "reply"]] });
  await callTool("buzz_send", { channel: other, text: "elsewhere" }, context);
  await callTool("buzz_send", { channel, text: "top" }, context);
  assert.deepEqual(agent.published[1].tags, [["h", other]]);
  assert.deepEqual(agent.published[2].tags, [["h", channel]]);
  assert.equal(sent.length, 3);
  assert.equal(agent.queried.length, 0);
});

test("explicit replies resolve channel and root with last valid NIP-10 markers", async () => {
  const reply = message(hex("1"), 3, other, root);
  reply.tags.push(["e", hex("2"), "", "root"], ["e", hex("3"), "", "root"]);
  const agent = host([reply]);
  await callTool("buzz_send", { reply: reply.id, text: "reply" }, { agent, channel, root });
  assert.deepEqual(agent.published[0].tags, [["h", other], ["e", hex("3"), "", "reply"]]);
  assert.equal((await callTool("buzz_send", { channel, reply: reply.id, text: "wrong channel" }, { agent })).isError, true);
  assert.equal(agent.published.length, 1);
  const lone = message(hex("4"), 4, other);
  lone.tags.push(["e", root, "", "root"]);
  const standalone = host([lone]);
  assert.equal((await callTool("buzz_send", { thread: lone.id, text: "thread" }, { agent: standalone })).isError, undefined);
  assert.deepEqual(standalone.published[0].tags, [["h", other], ["e", lone.id, "", "reply"]]);
});

test("Solo top-level policy overrides context root and rejects explicit local threads", async () => {
  const agent = host([message(root, 1), message(hex("1"), 2, other)]);
  const context = { agent, channel, root, topLevel: true };
  await callTool("buzz_send", { text: "top" }, context);
  assert.deepEqual(agent.published[0].tags, [["h", channel]]);
  for (const args of [{ thread: root }, { reply: root }, { channel, reply: root }]) {
    assert.equal((await callTool("buzz_send", { ...args, text: "nested" }, context)).isError, true);
  }
  await callTool("buzz_send", { reply: hex("1"), text: "other thread" }, context);
  assert.deepEqual(agent.published[1].tags, [["h", other], ["e", hex("1"), "", "reply"]]);
});

test("reads are scoped, deduplicated, bounded, sorted, and include the root without secrets", async () => {
  const first = message(root, 1, channel, undefined, { privateKey: "never expose" });
  const old = message(hex("1"), 2, channel, root);
  const newer = message(hex("2"), 3, channel, root);
  const newest = message(hex("3"), 3, channel, root);
  const unrelated = message(hex("4"), 4, channel, other);
  unrelated.tags.push(["e", root, "", "mention"]);
  const agent = host([newest, newer, first, old, newer, unrelated, message(hex("5"), 5, other, root)]);
  const context = { agent, channel, root };
  const result = await callTool("buzz_read", { limit: 3 }, context);
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(text(result)).map((event) => event.id), [root, newer.id, newest.id]);
  assert.equal(text(result).includes("privateKey"), false);
  assert.equal(text(result).includes("never expose"), false);
  assert.deepEqual(agent.queried[0].map((filter) => filter["#h"]), [[channel], [channel]]);
  assert.equal(agent.queried[0][0].limit, 3);
  assert.deepEqual(JSON.parse(text(await callTool("buzz_read", { limit: 1 }, context))).map((event) => event.id), [root]);
  await callTool("buzz_read", { channel }, context);
  assert.equal(agent.queried.at(-1)[0]["#e"], undefined);
  await callTool("buzz_read", {}, { ...context, topLevel: true });
  assert.equal(agent.queried.at(-1)[0]["#e"], undefined);
  const standalone = await callTool("buzz_read", { thread: newer.id }, { agent });
  assert.equal(standalone.isError, undefined);
  assert.equal(JSON.parse(text(standalone))[0].id, root);
});

test("invalid inputs and missing standalone destinations never publish", async () => {
  const agent = host();
  for (const [name, args] of [
    ["unknown", {}], ["buzz_read", null], ["buzz_read", []], ["buzz_read", { extra: true }],
    ...[0, 101, 1.5, "2", null, NaN].map((limit) => ["buzz_read", { limit }]),
    ...["", " ", "x".repeat(50001), 1, null].map((value) => ["buzz_send", { text: value }]),
    ["buzz_send", { text: "x", channel: "not-hex" }], ["buzz_send", { text: "x", thread: root, reply: root }],
    ["buzz_send", { text: "x", secret: "no" }],
  ]) {
    assert.equal((await callTool(name, args, { agent, channel, root })).isError, true, JSON.stringify(args));
  }
  assert.equal((await callTool("buzz_send", { text: "nowhere" }, { agent })).isError, true);
  assert.equal((await callTool("buzz_read", {}, { agent })).isError, true);
  assert.equal(agent.published.length, 0);
  assert.equal(agent.queried.length, 0);
  await assert.rejects(publish(agent, "invalid", root, "x"));
  await assert.rejects(publish(agent, channel, root, ""));
});

test("cancellation prevents sends and interrupts queries without publishing afterwards", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  const agent = host();
  const context = { agent, channel, root, signal: controller.signal };
  assert.equal((await callTool("buzz_send", { text: "no" }, context)).isError, true);
  assert.equal((await callTool("buzz_read", {}, context)).isError, true);
  assert.equal(agent.published.length, 0);
  assert.equal(agent.queried.length, 0);
  const pending = new AbortController();
  let resolveQuery;
  let started;
  const querying = new Promise((resolve) => { started = resolve; });
  agent.query = () => { started(); return new Promise((resolve) => { resolveQuery = resolve; }); };
  const result = callTool("buzz_send", { reply: other, text: "no" }, { agent, channel, signal: pending.signal });
  await querying;
  pending.abort(new Error("stopped"));
  assert.equal((await result).isError, true);
  resolveQuery([message(other, 1)]);
  await Promise.resolve();
  assert.equal(agent.published.length, 0);
});

test("successful publishes notify fallback suppression even when cancellation races completion", async () => {
  const controller = new AbortController();
  let sends = 0, fallbackSuppressed = false;
  const agent = {
    async publish(event) { sends++; controller.abort(); return { ...event, id: hex("f") }; },
  };
  const result = await callTool("buzz_send", { text: "answer" }, {
    agent, channel, root, signal: controller.signal,
    onSend(event) { assert.equal(event.id, hex("f")); fallbackSuppressed = true; },
  });
  assert.equal(result.isError, undefined);
  assert.equal(fallbackSuppressed, true);
  if (!fallbackSuppressed) await publish(agent, channel, root, "fallback");
  assert.equal(sends, 1);
  let notified = false;
  const failed = await callTool("buzz_send", { text: "answer" }, {
    agent: { async publish() { throw new Error("relay rejected"); } }, channel,
    onSend() { notified = true; },
  });
  assert.equal(failed.isError, true);
  assert.equal(notified, false);
});
