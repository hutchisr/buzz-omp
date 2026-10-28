const HEX = /^[0-9a-f]{64}$/;
// Channel identifiers are UUIDs in Buzz; older channels can use hex IDs.
// Thread/reply identifiers are always Nostr event IDs.
const CHANNEL_ID = /^(?:[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const KINDS = [9, 40002, 40008, 45001, 45003];
const idSchema = { type: "string", pattern: "^[0-9a-f]{64}$" };
const channelSchema = { type: "string", pattern: CHANNEL_ID.source, description: "Buzz channel UUID (or legacy hex channel ID)." };

export const isChannelId = (value) => typeof value === "string" && CHANNEL_ID.test(value);

export const TOOLS = [
  {
    name: "buzz_read", label: "Read Buzz",
    description: "Read recent messages oldest first. Defaults to this conversation. An explicit channel reads that channel; thread resolves a message to its thread and channel. Standalone turns need an explicit destination.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { channel: channelSchema, thread: idSchema, limit: { type: "integer", minimum: 1, maximum: 100, description: "Maximum messages, including the thread root; default 30." } },
    },
  },
  {
    name: "buzz_send", label: "Send Buzz",
    description: "Send text to this conversation. An explicit channel starts a top-level message; thread or reply resolves a message to its thread root. Use only one of thread/reply. The current Solo chat stays top-level. Standalone turns need an explicit destination.",
    parameters: {
      type: "object", additionalProperties: false, required: ["text"],
      properties: { channel: channelSchema, thread: idSchema, reply: idSchema, text: { type: "string", minLength: 1, maxLength: 50000 } },
    },
  },
];

function validId(value, name) {
  if (typeof value !== "string" || !HEX.test(value)) throw new Error(`${name} must be a 64-character lowercase hex ID.`);
  return value;
}

function validChannel(value, name) {
  if (!isChannelId(value)) throw new Error(`${name} must be a lowercase UUID or 64-character lowercase hex channel ID.`);
  return value;
}

function validText(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 50000) throw new Error("text must contain 1..50000 characters and not be blank.");
  return text;
}

function channelOf(event) {
  return event.tags.find((tag) => tag[0] === "h")?.[1];
}

// Match Buzz's NIP-10 parser: last valid markers win; a lone root is not a reply.
function rootOf(event) {
  let root, reply;
  for (const [name, value, , marker] of event.tags) {
    if (name !== "e" || typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) continue;
    if (marker === "root") root = value.toLowerCase();
    if (marker === "reply") reply = value.toLowerCase();
  }
  return reply ? root ?? reply : event.id;
}

async function query(agent, filters, signal) {
  signal?.throwIfAborted();
  if (!signal) return agent.query(filters);
  let abort;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        abort = () => reject(signal.reason ?? new Error("Cancelled"));
        signal.addEventListener("abort", abort, { once: true });
      }),
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return agent.query(filters);
      }),
    ]);
  } finally { signal.removeEventListener("abort", abort); }
}

async function destination(args, context, sending) {
  const { agent, signal } = context;
  let channel = args.channel ?? context.channel;
  let root = args.thread ?? args.reply
    ?? (args.channel === undefined && !context.topLevel ? context.root : undefined);
  if (root && (root !== context.root || channel !== context.channel || args.thread !== undefined || args.reply !== undefined)) {
    const events = await query(agent, [{ ids: [root], kinds: KINDS, limit: 1 }], signal);
    const event = events.find((event) => event.id === root && KINDS.includes(event.kind));
    if (!event) throw new Error(`No message ${root}.`);
    const foundChannel = validChannel(channelOf(event), "Message channel");
    if (args.channel !== undefined && args.channel !== foundChannel) throw new Error("The message belongs to a different channel.");
    channel = foundChannel;
    root = rootOf(event);
  }
  validChannel(channel, "channel (required outside a conversation)");
  if (root !== undefined) validId(root, "thread");
  if (sending && root && context.topLevel && channel === context.channel) throw new Error("This chat stays at the top level: send without thread or reply.");
  return { channel, root };
}

export async function publish(agent, channel, root, content) {
  validChannel(channel, "channel");
  if (root !== undefined) validId(root, "thread");
  validText(content);
  return agent.publish({
    kind: 9, content,
    tags: [["h", channel], ...(root ? [["e", root, "", "reply"]] : [])],
  });
}

export async function callTool(name, args, context) {
  try {
    const definition = TOOLS.find((tool) => tool.name === name);
    if (!definition) throw new Error(`Unknown tool: ${name}`);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object.");
    for (const key of Object.keys(args)) {
      if (!Object.hasOwn(definition.parameters.properties, key)) throw new Error(`Unknown argument: ${key}`);
      if (key === "channel") validChannel(args[key], key);
      if (["thread", "reply"].includes(key)) validId(args[key], key);
    }
    const sending = name === "buzz_send";
    if (sending) {
      validText(args.text);
      if (args.thread !== undefined && args.reply !== undefined) throw new Error("Use only one of thread or reply.");
    }
    const limit = args.limit === undefined ? 30 : args.limit;
    if (!sending && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw new Error("limit must be an integer from 1 to 100.");
    context.signal?.throwIfAborted();
    const { channel, root } = await destination(args, context, sending);
    context.signal?.throwIfAborted();
    if (sending) {
      const event = await publish(context.agent, channel, root, args.text);
      // Publishing cannot be cancelled by AgentHandle. Record a completed send even
      // if cancellation arrived while it was in flight, preventing fallback duplicates.
      context.onSend?.(event);
      return { content: [{ type: "text", text: `sent ${event.id}` }] };
    }
    const events = await query(context.agent, [
      { kinds: KINDS, "#h": [channel], ...(root ? { "#e": [root] } : {}), limit },
      ...(root ? [{ ids: [root], kinds: KINDS, "#h": [channel], limit: 1 }] : []),
    ], context.signal);
    context.signal?.throwIfAborted();
    const unique = new Map();
    for (const event of events) {
      if (KINDS.includes(event.kind) && channelOf(event) === channel
        && (!root || event.id === root || rootOf(event) === root)) unique.set(event.id, event);
    }
    const ordered = [...unique.values()].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
    const first = root && unique.get(root);
    const messages = first
      ? [first, ...(limit > 1 ? ordered.filter((event) => event.id !== root).slice(-(limit - 1)) : [])]
      : ordered.slice(-limit);
    messages.sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
    return { content: [{ type: "text", text: JSON.stringify(messages.map(({ id, pubkey, created_at, kind, content }) => ({ id, pubkey, created_at, kind, content }))) }] };
  } catch (error) {
    return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}
