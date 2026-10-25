// Runs the installed OMP binary against a local deterministic OpenAI-compatible provider.
// No real provider credentials, network relay, or user sessions are used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runtime } from "../src/runtime.mjs";

const temporary = await mkdtemp(join(tmpdir(), "buzz-omp-smoke-"));
const agentDir = join(temporary, "agent");
const requests = [];
const children = new Set();
const posted = [];
const store = new Map();
const owner = "a".repeat(64), pubkey = "b".repeat(64), channel = "c".repeat(64), root = "d".repeat(64);
let waiting;
const waitingRequest = new Promise((resolve) => { waiting = resolve; });
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) {
    response.writeHead(404); response.end(); return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  requests.push(input);
  const messages = input.messages;
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const prompt = JSON.stringify(messages[lastUser]?.content);
  response.writeHead(200, { "content-type": "text/event-stream" });
  if (prompt.includes("wait-for-interrupt")) { waiting(); return; }
  const toolName = input.tools?.find((tool) => tool.function.name === "buzz_send")?.function.name;
  const toolTurn = prompt.includes("tool-roundtrip") || prompt.includes("standalone-turn");
  const called = messages.slice(lastUser + 1).some((message) => message.role === "tool");
  const tool = toolName && toolTurn && !called;
  const text = prompt.includes("standalone-turn") ? "OMP standalone" : "OMP host tool roundtrip";
  const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${requests.length}`, type: "function",
    function: { name: toolName, arguments: JSON.stringify({ text, ...(prompt.includes("standalone-turn") && { channel }) }) } }] }
    : { role: "assistant", content: toolTurn ? "Already sent." : "OMP persistent reply" };
  const frame = (choices, extra = {}) => `data: ${JSON.stringify({ id: `chatcmpl-${requests.length}`, object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000), model: "smoke", choices, ...extra })}\n\n`;
  response.write(frame([{ index: 0, delta, finish_reason: null }]));
  response.write(frame([{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }],
    { usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
  response.end("data: [DONE]\n\n");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await mkdir(agentDir, { recursive: true });
await writeFile(join(agentDir, "models.yml"), JSON.stringify({ providers: { smoke: {
  baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "smoke-only",
  models: [{ id: "smoke", name: "Smoke", reasoning: false, input: ["text"],
    contextWindow: 128000, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
} } }));
await writeFile(join(agentDir, "config.yml"), "model: smoke/smoke\ncompaction:\n  keepRecentTokens: 1\n  methodOrder: [soft]\n");
const host = {
  async resolveDirectory(path) {
    const resolved = path.startsWith("~/") ? join(temporary, path.slice(2)) : path;
    await mkdir(resolved, { recursive: true }); return resolved;
  },
  async spawn(id, options) {
    assert.equal(id, "omp");
    const child = spawn(process.env.OMP_BIN || "omp", ["--mode", "rpc", "--no-ui", "--no-extensions", "--no-skills", "--no-rules", "--no-lsp", "--no-tools", ...options.args], {
      cwd: options.cwd,
      env: { PATH: process.env.PATH, HOME: temporary, TMPDIR: tmpdir(), LANG: "en_US.UTF-8", PI_CODING_AGENT_DIR: agentDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);
    child.stdout.setEncoding("utf8").on("data", options.onStdout);
    child.stderr.setEncoding("utf8").on("data", options.onStderr);
    const exited = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => { children.delete(child); resolve(code); });
    });
    return { write: (text) => new Promise((resolve, reject) => child.stdin.write(text, (error) => error ? reject(error) : resolve())),
      end: async () => { child.stdin.end(); }, kill: async () => { child.kill("SIGKILL"); await exited; }, exited };
  },
};
const agent = { pubkey, owner, name: "OMP smoke", config: { workspace: "~/.buzz", model: "smoke/smoke", effort: "auto" },
  query: async () => [], publish: async (event) => { const saved = { ...event, id: `${posted.length + 1}`.padStart(64, "0") }; posted.push(saved); return saved; } };
const agents = { storage: { get: (key) => store.get(key), set: async (key, value) => store.set(key, value) }, core: async () => null,
  relay: () => ({ snapshot: () => ({ status: "ready", viewer: owner, origin: "https://smoke.invalid", session: {
    channels: { get: () => ({ id: channel, channelType: "channel", name: "Smoke" }) },
  } }) }) };
let runtime = new Runtime(host, agents);
async function delivery(content, { interrupt = false } = {}) {
  let done, stop;
  const value = { agent, config: agent.config, channelId: channel, signal: AbortSignal.timeout(60_000), current: () => true,
    trigger: { type: "mention", event: { id: root, pubkey: owner, kind: 9, created_at: 1, tags: [["h", channel]], content } },
    workingUntil: (work) => { done = work; }, interruptible: (action) => { stop = action; } };
  await runtime.run(value);
  if (interrupt) { await waitingRequest; await stop(); }
  const result = await done;
  assert.equal(result?.ok, true, JSON.stringify(result));
  if (interrupt) assert.equal(result.stopped, true);
  return value;
}
try {
  const models = await runtime.models(agent);
  assert(models.models.some((model) => model.id === "smoke/smoke"));
  const unsavedModels = await runtime.models({ config: { workspace: agent.config.workspace } });
  assert(unsavedModels.models.some((model) => model.id === "smoke/smoke"));
  assert.equal(requests.length, 0, "Model discovery must not invoke a model");
  await delivery("tool-roundtrip");
  assert.equal(posted.length, 1);
  assert.equal(posted[0].content, "OMP host tool roundtrip");
  assert.deepEqual(posted[0].tags, [["h", channel], ["e", root, "", "reply"]]);
  await runtime.dispose();
  runtime = new Runtime(host, agents);
  await delivery("second-turn");
  assert.equal(posted.at(-1).content, "OMP persistent reply");
  assert(requests.at(-1).messages.some((message) => message.role === "tool"), "OMP must resume persisted host tool history after runtime restart");
  await runtime.control(agent, { channelId: channel, root }, "compact");
  await runtime.control(agent, { channelId: channel, root }, "new");
  await delivery("fresh-turn");
  assert(!requests.at(-1).messages.some((message) => message.role === "tool"), "New must not replay old history");
  const once = await runtime.runOnce({ delivery: { agent, config: agent.config, current: () => true }, key: "watch", signal: AbortSignal.timeout(60_000), prompt: async () => "standalone-turn" });
  assert.equal(once.ok, true, JSON.stringify(once));
  assert.equal(posted.at(-1).content, "OMP standalone");
  assert.deepEqual(posted.at(-1).tags, [["h", channel]]);
  const count = posted.length;
  await delivery("wait-for-interrupt", { interrupt: true });
  assert.equal(posted.length, count, "Stop must not post a partial answer");
  console.log("PASS: real OMP model discovery, Buzz tool roundtrip, no duplicate reply, persistent restart, Compact, New session, standalone turn, and Stop");
} finally {
  await runtime.dispose();
  for (const child of children) child.kill("SIGKILL");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
