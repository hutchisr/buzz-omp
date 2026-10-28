import { appClient, sessionTools, callSessionTool, turnNote, content } from "../vendor/buzz/session-tools.mjs";

// The shared handlers own Buzz semantics. This adapter supplies only the
// injected host services and OMP's names/result format; keys stay in Buzz.
export function buzzTools({ agent, agents, host, workspace, context = {}, signal, onSend }) {
  const added = () => agents.tools?.() ?? [];
  const snapshot = () => {
    const value = agents.relay(agent.pubkey)?.snapshot();
    if (value?.status !== "ready" || value.viewer !== agent.owner || !value.origin)
      throw new Error("The agent's community is not ready");
    return value;
  };
  const initial = snapshot();
  const check = () => {
    if (snapshot().session !== initial.session)
      throw new Error("The agent's community connection changed; start a new turn");
  };
  const listed = sessionTools(added()).map(({ name, description, inputSchema }) => ({
    name: `buzz_${name}`, label: `Buzz ${name.replaceAll("_", " ")}`, description,
    parameters: name === "send" ? {
      ...inputSchema,
      properties: { ...inputSchema.properties,
        thread: { type: "string", description: "Compatibility alias for reply; use only one." } },
      required: (inputSchema.required ?? []).filter((key) => key !== "audience"),
    } : inputSchema,
  }));
  const names = new Set(listed.map((tool) => tool.name));
  function client(callSignal) {
    const guard = () => { callSignal.throwIfAborted(); check(); };
    const attention = agent.attention && { ...agent.attention,
      show: async (...args) => {
        guard();
        const result = await agent.attention.show(...args);
        guard();
        return result;
      },
      write: (...args) => {
        guard();
        if (!agent.attention.enabled()) throw new Error("Attention is off for you");
        return agent.attention.write(...args);
      },
    };
    return appClient({ ...agent, attention, publish: async (event) => {
      const sent = await agent.publish(event);
      // Record delivery even if cancellation races the native publication.
      if (event.kind === 9) onSend?.(sent);
      return sent;
    } }, {
      relayAuthor: initial.session.relayAuthor,
      signingAuthority: initial.session.workflowAuthority,
      read: (path) => host.readFile(path, { cwd: workspace }),
      memories: (slug) => {
        if (!initial.session.agentMemories?.read) throw new Error("Memory reads are unavailable on this Buzz host");
        return initial.session.agentMemories.read(agent.pubkey, callSignal, slug);
      },
      check, signal: callSignal,
    });
  }
  return {
    tools: listed,
    note: () => turnNote({ attention: agent.attention }),
    async call(name, args, toolSignal) {
      try {
        const signals = [signal, toolSignal].filter(Boolean);
        const callSignal = signals.length ? AbortSignal.any(signals) : new AbortController().signal;
        callSignal.throwIfAborted();
        check();
        if (!names.has(name)) throw new Error(`Unknown tool: ${name}`);
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object");
        if (name === "buzz_send") {
          const { thread, reply, ...rest } = args;
          if (thread !== undefined && reply !== undefined) throw new Error("Use only one of thread or reply");
          args = { audience: "everyone", ...rest, ...(thread !== undefined || reply !== undefined ? { reply: reply ?? thread } : {}) };
        }
        return { content: content(await callSessionTool(client(callSignal), context, name.slice(5), args, added())) };
      } catch (error) {
        return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
      }
    },
  };
}
