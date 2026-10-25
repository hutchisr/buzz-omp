import test from 'node:test';
import assert from 'node:assert/strict';
import { Rpc } from '../src/rpc.mjs';

const ready = { type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1, 2], maxFrameBytes: 1048576, maxReassembledFrameBytes: 67108864 };
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (command, data) => ({ type: 'response', id: command.id, command: command.type, success: true, data });

function fake({ startup = ready, write, exited } = {}) {
  let callbacks;
  let exit;
  const writes = [];
  const process = {
    kills: 0,
    exited: exited ?? new Promise(resolve => { exit = resolve; }),
    kill() { this.kills++; },
    write(line) {
      const frame = JSON.parse(line);
      writes.push(frame);
      if (frame.type === 'negotiate_protocol') wire.emit(response(frame, { protocolVersion: 2 }));
      else return write?.(frame, wire);
    },
  };
  const wire = {
    writes, process,
    host: { spawn(id, options) {
      assert.equal(id, 'omp');
      callbacks = options;
      if (startup) options.onStdout(JSON.stringify(startup) + '\n');
      return Promise.resolve(process);
    } },
    emit(...frames) { callbacks.onStdout(frames.map(frame => JSON.stringify(frame) + '\n').join('')); },
    raw(text) { callbacks.onStdout(text); },
    exit(code) { exit(code); },
    get options() { return callbacks; },
  };
  return wire;
}

async function connect(t, settings = {}, options = {}) {
  const wire = fake(settings);
  const rpc = await Rpc.start(wire.host, options);
  t.after(() => rpc.close());
  return { ...wire, rpc };
}

function chunks(frame, size = 7) {
  const bytes = Buffer.from(JSON.stringify(frame));
  return Array.from({ length: Math.ceil(bytes.length / size) }, (_, index) => ({
    type: 'rpc_chunk', chunkId: 'chunk-1', index, count: Math.ceil(bytes.length / size), byteLength: bytes.length,
    data: bytes.subarray(index * size, (index + 1) * size).toString('base64'),
  }));
}

function promptResult(id, extra = {}) {
  return { type: 'prompt_result', id, agentInvoked: true, status: 'completed', sessionSettled: true, ...extra };
}

test('close waits for native process shutdown before its session can be reopened', async () => {
  const wire = fake();
  let stopped;
  wire.process.kill = () => new Promise(resolve => { stopped = resolve; });
  const rpc = await Rpc.start(wire.host);
  let closed = false;
  const closing = rpc.close().then(() => { closed = true; });
  await tick();
  assert.equal(closed, false);
  stopped();
  await closing;
  assert.equal(closed, true);
});

test('startup retains ready before spawn resolves and negotiates before caller commands', async t => {
  const wire = fake({ write(frame, wire) { wire.emit(response(frame, { ok: true })); } });
  const options = { args: ['--mode', 'rpc', '--no-ui', '--continue'], cwd: '/tmp/project', env: { TEST: 'yes' } };
  const rpc = await Rpc.start(wire.host, options);
  t.after(() => rpc.close());
  assert.deepEqual(wire.options.args, options.args);
  assert.equal(wire.options.cwd, options.cwd);
  assert.deepEqual(wire.options.env, options.env);
  assert.equal(wire.writes[0].type, 'negotiate_protocol');
  assert.deepEqual(await rpc.request('get_state'), { ok: true });
});

test('negotiation changes decoding before the next synchronous chunked frame', async t => {
  const events = [];
  const wire = fake();
  wire.process.write = line => {
    const command = JSON.parse(line);
    wire.emit(response(command, { protocolVersion: 2 }), ...chunks({ type: 'notice', message: 'negotiated' }));
  };
  const rpc = await Rpc.start(wire.host, { onEvent: frame => events.push(frame) });
  t.after(() => rpc.close());
  assert.equal(events.find(frame => frame.type === 'notice').message, 'negotiated');
});

test('negotiation failure and malformed startup reject rather than exposing a connection', async () => {
  const wire = fake();
  wire.process.write = line => wire.emit({ ...response(JSON.parse(line)), success: false, error: 'cannot negotiate' });
  await assert.rejects(Rpc.start(wire.host), /cannot negotiate/);
  assert.equal(wire.process.kills, 1);
  const malformed = fake({ startup: { type: 'ready', maxFrameBytes: -1 } });
  await assert.rejects(Rpc.start(malformed.host), /invalid maxFrameBytes/);
  await tick();
  assert.equal(malformed.process.kills, 1);
});

test('startup abort interrupts a pending spawn and kills its eventual handle', async () => {
  const controller = new AbortController();
  let resolveSpawn;
  const process = { kills: 0, kill() { this.kills++; }, exited: new Promise(() => {}) };
  const starting = Rpc.start({ spawn() { return new Promise(resolve => { resolveSpawn = resolve; }); } }, { signal: controller.signal });
  await tick();
  controller.abort();
  await assert.rejects(starting, { name: 'AbortError' });
  resolveSpawn(process);
  await tick();
  assert.equal(process.kills, 1);
});

test('ready is required before any commands and v1-only peers remain supported', async t => {
  const wire = fake({ startup: null });
  const starting = Rpc.start(wire.host);
  await tick();
  assert.equal(wire.writes.length, 0);
  wire.emit({ type: 'ready' });
  const rpc = await starting;
  t.after(() => rpc.close());
  assert.equal(rpc.protocolVersion, 1);
  assert.equal(wire.writes.length, 0);
});

test('early exit, spawn rejection, startup cancellation and timeout reject startup', async () => {
  await assert.rejects(Rpc.start(fake({ startup: null, exited: Promise.resolve(7) }).host), /exited.*7/);
  await assert.rejects(Rpc.start({ spawn() { throw new Error('missing omp'); } }), /missing omp/);
  const signal = AbortSignal.abort();
  let spawned = false;
  await assert.rejects(Rpc.start({ spawn() { spawned = true; } }, { signal }), { name: 'AbortError' });
  assert.equal(spawned, false);
  const wire = fake({ startup: null });
  await assert.rejects(Rpc.start(wire.host, { startupTimeoutMs: 5 }), /startup timed out/);
  assert.equal(wire.process.kills, 1);
});

test('startup timeout does not wait for spawn and kills a late process handle', async () => {
  let resolveSpawn;
  const process = { kills: 0, kill() { this.kills++; }, exited: new Promise(() => {}) };
  const starting = Rpc.start({ spawn() { return new Promise(resolve => { resolveSpawn = resolve; }); } }, { startupTimeoutMs: 5 });
  await assert.rejects(starting, /startup timed out/);
  resolveSpawn(process);
  await tick();
  assert.equal(process.kills, 1);
});

test('request ids correlate out-of-order responses and preserve server errors', async t => {
  const { rpc, writes, emit } = await connect(t);
  const a = rpc.request('get_state');
  const b = rpc.request('get_messages');
  const [first, second] = writes.slice(-2);
  emit(response(second, ['second']), { ...response(first), success: false, error: 'busy', code: 'session_busy' });
  await assert.rejects(a, { message: 'busy', code: 'session_busy' });
  assert.deepEqual(await b, ['second']);
  await assert.rejects(rpc.request('get_state', {}, 5), /timed out/);
  assert.equal(rpc.alive, false);
});

test('split lines and UTF-8 chunks are reassembled without losing events', async t => {
  const events = [];
  const { rpc, writes, raw, emit } = await connect(t, {}, { onEvent: frame => events.push(frame) });
  const pending = rpc.request('get_state');
  const frames = chunks(response(writes.at(-1), { text: 'hello 🐝 漢字' }), 1);
  const text = frames.map(frame => JSON.stringify(frame) + '\n').join('');
  for (let i = 0; i < text.length; i += 11) raw(text.slice(i, i + 11));
  emit({ type: 'message_update', delta: 'still flowing' });
  assert.deepEqual(await pending, { text: 'hello 🐝 漢字' });
  assert.equal(events.at(-1).type, 'message_update');
  assert.equal(events.some(frame => frame.type === 'rpc_chunk'), false);
});

test('chunk ordering, metadata, encoding, interruption and limits fail closed', async t => {
  const base = chunks({ type: 'notice', message: 'abcdefgh' }, 10);
  const badSequences = [
    [base[1]],
    [base[0], { ...base[1], chunkId: 'other' }],
    [base[0], { type: 'notice' }],
    [{ ...base[0], count: 0 }],
    [{ ...base[0], byteLength: 67108865 }],
    [{ ...base[0], data: '!!!!' }],
    [{ ...base[0], count: 1, data: 'YQ==' }],
    [{ type: 'rpc_chunk', chunkId: 'bad-utf8', index: 0, count: 1, byteLength: 2, data: '/wA=' }],
    ...[[], { type: 'rpc_chunk' }].map(value => chunks(value, 100)),
  ];
  for (const frames of badSequences) {
    const { rpc, emit } = await connect(t);
    const pending = rpc.request('get_state');
    emit(...frames);
    await assert.rejects(pending, /Invalid OMP wire/);
    assert.equal(rpc.alive, false);
  }
});

test('malformed JSON, oversized lines and write failures reject all waiting work', async t => {
  for (const rawText of ['not json\n', '[]\n', '{}\n', 'x'.repeat(1048576)]) {
    const { rpc, raw } = await connect(t);
    const a = rpc.request('get_state');
    const b = rpc.request('get_messages');
    const rejected = Promise.all([assert.rejects(a, /Invalid OMP wire/), assert.rejects(b, /Invalid OMP wire/)]);
    raw(rawText);
    await rejected;
  }
  for (const write of [() => { throw new Error('broken stdin'); }, () => Promise.reject(new Error('broken stdin'))]) {
    const { rpc } = await connect(t, { write });
    await assert.rejects(rpc.request('get_state'), /broken stdin/);
    assert.equal(rpc.alive, false);
  }
});

test('prompt admission is not completion and agent_end alone never completes it', async t => {
  let acknowledged = 0;
  let finished = false;
  const output = [];
  const { rpc, writes, emit, process } = await connect(t, {}, {
    onEvent: frame => { if (frame.type === 'message_end') output.push(frame.message.content); },
    onTool: async () => ({ content: [{ type: 'text', text: 'Background tool completed' }] }),
  });
  const pending = rpc.prompt('hello', { onAcknowledged: () => acknowledged++ }).then(result => { finished = true; return result; });
  const command = writes.at(-1);
  emit(response(command, { agentInvoked: true }), { type: 'agent_end', yielded: true, messages: [] });
  await tick();
  assert.equal(acknowledged, 1);
  assert.equal(finished, false);
  await assert.rejects(rpc.prompt('overlap'), /active prompt/);
  emit(promptResult(command.id, { sessionSettled: false }));
  emit({ type: 'agent_start' },
    { type: 'host_tool_call', id: 'late-tool', toolName: 'buzz_read', arguments: {} },
    { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Final background answer' }] } },
    { type: 'agent_end', yielded: true, messages: [] });
  await tick();
  assert.equal(finished, false);
  assert.equal(process.kills, 0);
  assert.deepEqual(output, [[{ type: 'text', text: 'Final background answer' }]]);
  assert.deepEqual(writes.find(frame => frame.type === 'host_tool_result' && frame.id === 'late-tool')?.result,
    { content: [{ type: 'text', text: 'Background tool completed' }] });
  emit({ type: 'session_settled' });
  assert.equal((await pending).status, 'completed');
});

test('local completion and synchronously batched prompt results cannot race admission', async t => {
  for (const local of [true, false]) {
    const { rpc } = await connect(t, { write(frame, wire) {
      if (frame.type === 'prompt') {
        wire.emit(response(frame, { agentInvoked: !local }), ...(local ? [] : [promptResult(frame.id)]));
      }
    } });
    let acknowledged = false;
    const result = await rpc.prompt('hello', { onAcknowledged() { acknowledged = true; } });
    assert.equal(acknowledged, true);
    assert.equal(result.agentInvoked, !local);
  }
});

test('failed provider turns and aborted prompts reject, including after async settlement', async t => {
  for (const status of ['error', 'aborted']) {
    for (const sessionSettled of [true, false]) {
      const { rpc, writes, emit } = await connect(t);
      const pending = rpc.prompt('hello');
      const rejected = assert.rejects(pending, status === 'error' ? /quota exhausted/ : { name: 'AbortError' });
      const command = writes.at(-1);
      emit(response(command, { agentInvoked: true }), promptResult(command.id, { status, sessionSettled, error: { message: 'quota exhausted' } }));
      if (!sessionSettled) emit({ type: 'session_settled' });
      await rejected;
    }
  }
});

test('post-admission command errors, process exits and cancellation reject active prompts', async t => {
  for (const reason of ['error', 'exit', 'abort']) {
    const { rpc, writes, emit, exit, process } = await connect(t);
    const controller = new AbortController();
    const pending = rpc.prompt('hello', { signal: controller.signal });
    const rejected = assert.rejects(pending);
    const command = writes.at(-1);
    emit(response(command, { agentInvoked: true }));
    if (reason === 'error') emit({ ...response(command), success: false, error: 'late error' });
    else if (reason === 'exit') exit(1);
    else controller.abort();
    await rejected;
    if (reason !== 'error') {
      assert.equal(rpc.alive, false);
      assert.equal(process.kills, 1);
    }
  }
});

test('host tools run asynchronously, keep events flowing and map errors at top level', async t => {
  const events = [];
  const { emit, writes } = await connect(t, {}, {
    onEvent: frame => events.push(frame.type),
    async onTool(frame) {
      await tick();
      if (frame.toolName === 'throws') throw new Error('tool failure');
      return { content: [{ type: 'text', text: 'result' }], isError: true };
    },
  });
  emit({ type: 'host_tool_call', id: 'tool-1', toolName: 'returns', arguments: {} }, { type: 'message_update' });
  assert.equal(events.at(-1), 'message_update');
  await tick();
  await tick();
  const result = writes.at(-1);
  assert.equal(result.type, 'host_tool_result');
  assert.equal(result.isError, true);
  assert.equal('isError' in result.result, false);
  emit({ type: 'host_tool_call', id: 'tool-2', toolName: 'throws', arguments: {} });
  await tick();
  await tick();
  assert.equal(writes.at(-1).isError, true);
  assert.match(writes.at(-1).result.content[0].text, /tool failure/);
});

test('tool cancellation and close abort signals and suppress late results', async t => {
  for (const close of [false, true]) {
    let signal;
    let release;
    const { rpc, emit, writes } = await connect(t, {}, { onTool(_frame, value) {
      signal = value;
      return new Promise(resolve => { release = resolve; });
    } });
    emit({ type: 'host_tool_call', id: 'tool-1', toolName: 'slow', arguments: {} });
    await tick();
    if (close) rpc.close();
    else emit({ type: 'host_tool_cancel', id: 'cancel-1', targetId: 'tool-1' });
    assert.equal(signal.aborted, true);
    release({ content: [{ type: 'text', text: 'late' }] });
    await tick();
    assert.equal(writes.some(frame => frame.type === 'host_tool_result'), false);
  }
});
