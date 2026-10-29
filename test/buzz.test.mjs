import test from "node:test";
import assert from "node:assert/strict";
import { buzzTools } from "../src/buzz.mjs";

const owner = "a".repeat(64), pubkey = "b".repeat(64), root = "d".repeat(64);
const channel = "7d35f5f6-8394-4dc4-9039-555f463c0e88";
const message = { id: root, kind: 9, pubkey: owner, created_at: 1, content: "hello", tags: [["h", channel]] };
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1l8AAAAASUVORK5CYII=";
const text = (result) => result.content[0].text;
function fixture(options = {}) {
  const posts = [], reads = [], writes = [], uploads = [];
  const objects = new Map();
  let enabled = true, plugins = [];
  const attention = {
    enabled: () => enabled, classifier: () => "unavailable",
    interests: () => [...objects.keys()].filter((key) => key.startsWith("interest/")).map((key) => key.slice(9)),
    watches: () => [],
    show: async (slug) => ({ object: objects.get(slug) ?? null, expected_state: objects.has(slug) ? "object-v1:current" : "object-v1:absent" }),
    write: async (slug, value, opts) => {
      const current = objects.has(slug) ? "object-v1:current" : "object-v1:absent";
      if (opts.expected !== current) throw new Error("conflict: stale expected_state");
      writes.push({ slug, value, opts });
      if (value) objects.set(slug, value); else objects.delete(slug);
      return attention.show(slug);
    },
  };
  const agent = { pubkey, owner, attention,
    query: async (filters) => filters.some((filter) => filter.ids?.includes(root)) ? [message] : [],
    publish: async (event) => { posts.push(event); return { ...event, id: "f".repeat(64) }; },
    upload: async (data, mime) => { uploads.push({ data, mime }); return { url: "https://community.invalid/media/file.txt", sha256: "f".repeat(64), size: 5, type: "text/plain" }; },
    media: async () => ({ path: "/workspace/image.png", type: "image/png", size: 68, data: png }),
    remember: async (slug, body, after) => { writes.push({ slug, body, after }); },
  };
  const session = { agentMemories: { read: async (agentKey, signal, slug) => {
    assert.equal(agentKey, pubkey); signal.throwIfAborted();
    return { entries: [{ slug: slug ?? "core", body: "saved memory", createdAt: 1 }], partial: false };
  } } };
  let snapshot = { status: "ready", viewer: owner, origin: "https://community.invalid", session };
  const agents = { relay: () => ({ snapshot: () => snapshot }), tools: () => plugins };
  const host = { readFile: async (path, opts) => { reads.push({ path, ...opts }); return new TextEncoder().encode("hello"); } };
  const bridge = buzzTools({ agent, agents, host, workspace: "/workspace", context: { channel, root }, ...options });
  return { bridge, agent, agents, host, posts, reads, writes, uploads,
    setEnabled: (value) => { enabled = value; }, setPlugins: (value) => { plugins = value; },
    disconnect: () => { snapshot = { ...snapshot, session: {} }; } };
}

test("standard Buzz tools and shared Attention schemas reach OMP", () => {
  const { bridge } = fixture();
  const names = new Set(bridge.tools.map((tool) => tool.name));
  for (const name of ["send", "read", "channels", "canvas", "media_get", "mem_get", "mem_set", "notes_get", "repo", "interest_set", "watch_add", "watch_list"])
    assert(names.has(`buzz_${name}`), name);
  assert.equal(bridge.tools.length, names.size);
  assert(bridge.tools.every((tool) => tool.parameters.type === "object"));
});

test("Buzz tools select the membership's connection while memory still uses its public identity", async () => {
  const f = fixture();
  f.agent.key = `${pubkey}@another.invalid`;
  const relay = f.agents.relay;
  f.agents.relay = (key) => { assert.equal(key, f.agent.key); return relay(); };
  const bridge = buzzTools({ agent: f.agent, agents: f.agents, host: f.host, workspace: "/workspace" });
  assert.match(text(await bridge.call("buzz_mem_get", { slug: "core" })), /saved memory/);
  assert.equal((await bridge.call("buzz_send", { channel, text: "Other community" })).isError, undefined);
  assert.equal(f.posts.length, 1);
});

test("Attention uses the live owner switch, expected-state tokens and standard watch fields", async () => {
  const f = fixture();
  assert.match(f.bridge.note(), /no Interests/);
  let result = await f.bridge.call("buzz_interest_set", { id: "release", instructions: "Watch the release", expected_state: "object-v1:absent" });
  assert.equal(result.isError, undefined, text(result));
  assert.match(f.bridge.note(), /review your Interests/);
  result = await f.bridge.call("buzz_watch_add", { id: "check", interest: "release", type: "timer", channel,
    prompt: "Check release status", interval_secs: 60, expected_state: "object-v1:absent" });
  assert.equal(result.isError, undefined, text(result));
  assert.deepEqual(f.writes.at(-1).opts, { expected: "object-v1:absent", interest: "release" });
  assert.equal(f.writes.at(-1).value.channel, channel);
  assert.equal(f.writes.at(-1).value.max_occurrences, 1);
  assert.equal((await f.bridge.call("buzz_interest_set", { id: "release", instructions: "stale", expected_state: "object-v1:absent" })).isError, true);
  const listed = JSON.parse(text(await f.bridge.call("buzz_interest_list", {})));
  assert.deepEqual(listed.interests, ["release"]);
  assert.equal(listed.classifier, "unavailable");
  f.setEnabled(false);
  assert.match(f.bridge.note(), /attention off/);
  assert.match(text(await f.bridge.call("buzz_interest_list", {})), /Attention is off/);
  assert.equal(f.writes.length, 2);
});

test("files use the configured workspace and native upload, media and memory handles", async () => {
  let sent = 0;
  const f = fixture({ onSend: () => { sent++; } });
  const result = await f.bridge.call("buzz_send", { files: ["report.txt"] });
  assert.equal(result.isError, undefined, text(result));
  assert.deepEqual(f.reads, [{ path: "report.txt", cwd: "/workspace" }]);
  assert.equal(f.uploads[0].data, Buffer.from("hello").toString("base64"));
  assert.equal(f.posts[0].tags.find(([name]) => name === "h")[1], channel);
  assert.equal(sent, 1);
  const media = await f.bridge.call("buzz_media_get", { url: "https://community.invalid/media/image.png" });
  assert.equal(media.isError, undefined, text(media));
  assert.deepEqual(media.content[0], { type: "image", data: png, mimeType: "image/png" });
  assert.match(text(await f.bridge.call("buzz_mem_get", { slug: "core" })), /saved memory/);
  assert.equal((await f.bridge.call("buzz_mem_set", { slug: "core", text: "new memory" })).isError, undefined);
  assert.deepEqual(f.writes.at(-1), { slug: "core", body: "new memory", after: 1 });
});

test("legacy send arguments and send completion suppress fallback, including cancellation", async () => {
  const controller = new AbortController();
  let sent = 0;
  const f = fixture({ signal: controller.signal, onSend: () => { sent++; } });
  const original = f.agent.publish;
  f.agent.publish = async (event) => { const result = await original(event); controller.abort(); return result; };
  const result = await f.bridge.call("buzz_send", { thread: root, text: "reply" });
  assert.equal(result.isError, undefined, text(result));
  assert.equal(sent, 1);
  assert(f.posts[0].tags.some((tag) => tag[0] === "e" && tag[1] === root && tag[3] === "reply"));
  assert.equal((await f.bridge.call("buzz_send", { text: "late" })).isError, true);
  assert.equal(f.posts.length, 1);
});

test("only successful reactions count as a reaction response, including removal", async () => {
  let reacted = 0, sent = 0;
  const f = fixture({ onReaction: () => { reacted++; }, onSend: () => { sent++; } });
  assert.equal((await f.bridge.call("buzz_interest_list", {})).isError, undefined);
  assert.equal(reacted, 0);
  assert.equal(text(await f.bridge.call("buzz_react", { id: root, emoji: "👍" })), "reacted");
  assert.equal(reacted, 1);
  assert.deepEqual(f.posts[0], { kind: 7, content: "👍", tags: [["e", root]] });
  f.agent.query = async () => [{ id: "f".repeat(64), ...f.posts[0] }];
  assert.equal(text(await f.bridge.call("buzz_react", { id: root, emoji: "👍", off: true })), "removed");
  assert.equal(reacted, 2);
  assert.equal(f.posts[1].kind, 5);
  f.agent.query = async () => [];
  assert.equal(text(await f.bridge.call("buzz_react", { id: root, emoji: "👍", off: true })), "no such reaction");
  assert.equal(reacted, 3, "Removing an already-absent reaction is an idempotent success");
  f.agent.publish = async () => { throw new Error("Reaction refused"); };
  assert.equal((await f.bridge.call("buzz_react", { id: root, emoji: "👍" })).isError, true);
  assert.equal(reacted, 3);
  assert.equal(sent, 0, "Reactions must not suppress a final textual answer");
});

test("added tools receive the Buzz client and disappear when their plugin unloads", async () => {
  const f = fixture();
  let called = 0;
  f.setPlugins([{ name: "demo_probe", description: "Probe", inputSchema: { type: "object" },
    call: async (client, context, args) => { called++; assert.equal(client.pubkey, pubkey); assert.equal(context.channel, channel); return args.text; } }]);
  const bridge = buzzTools({ agent: f.agent, agents: f.agents, host: f.host, workspace: "/workspace", context: { channel } });
  assert(bridge.tools.some((tool) => tool.name === "buzz_demo_probe"));
  assert.equal(text(await bridge.call("buzz_demo_probe", { text: "ok" })), "ok");
  f.setPlugins([]);
  assert.equal((await bridge.call("buzz_demo_probe", { text: "late" })).isError, true);
  assert.equal(called, 1);
  f.disconnect();
  assert.equal((await bridge.call("buzz_send", { text: "stale connection" })).isError, true);
  assert.equal(f.posts.length, 0);
});

test("cancellation after an Attention read prevents the subsequent write", async () => {
  const controller = new AbortController();
  const f = fixture({ signal: controller.signal });
  f.agent.attention.show = async () => { controller.abort(); return { object: null, expected_state: "object-v1:absent" }; };
  const result = await f.bridge.call("buzz_watch_add", { id: "check", interest: "release", type: "timer", prompt: "Check", interval_secs: 60, expected_state: "object-v1:absent" });
  assert.equal(result.isError, true);
  assert.equal(f.writes.length, 0);
});
