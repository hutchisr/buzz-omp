const FRAME_LIMIT = 1024 * 1024;
const LOGICAL_LIMIT = 64 * FRAME_LIMIT;
const encoder = new TextEncoder();
const utf8 = new TextDecoder('utf-8', { fatal: true });
const errorOf = value => value instanceof Error ? value : new Error(String(value ?? 'OMP connection closed'));
const aborted = () => new DOMException('OMP operation aborted', 'AbortError');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Browser-side JSONL transport. A cancelled prompt closes its process, so no turn is orphaned. */
export class Rpc {
  static start(host, options = {}) {
    const rpc = new Rpc(options);
    return new Promise((resolve, reject) => {
      rpc.startResolve = resolve;
      rpc.startReject = reject;
      rpc.startTimer = setTimeout(() => rpc.close(new Error('OMP startup timed out')), options.startupTimeoutMs ?? 30000);
      rpc.startAbort = () => rpc.close(aborted());
      options.signal?.addEventListener('abort', rpc.startAbort, { once: true });
      if (options.signal?.aborted) {
        rpc.close(aborted());
        return;
      }
      Promise.resolve().then(() => host.spawn('omp', {
        args: options.args ?? ['--mode', 'rpc', '--no-ui'],
        cwd: options.cwd,
        env: options.env,
        onStdout: text => rpc.receive(text),
        onStderr: text => { rpc.stderr = (rpc.stderr + text).slice(-4096); },
      })).then(process => {
        rpc.process = process;
        Promise.resolve(process.exited).then(
          code => rpc.close(new Error(`OMP exited (${JSON.stringify(code)})${rpc.stderr ? `: ${rpc.stderr}` : ''}`)),
          error => rpc.close(error),
        );
        if (!rpc.alive) rpc.kill();
        else rpc.connect();
      }, error => rpc.close(error));
    });
  }

  constructor(options = {}) {
    this.options = options;
    this.alive = true;
    this.pending = new Map();
    this.tools = new Map();
    this.sequence = 0;
    this.buffer = '';
    this.stderr = '';
    this.maxFrameBytes = FRAME_LIMIT;
    this.maxReassembledFrameBytes = LOGICAL_LIMIT;
    this.protocolVersion = 1;
  }

  async connect() {
    if (!this.alive || !this.process || !this.ready || this.connecting) return;
    this.connecting = true;
    try {
      if (this.ready.supportedProtocolVersions?.includes(2)) {
        await this.request('negotiate_protocol', { protocolVersion: 2 });
      }
      if (!this.alive) return;
      clearTimeout(this.startTimer);
      this.options.signal?.removeEventListener('abort', this.startAbort);
      this.startResolve(this);
    } catch (error) {
      this.close(error);
    }
  }

  request(type, payload = {}, timeoutMs = 30000) {
    if (!this.alive) return Promise.reject(this.failure);
    if (!this.process || !this.ready) return Promise.reject(new Error('OMP is not ready'));
    const id = `buzz-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(new Error(`OMP ${type} timed out`)), timeoutMs);
      this.pending.set(id, { type, resolve, reject, timer });
      this.send({ ...payload, type, id });
    });
  }

  prompt(message, { signal, onAcknowledged } = {}) {
    if (!this.alive) return Promise.reject(this.failure);
    if (!this.process || !this.ready) return Promise.reject(new Error('OMP is not ready'));
    if (this.active) return Promise.reject(new Error('OMP already has an active prompt'));
    if (signal?.aborted) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      const id = `buzz-${++this.sequence}`;
      const cancel = () => this.close(aborted());
      const timer = setTimeout(() => this.close(new Error('OMP prompt admission timed out')), 30000);
      this.active = { id, resolve, reject, signal, cancel, timer, onAcknowledged, acknowledged: false };
      signal?.addEventListener('abort', cancel, { once: true });
      this.send({ type: 'prompt', id, message });
    });
  }

  finishPrompt(error, result) {
    const active = this.active;
    if (!active) return;
    this.active = null;
    clearTimeout(active.timer);
    active.signal?.removeEventListener('abort', active.cancel);
    if (error) active.reject(error);
    else active.resolve(result);
  }

  send(frame) {
    try {
      if (!this.alive) return;
      const line = JSON.stringify(frame) + '\n';
      if (encoder.encode(line).length > this.maxFrameBytes) throw new Error('OMP outbound frame exceeds transport limit');
      Promise.resolve(this.process.write(line)).catch(error => this.close(error));
    } catch (error) {
      this.close(error);
    }
  }

  receive(text) {
    if (!this.alive) return;
    try {
      if (typeof text !== 'string') throw new Error('OMP stdout must be text');
      // Bound the unfinished line, not an entire callback containing many valid frames.
      let start = 0;
      while (start < text.length && this.alive) {
        const newline = text.indexOf('\n', start);
        const end = newline < 0 ? text.length : newline;
        if (this.buffer.length + end - start + 1 > this.maxFrameBytes) throw new Error('OMP frame exceeds transport limit');
        this.buffer += text.slice(start, end);
        if (newline < 0) break;
        const line = this.buffer;
        this.buffer = '';
        if (encoder.encode(line).length + 1 > this.maxFrameBytes) throw new Error('OMP frame exceeds transport limit');
        if (line.trim()) this.decode(JSON.parse(line));
        start = newline + 1;
      }
    } catch (error) {
      this.close(new Error(`Invalid OMP wire: ${errorOf(error).message}`));
    }
  }

  decode(frame) {
    if (!object(frame) || typeof frame.type !== 'string' || !frame.type) throw new Error('expected a typed JSON object');
    if (frame.type !== 'rpc_chunk') {
      if (this.chunk) throw new Error('interrupted chunk sequence');
      this.dispatch(frame);
      return;
    }
    const { chunkId, index, count, byteLength, data } = frame;
    if (this.protocolVersion !== 2 || typeof chunkId !== 'string' || !chunkId ||
        !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || !Number.isSafeInteger(byteLength) ||
        index < 0 || count < 1 || index >= count || byteLength < count || byteLength > this.maxReassembledFrameBytes ||
        typeof data !== 'string' || !data || data.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
      throw new Error('invalid chunk metadata or base64');
    }
    if (!this.chunk) {
      if (index !== 0) throw new Error('chunk sequence does not start at zero');
      this.chunk = { chunkId, count, byteLength, index: 0, used: 0, bytes: new Uint8Array(byteLength) };
    }
    const chunk = this.chunk;
    if (chunkId !== chunk.chunkId || count !== chunk.count || byteLength !== chunk.byteLength || index !== chunk.index) {
      throw new Error('out-of-order or interleaved chunks');
    }
    const decoded = atob(data);
    if (btoa(decoded) !== data || chunk.used + decoded.length > byteLength) throw new Error('invalid chunk bytes');
    for (let i = 0; i < decoded.length; i++) chunk.bytes[chunk.used + i] = decoded.charCodeAt(i);
    chunk.used += decoded.length;
    chunk.index++;
    if (chunk.index === count) {
      if (chunk.used !== byteLength) throw new Error('chunk byteLength mismatch');
      const value = JSON.parse(utf8.decode(chunk.bytes));
      this.chunk = null;
      if (!object(value) || typeof value.type !== 'string' || !value.type || value.type === 'rpc_chunk') {
        throw new Error('invalid reassembled object');
      }
      this.dispatch(value);
    } else if (chunk.used >= byteLength) throw new Error('chunk bytes exhausted before final chunk');
  }

  dispatch(frame) {
    if (frame.type === 'ready') {
      if (this.ready) throw new Error('duplicate ready frame');
      if (frame.protocolVersion !== undefined && frame.protocolVersion !== 1) throw new Error('unsupported initial protocol');
      for (const key of ['maxFrameBytes', 'maxReassembledFrameBytes']) {
        if (frame[key] !== undefined) {
          if (!Number.isSafeInteger(frame[key]) || frame[key] < 1) throw new Error(`invalid ${key}`);
          this[key] = Math.min(this[key], frame[key]);
        }
      }
      if (frame.supportedProtocolVersions !== undefined && !Array.isArray(frame.supportedProtocolVersions)) throw new Error('invalid protocol versions');
      this.ready = frame;
      this.connect();
    } else if (frame.type === 'response') {
      if (typeof frame.success !== 'boolean') throw new Error('response lacks success boolean');
      const pending = this.pending.get(frame.id);
      if (pending) {
        if (frame.command !== pending.type) throw new Error('response command mismatch');
        this.pending.delete(frame.id);
        clearTimeout(pending.timer);
        if (frame.success) {
          // Switch before the next frame in the same stdout callback is decoded.
          if (pending.type === 'negotiate_protocol') this.protocolVersion = 2;
          pending.resolve(frame.data);
        } else pending.reject(Object.assign(errorOf(frame.error), { code: frame.code }));
      }
      const active = this.active;
      if (active?.id === frame.id) {
        if (frame.command !== 'prompt') throw new Error('prompt response command mismatch');
        if (!frame.success) this.finishPrompt(errorOf(frame.error));
        else if (!active.acknowledged) {
          active.acknowledged = true;
          clearTimeout(active.timer);
          active.onAcknowledged?.(frame.data);
          if (frame.data?.agentInvoked === false) this.finishPrompt(null, frame.data);
        }
      }
    } else if (frame.type === 'prompt_result' && this.active?.id === frame.id) {
      if (!this.active.acknowledged) throw new Error('prompt result before admission');
      if (!['completed', 'error', 'aborted'].includes(frame.status) || typeof frame.sessionSettled !== 'boolean') throw new Error('invalid prompt result');
      const failure = frame.status === 'error'
        ? Object.assign(errorOf(frame.error?.message ?? 'OMP provider error'), { details: frame.error })
        : frame.status === 'aborted' ? aborted() : null;
      if (frame.sessionSettled || frame.agentInvoked === false) this.finishPrompt(failure, frame);
      else {
        this.active.result = frame;
        this.active.error = failure;
      }
    } else if (frame.type === 'session_settled' && this.active?.result) {
      this.finishPrompt(this.active.error, this.active.result);
    } else if (frame.type === 'host_tool_call') {
      this.callTool(frame);
    } else if (frame.type === 'host_tool_cancel') {
      const controller = this.tools.get(frame.targetId);
      this.tools.delete(frame.targetId);
      controller?.abort();
    } else if (frame.type === 'rpc_frame_error') {
      throw new Error(frame.error ?? 'server transport overflow');
    }
    this.options.onEvent?.(frame);
  }

  callTool(frame) {
    if (typeof frame.id !== 'string' || !frame.id || typeof frame.toolName !== 'string' || !object(frame.arguments) || this.tools.has(frame.id)) {
      throw new Error('invalid or duplicate host tool call');
    }
    const controller = new AbortController();
    this.tools.set(frame.id, controller);
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      if (!this.options.onTool) throw new Error(`Unsupported host tool: ${frame.toolName}`);
      return this.options.onTool(frame, controller.signal);
    }).then(result => {
      if (controller.signal.aborted || !this.alive) return;
      if (!object(result) || !Array.isArray(result.content)) throw new Error('Host tool returned invalid content');
      this.send({ type: 'host_tool_result', id: frame.id, result: { content: result.content }, ...(result.isError ? { isError: true } : {}) });
    }).catch(error => {
      if (!controller.signal.aborted && this.alive) {
        this.send({ type: 'host_tool_result', id: frame.id, isError: true, result: { content: [{ type: 'text', text: errorOf(error).message }] } });
      }
    }).finally(() => {
      if (this.tools.get(frame.id) === controller) this.tools.delete(frame.id);
    });
  }

  kill() {
    if (!this.process) return;
    if (!this.stopping) {
      try { this.stopping = Promise.resolve(this.process.kill()).catch(() => {}); }
      catch { this.stopping = Promise.resolve(); }
    }
    return this.stopping;
  }

  close(reason) {
    if (!this.alive) return this.stopping;
    this.alive = false;
    this.failure = errorOf(reason);
    clearTimeout(this.startTimer);
    this.options.signal?.removeEventListener('abort', this.startAbort);
    this.startReject?.(this.failure);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    this.pending.clear();
    this.finishPrompt(this.failure);
    for (const controller of this.tools.values()) controller.abort();
    this.tools.clear();
    this.buffer = '';
    this.chunk = null;
    return this.kill();
  }
}
