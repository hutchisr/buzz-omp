import assert from "node:assert/strict";
import { test } from "node:test";
import { Runtime, config } from "../src/runtime.mjs";

test("automatic thinking survives saved config without becoming the inherited default", () => {
  assert.equal(config({ effort: "auto" }).effort, "auto");
  assert.equal(config({ effort: "" }).effort, "");
  assert.equal(config({ effort: "unsupported" }).effort, "");
});

const owner = "a".repeat(64), pubkey = "b".repeat(64), channelId = "7d35f5f6-8394-4dc4-9039-555f463c0e88", root = "d".repeat(64), reply = "e".repeat(64);
function setup(channelType = "channel") {
  const storage = new Map();
  const agent = { pubkey, owner, config: { scope: "thread" } };
  const session = { channels: { get: () => ({ channelType }) } };
  const agents = { storage: { get: (key) => storage.get(key), set: async (key, value) => storage.set(key, value) },
    relay: () => ({ snapshot: () => ({ status: "ready", viewer: owner, origin: "https://community.invalid",
      session }) }) };
  return { runtime: new Runtime({}, agents), agent, agents };
}
function memberships() {
  const f = setup();
  const home = { ...f.agent, key: pubkey };
  const away = { ...f.agent, key: `${pubkey}@other.invalid` };
  const otherChannel = "027684d6-b3a4-4974-b1c9-27fa3c7b8b5e";
  const connection = (origin, id, channelType) => ({ status: "ready", viewer: owner, origin,
    session: { channels: { get: (key) => key === id ? { id, channelType } : undefined, list: () => ({ channels: [] }) } } });
  const snapshots = new Map([[home.key, connection("https://home.invalid", channelId, "channel")],
    [away.key, connection("https://other.invalid", otherChannel, "solo")]]);
  f.agents.relay = (key) => ({ snapshot: () => snapshots.get(key) });
  return { ...f, home, away, otherChannel };
}
test("an agent in another community routes and reads memory through that membership", async () => {
  const { runtime, agents, home, away, otherChannel } = memberships();
  const posts = [], cores = [];
  away.query = async () => [];
  away.publish = async (event) => { posts.push(event); return { id: reply }; };
  agents.core = async (key) => { cores.push(key); return "Other community memory"; };
  runtime.host = {
    resolveDirectory: async (path) => path,
    async spawn(_id, options) {
      const emit = (frame) => options.onStdout(`${JSON.stringify(frame)}\n`);
      emit({ type: "ready", protocolVersion: 1 });
      return { exited: new Promise(() => {}), kill: async () => {}, write: async (line) => {
        const command = JSON.parse(line);
        emit({ type: "response", command: command.type, id: command.id, success: true, data: {} });
        if (command.type !== "prompt") return;
        emit({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Here" }] } });
        emit({ type: "prompt_result", id: command.id, status: "completed", agentInvoked: true, sessionSettled: true });
      } };
    },
  };
  let work;
  await runtime.run({ agent: away, config: {}, signal: new AbortController().signal, current: () => true,
    trigger: { type: "mention", event: { id: root, pubkey: owner, kind: 9, created_at: 1, tags: [["h", otherChannel]], content: "Hi" } },
    workingUntil: (value) => { work = value; } });
  assert.deepEqual(await work, { ok: true });
  assert.deepEqual(cores, [away.key]);
  assert.deepEqual(posts[0].tags, [["h", otherChannel]], "Solo reply stays top-level");
  assert.equal(runtime.sessions(home.key).length, 0);
  assert.equal(runtime.sessions(away.key)[0].channelId, otherChannel);
  await runtime.dispose();
});
test("membership jobs do not serialize or stop another community's standalone turn", async () => {
  const { runtime, home, away } = memberships();
  let release, awaySignal;
  const blocked = new Promise((resolve) => { release = resolve; });
  const first = runtime.enqueue(home, "once:watch", undefined, () => blocked);
  const second = runtime.enqueue(away, "once:watch", undefined, async (job) => { awaySignal = job.signal; await blocked; });
  await Promise.resolve(); await Promise.resolve();
  assert(awaySignal, "Other membership starts without waiting on the home membership");
  runtime.sync([away]);
  assert.equal(runtime.job(home.key, "once:watch").signal.aborted, true);
  assert.equal(awaySignal.aborted, false);
  release(); await Promise.all([first, second]); await runtime.dispose();
});
test("membership indexes preserve legacy community history without modifying the home index", async () => {
  const { runtime, agents, home, away, otherChannel } = memberships();
  const places = [runtime.place(home, channelId, root), runtime.place(away, otherChannel)];
  const legacy = JSON.stringify(places.map(({ key, origin, channelId, root }) => ({ key, origin, channelId, root, epoch: 3, at: 1 })));
  await agents.storage.set(`local.omp.sessions.v1:${pubkey}`, legacy);
  const relay = agents.relay;
  agents.relay = (key) => key === away.key ? undefined : relay(key);
  assert.deepEqual(runtime.sessions(away.key), [], "Opening Activity before connection must not discard old history");
  agents.relay = relay;
  assert.equal(runtime.sessions(away.key).length, 1);
  assert.equal(runtime.sessions(away.key)[0].epoch, 3);
  await runtime.control(away, { channelId: otherChannel }, "new");
  assert.equal(agents.storage.get(`local.omp.sessions.v1:${pubkey}`), legacy);
  const restarted = new Runtime({}, agents);
  assert.equal(restarted.sessions(away.key)[0].epoch, 4);
  assert.equal(restarted.sessions(home.key)[0].epoch, 3);
  await Promise.all([runtime.dispose(), restarted.dispose()]);
});
test("thread routing follows reply markers, while shared sessions retain each turn's reply destination", () => {
  const { runtime, agent } = setup();
  const delivery = { agent, config: agent.config, trigger: { type: "mention", event: { id: reply,
    tags: [["h", channelId], ["e", root, "", "root"]] } } };
  assert.equal(runtime.route(delivery).root, reply, "a lone root marker is not a reply");
  delivery.trigger.event.tags.push(["e", reply, "", "reply"]);
  assert.equal(runtime.route(delivery).root, root);
  delivery.config = { scope: "channel" };
  const shared = runtime.route(delivery);
  assert.equal(shared.root, undefined);
  assert.equal(shared.replyRoot, root);
  const solo = setup("solo").runtime.route(delivery);
  assert.equal(solo.root, undefined);
  assert.equal(solo.replyRoot, undefined);
  assert.equal(solo.topLevel, true);
});
test("routing accepts UUID and legacy hex channels but still requires hex thread IDs", () => {
  const { runtime, agent } = setup();
  for (const channel of [channelId, "c".repeat(64)]) {
    assert.equal(runtime.place(agent, channel, root).channelId, channel);
  }
  for (const invalid of ["", "not-a-channel", `${channelId}/extra`, `${channelId}\n`]) {
    assert.throws(() => runtime.place(agent, invalid, root), /Invalid Buzz conversation ID/);
  }
  assert.throws(() => runtime.place(agent, channelId, channelId), /Invalid Buzz conversation ID/);
});
test("addressed Attention routes channel and thread destinations without synthetic event IDs", () => {
  const { runtime, agent } = setup();
  const delivery = { agent, config: {}, trigger: { type: "attention", channel: channelId, id: "attention:timer", text: "Check" } };
  assert.equal(runtime.route(delivery).replyRoot, undefined);
  assert.equal(runtime.route(delivery).topLevel, false, "Channel delivery can still explicitly reply to a thread");
  delivery.trigger.root = root;
  assert.equal(runtime.route(delivery).replyRoot, root);
  assert.equal(setup("solo").runtime.route(delivery).replyRoot, undefined);
});

test("addressed Attention rebuilds its prompt after readiness and never auto-posts quiet output", async () => {
  for (const stale of [false, true]) {
    const { runtime, agent } = setup();
    let ready = false, refreshed = 0, ignored = false, work;
    const prompts = [];
    agent.query = async () => [];
    agent.publish = async () => assert.fail("Attention final text must not be posted automatically");
    agent.attention = { enabled: () => true, interests: () => ["release"] };
    runtime.agents.core = async () => null;
    runtime.host = {
      resolveDirectory: async (path) => path,
      async spawn(_id, options) {
        const emit = (frame) => options.onStdout(`${JSON.stringify(frame)}\n`);
        emit({ type: "ready", protocolVersion: 1 });
        ready = true;
        return { exited: new Promise(() => {}), kill: async () => {}, write: async (line) => {
          const command = JSON.parse(line);
          emit({ type: "response", command: command.type, id: command.id, success: true, data: {} });
          if (command.type === "set_host_tools") assert(command.tools.some((tool) => tool.name === "buzz_watch_add"));
          if (command.type !== "prompt") return;
          prompts.push(command.message);
          emit({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "No change" }] } });
          emit({ type: "prompt_result", id: command.id, status: "completed", agentInvoked: true, sessionSettled: true });
        } };
      },
    };
    await runtime.run({ agent, config: {}, signal: new AbortController().signal, current: () => true,
      trigger: { type: "attention", channel: channelId, text: "outdated instructions", id: "attention:timer" },
      wakeText: async () => { assert(ready); refreshed++; return stale ? undefined : "<interest>Fresh instructions</interest>"; },
      ignored: () => { ignored = true; }, workingUntil: (value) => { work = value; } });
    assert.deepEqual(await work, { ok: true });
    assert.equal(refreshed, 1);
    assert.equal(ignored, stale);
    assert.equal(prompts.length, stale ? 0 : 1);
    if (!stale) {
      assert.match(prompts[0], /<interest>Fresh instructions<\/interest>/);
      assert.match(prompts[0], /review your Interests/);
      assert(!prompts[0].includes("Authorized triggering message"));
      assert(!prompts[0].includes("outdated instructions"));
    }
    await runtime.dispose();
  }
});
test("same-session work serializes and a stopped queued turn never executes", async () => {
  const { runtime, agent } = setup();
  let release, stop;
  const blocked = new Promise((resolve) => { release = resolve; });
  const order = [];
  const first = runtime.enqueue(agent, "thread", undefined, async () => { order.push("first"); await blocked; });
  const second = runtime.enqueue(agent, "thread", undefined, async () => { order.push("cancelled"); }, "Working", (action) => { stop = action; });
  const separate = runtime.enqueue(agent, "other", undefined, async () => { order.push("other"); });
  await separate;
  assert.deepEqual(order, ["first", "other"]);
  await stop(); release(); await first;
  assert.deepEqual(await second, { ok: true, stopped: true });
  assert.deepEqual(order, ["first", "other"]);
  await runtime.dispose();
});
test("an expired host deadline is a failure, not a successful user Stop", async () => {
  const { runtime, agent } = setup();
  const expired = AbortSignal.abort(new DOMException("Turn deadline expired", "TimeoutError"));
  await assert.rejects(runtime.enqueue(agent, "thread", expired, () => assert.fail("expired work ran"), "Working", () => {}),
    { name: "TimeoutError" });
  await runtime.dispose();
});
test("New session preserves old history by changing the durable generation", async () => {
  const { runtime, agent, agents } = setup();
  await runtime.control(agent, { channelId, root }, "new");
  const place = runtime.place(agent, channelId, root);
  assert.equal(runtime.saved(pubkey).get(place.key).epoch, 1);
  const restarted = new Runtime({}, agents);
  assert.equal(restarted.saved(pubkey).get(place.key).epoch, 1);
  assert.equal(restarted.sessions(pubkey)[0].channelId, channelId);
  await restarted.control(agent, { channelId, root }, "new");
  assert.equal(restarted.saved(pubkey).get(place.key).epoch, 2);
  await Promise.all([runtime.dispose(), restarted.dispose()]);
});
test("untrusted mentions never start a local process", async () => {
  const { runtime, agent } = setup();
  let ignored = false;
  await runtime.run({ agent, trigger: { type: "mention", event: { id: root, pubkey: reply, kind: 9, created_at: 1, tags: [["h", channelId]] } }, ignored: () => { ignored = true; } });
  assert.equal(ignored, true);
  assert.equal(runtime.jobs.size, 0);
});

test("a recovered OMP retry posts its final answer, not the earlier error or progress text", async () => {
  const { runtime, agent } = setup();
  const posts = [];
  agent.query = async () => [];
  agent.publish = async (event) => { posts.push(event); return { id: reply }; };
  runtime.agents.core = async () => null;
  runtime.host = {
    resolveDirectory: async (path) => path,
    async spawn(_id, options) {
      const emit = (frame) => options.onStdout(`${JSON.stringify(frame)}\n`);
      emit({ type: "ready", protocolVersion: 1 });
      return { exited: new Promise(() => {}), kill: async () => {}, write: async (line) => {
        const command = JSON.parse(line);
        emit({ type: "response", command: command.type, id: command.id, success: true, data: {} });
        if (command.type !== "prompt") return;
        for (const message of [
          { stopReason: "error", errorMessage: "Temporary provider failure", content: [] },
          { stopReason: "toolUse", content: [{ type: "text", text: "Working…" }] },
          { stopReason: "stop", content: [{ type: "text", text: "Recovered answer" }] },
        ]) emit({ type: "message_end", message: { role: "assistant", ...message } });
        emit({ type: "prompt_result", id: command.id, agentInvoked: true, status: "completed", sessionSettled: true });
      } };
    },
  };
  let work;
  await runtime.run({ agent, config: {}, signal: new AbortController().signal, current: () => true,
    trigger: { type: "mention", event: { id: root, pubkey: owner, kind: 9, created_at: 1, tags: [["h", channelId]], content: "Answer" } },
    workingUntil: (done) => { work = done; } });
  assert.deepEqual(await work, { ok: true });
  assert.deepEqual(posts.map((post) => post.content), ["Recovered answer"]);
  await runtime.dispose();
});

test("reaction-only completion is silent, while written answers and real failures are preserved", async () => {
  for (const scenario of ["silent", "text", "failed-reaction", "provider-error", "empty"]) {
    const { runtime, agent } = setup();
    const posts = [];
    let work, toolResult;
    agent.query = async () => [];
    agent.publish = async (event) => {
      if (scenario === "failed-reaction" && event.kind === 7) throw new Error("Reaction refused");
      posts.push(event); return { ...event, id: reply };
    };
    runtime.agents.core = async () => null;
    runtime.host = {
      resolveDirectory: async (path) => path,
      async spawn(_id, options) {
        const emit = (frame) => options.onStdout(`${JSON.stringify(frame)}\n`);
        const finish = (id) => {
          const failed = scenario === "provider-error";
          emit({ type: "message_end", message: { role: "assistant", stopReason: failed ? "error" : "stop",
            ...(failed && { errorMessage: "Provider unavailable" }), content: [{ type: "text", text: scenario === "text" ? "Written answer" : "" }] } });
          emit({ type: "prompt_result", id, status: "completed", agentInvoked: true, sessionSettled: true });
        };
        let promptId;
        emit({ type: "ready", protocolVersion: 1 });
        return { exited: new Promise(() => {}), kill: async () => {}, write: async (line) => {
          const command = JSON.parse(line);
          if (command.type === "host_tool_result") {
            toolResult = command;
            finish(promptId);
            return;
          }
          emit({ type: "response", command: command.type, id: command.id, success: true, data: {} });
          if (command.type !== "prompt") return;
          promptId = command.id;
          if (scenario === "empty") finish(promptId);
          else emit({ type: "host_tool_call", id: "reaction", toolName: "buzz_react", arguments: { id: root, emoji: "👍" } });
        } };
      },
    };
    await runtime.run({ agent, config: {}, signal: new AbortController().signal, current: () => true,
      trigger: { type: "mention", event: { id: root, pubkey: owner, kind: 9, created_at: 1, tags: [["h", channelId]], content: "React without text" } },
      workingUntil: (value) => { work = value; } });
    const result = await work;
    const failed = ["failed-reaction", "provider-error", "empty"].includes(scenario);
    assert.equal(result.ok, !failed, `${scenario}: ${JSON.stringify(result)}`);
    if (scenario === "failed-reaction") assert.equal(toolResult.isError, true);
    if (scenario === "silent") {
      assert.deepEqual(posts.map((event) => event.kind), [7]);
      assert.equal(runtime.sessions(pubkey)[0].status, "Idle");
    } else if (scenario === "text") {
      assert.deepEqual(posts.map((event) => event.kind), [7, 9]);
      assert.equal(posts[1].content, "Written answer");
    } else {
      assert.equal(posts.at(-1).kind, 9);
      assert.match(posts.at(-1).content, /couldn’t finish/);
    }
    await runtime.dispose();
  }
});

test("unsaved-agent discovery survives agent sync and stops on caller cancellation", async () => {
  const { runtime } = setup();
  const controller = new AbortController();
  let listed, killed = false;
  const listing = new Promise((resolve) => { listed = resolve; });
  runtime.host = {
    resolveDirectory: async (path) => path,
    async spawn(_id, options) {
      const emit = (frame) => options.onStdout(`${JSON.stringify(frame)}\n`);
      emit({ type: "ready", protocolVersion: 1 });
      return { exited: new Promise(() => {}), kill: async () => { killed = true; }, write: async (line) => {
        const command = JSON.parse(line);
        if (command.type === "get_available_models") { listed(); return; }
        emit({ type: "response", command: command.type, id: command.id, success: true, data: {} });
      } };
    },
  };
  const pending = runtime.models({ config: {} }, controller.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await listing;
  runtime.sync([]);
  assert.equal(killed, false, "An agent not yet created must still be able to choose a model");
  controller.abort();
  await rejected;
  assert.equal(killed, true);
  assert.equal(runtime.jobs.size, 0);
  await runtime.dispose();
});

test("cards share discovery while cancellation detaches only the departing card", async () => {
  const { runtime } = setup();
  const requests = [];
  runtime.models = (_agent, signal) => new Promise((resolve, reject) => {
    requests.push({ resolve, signal });
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const departing = new AbortController();
  const first = runtime.discover("/workspace", departing.signal);
  const rejected = assert.rejects(first, { name: "AbortError" });
  const others = Array.from({ length: 8 }, () => runtime.discover("/workspace"));
  assert.equal(requests.length, 1);
  departing.abort();
  await rejected;
  assert.equal(requests[0].signal.aborted, false);
  requests[0].resolve({ current: "provider/model", models: [] });
  assert.equal((await Promise.all(others)).every((result) => result.current === "provider/model"), true);
  const last = new AbortController();
  const next = runtime.discover("/workspace", last.signal);
  const stopped = assert.rejects(next, { name: "AbortError" });
  assert.equal(requests.length, 2, "Refresh must perform a new discovery");
  last.abort();
  await stopped;
  assert.equal(requests[1].signal.aborted, true);
  await runtime.dispose();
});
