// Generated from block/buzz c75ef6821f495c20a18f33577d2dc519efe942ce. Do not edit; run scripts/vendor-buzz-tools.mjs.
// Apache-2.0; see LICENSE and NOTICE.md. TypeScript transpiled and local modules bundled.
// src/buzz-mcp/app-client.ts
var READ_LIMIT = 50 * 1024 * 1024;
function appClient(agent, options) {
  const check = () => {
    options.signal?.throwIfAborted();
    options.check?.();
  };
  const tabs = () => {
    check();
    const found = agent.tabs();
    if (!found) throw new Error("Your community is not connected.");
    return found;
  };
  return {
    pubkey: agent.pubkey,
    owner: agent.owner,
    relayAuthor: options.relayAuthor,
    signingAuthority: options.signingAuthority,
    attention: agent.attention,
    query: async (filters) => {
      check();
      const events = await agent.query(filters);
      check();
      return events;
    },
    searchProfiles: (query, limit) => {
      check();
      return agent.searchProfiles(query, limit);
    },
    publish: (event) => {
      check();
      return agent.publish(event);
    },
    upload: (data, mime) => {
      check();
      return agent.upload(toBase64(data), mime);
    },
    media: (url) => {
      check();
      return agent.media(url);
    },
    gitAuth: (owner, repo) => {
      check();
      return agent.gitAuth(owner, repo);
    },
    read: (path) => {
      check();
      return options.read(path);
    },
    memories: (slug) => {
      check();
      return options.memories(slug);
    },
    remember: async (slug, body, after) => {
      check();
      await agent.remember(slug, body, after);
      check();
      options.remembered?.();
    },
    agentTypes: async () => {
      check();
      if (!agent.agentTypes)
        throw new Error("Agent creation is unavailable on this host");
      return agent.agentTypes();
    },
    createAgent: async (input) => {
      check();
      if (!agent.createAgent)
        throw new Error("Agent creation is unavailable on this host");
      return agent.createAgent(input);
    },
    updateAgent: async (input) => {
      check();
      if (!agent.updateAgent)
        throw new Error("Agent changes are unavailable on this host");
      return agent.updateAgent(input);
    },
    templates: async () => {
      check();
      return agent.templates();
    },
    tabs: {
      list: (channel) => tabs().list(channel),
      open: (channel, root) => tabs().open(channel, root),
      close: (channel, root) => tabs().close(channel, root),
      rename: (channel, root, name) => tabs().rename(channel, root, name)
    }
  };
}
function toBase64(data) {
  let binary = "";
  for (let i = 0; i < data.length; i += 32768)
    binary += String.fromCharCode(...data.subarray(i, i + 32768));
  return btoa(binary);
}

// src/features/agent-harness/attention-prompt.ts
var section = (tag3, body, attributes = "") => `<${tag3}${attributes}>
${body.trim()}
</${tag3}>`;
var ATTENTION_REVIEW = section(
  "attention",
  "Handle the work that caused this turn. Before finishing, review your Interests and watches and maintain them as needed: update instructions, arrange useful future wakes, remove obsolete watches, and retire completed Interests after removing their watches. You may create Interests for new responsibilities within your authority. Use the attention tools. An unchanged attention is a valid outcome. No completion acknowledgement or extra report is required; publish only useful outcomes, questions, or blockers. Watches do not grant membership, permissions, or authority to act."
);
var ATTENTION_NONE = section(
  "attention",
  "You have no Interests, so there is nothing to review. If this turn gave you an ongoing responsibility within your authority, you may create an Interest for it with the attention tools."
);
var ATTENTION_OFF = section(
  "attention",
  "Your owner has attention off: the attention tools refuse calls, and no watch or timer wakes you."
);
var CATCH_UP_TEXT_LIMIT = 32 * 1024;

// src/buzz-mcp/attention.ts
var str = { type: "string" };
var int = { type: "integer" };
var bool = { type: "boolean" };
var id = { ...str, description: "Object id: 1-64 visible ASCII characters." };
var token = {
  ...str,
  description: "expected_state from your latest show or write of this object; object-v1:absent to create. A conflict answer means it changed since: show it again and decide again."
};
var scope = {
  ...str,
  description: "The Interest you work for; another's object is wrong-scope."
};
var unbounded = {
  anyOf: [int, { type: "string", enum: ["unbounded"] }]
};
var question = {
  type: "object",
  properties: {
    question: str,
    true: str,
    false: str,
    guidance: str,
    threshold: {
      type: "number",
      description: "Yes probability that passes; default 0.2."
    }
  },
  required: ["question"],
  additionalProperties: false
};
var watchFields = {
  name: str,
  enabled: bool,
  channel: {
    ...str,
    description: "Optional delivery address: destination channel UUID; omit for an independent Interest turn."
  },
  root: {
    ...str,
    description: "Optional delivery address: destination thread root, requires channel."
  },
  since: {
    anyOf: [int, { type: "string", enum: ["now"] }],
    description: "Event watch: ignore events before this Unix time."
  },
  channels: {
    anyOf: [
      { type: "string", enum: ["all"] },
      { type: "array", items: str }
    ],
    description: 'Event watch: channel ids, or "all".'
  },
  kinds: {
    type: "array",
    items: int,
    description: "Event watch: event kinds; empty matches any."
  },
  authors: {
    type: "array",
    items: str,
    description: "Event watch: only events by these hex pubkeys."
  },
  exclude_authors: {
    type: "array",
    items: str,
    description: "Event watch: no events by these hex pubkeys. Not with authors."
  },
  tags: {
    type: "object",
    additionalProperties: { type: "array", items: str },
    description: "Event watch: one-letter tag to accepted values."
  },
  is_reply: {
    ...bool,
    description: "Event watch: true for thread replies only, false for top-level only."
  },
  classifier: {
    type: "object",
    properties: {
      questions: {
        type: "object",
        additionalProperties: question,
        description: "Named yes/no questions; the event passes on any yes."
      }
    },
    required: ["questions"],
    additionalProperties: false
  },
  prompt: { ...str, description: "Timer: what to do when it fires." },
  interval_secs: int,
  max_occurrences: { ...unbounded, description: "Timer: default 1." },
  expires_at: {
    ...unbounded,
    description: "Timer: Unix time after which it never fires."
  }
};
var WRITES = "A successful write is authoritative; show again only when a later decision needs the current object or the result is ambiguous. wrong-scope means the object belongs to another Interest than the one you named. Report conflicts or failures; do not blindly retry an ambiguous write. Attention does not grant channel membership or authority to act. These tools work only while your owner has attention on; the end of each turn says when it is off.";
var tool = (name, description, properties, required3 = []) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties,
    ...required3.length ? { required: required3 } : {},
    additionalProperties: false
  }
});
var ATTENTION_TOOLS = [
  tool(
    "interest_set",
    `Create an Interest, or replace its instructions. Your attention is yours to manage: Interests say what you are responsible for, event watches wake you when a matching event arrives, and timers wake you on a schedule (watch_add). Subscriptions say what wakes you and may specify a conversation delivery address. Keep the task and reporting policy in the Interest instructions. ${WRITES}`,
    { id, instructions: str, expected_state: token },
    ["id", "instructions", "expected_state"]
  ),
  tool("interest_show", "One Interest and its expected_state.", { id }, ["id"]),
  tool("interest_list", "Interest ids.", { search: str }),
  tool(
    "interest_remove",
    "Remove an Interest that has no watches: once it has no remaining purpose, remove its watches, then it.",
    { id, expected_state: token },
    ["id", "expected_state"]
  ),
  tool(
    "watch_add",
    `Add an event watch (since and channels), or a timer (prompt and interval_secs) to an Interest; only for a new watch.

Event watch: it sees only channels you are a member of, and "all" means all of those. It sees events that arrive while it is on: an earlier since does not replay older ones. Each matching event watch runs independently. Prefer deterministic selectors for hard rules; use the classifier only for judgment. authors keeps only those authors, exclude_authors: ["OWNER_HEX"] drops the owner's own messages, and is_reply: false keeps only top-level messages (true: only thread replies). A watch has authors or exclude_authors, not both. When a watch reports to the owner, exclude the owner's messages unless they are the signal.

Classifier, for noisy event watches: Jev tests relevance after the normal filters. It sees one event, not history, and has no tools. Use named yes/no questions, for example {"questions":{"release_blocked":{"question":"Does the event say the release cannot proceed until something is fixed?","true":"It reports a release blocker, in any form: a question, an instruction or a status report.","false":"Routine release progress, or a problem that does not stop the release."}}}. Write questions for the facts the Interest needs, not for message types, and accept any phrasing of those facts. Ask one thing per question. The event passes when any question says yes, and each added question can add extra passes, so keep them few. For "A but not B", write one question that says so. Optional per question: true and false descriptions, guidance for examples and exclusions, and threshold (default 0.2; lower passes more). Change a threshold only when eval cases support it. Keep actions in the Interest. Pass uncertain cases. Errors pass events through. Every answer says classifier: available or unavailable. Classifiers can be saved either way and run once one is available; until then a classified watch's events pass unchecked, and the turn they start says so in a <watch-classifier> block.

Event watches and timers share delivery: channel and optional root continue that conversation; omit both for an independent turn with the Interest instructions. A root requires a channel. The address selects the execution conversation and default posting destination; explicit reporting instructions in the Interest take precedence. It grants no additional permission.

Timer: its interval is at least 60 seconds, and it runs once by default. max_occurrences (a count, or "unbounded") and expires_at (Unix seconds, or "unbounded") control the budget; remaining budget schedules the next interval automatically. The final allowed wake says it is the last.

${WRITES}`,
    {
      interest: { ...str, description: "The Interest it serves." },
      id,
      type: { type: "string", enum: ["event", "timer"] },
      expected_state: token,
      ...watchFields
    },
    ["interest", "id", "type", "expected_state"]
  ),
  tool(
    "watch_update",
    'Change only the fields given; clear removes optional fields, such as a classifier with clear: ["classifier"]. When widening a watch, set its since floor to the change time. A timer keeps its next run when its interval changes; use watch_rearm to schedule it from now. How selectors, classifiers and timer budgets work is in watch_add.',
    {
      id,
      interest: scope,
      expected_state: token,
      ...watchFields,
      clear: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "name",
            "channel",
            "root",
            "authors",
            "exclude_authors",
            "tags",
            "is_reply",
            "classifier"
          ]
        }
      }
    },
    ["id", "expected_state"]
  ),
  ...[
    [
      "watch_enable",
      "Turn an event watch on. A timer is turned on by watch_rearm."
    ],
    [
      "watch_disable",
      "Turn a watch off; it is kept. A timer stays off until watch_rearm."
    ],
    [
      "watch_remove",
      "Remove a watch whose purpose is complete, superseded, or no longer relevant."
    ]
  ].map(
    ([name, description]) => tool(name, description, { id, interest: scope, expected_state: token }, [
      "id",
      "expected_state"
    ])
  ),
  tool(
    "watch_rearm",
    "Arm a timer, also one that is off: its next occurrence is one interval after at (default now, never earlier). Use it deliberately for a fresh deadline. It keeps its used occurrences and does not bypass expiration: a spent timer needs higher limits, which this takes too.",
    {
      id,
      interest: scope,
      expected_state: token,
      at: int,
      prompt: watchFields.prompt,
      interval_secs: int,
      max_occurrences: watchFields.max_occurrences,
      expires_at: watchFields.expires_at
    },
    ["id", "expected_state"]
  ),
  tool(
    "watch_show",
    "One watch and its expected_state; for a timer, its used occurrences, next_due and status. An addressed watch also reports held or blocked delivery when destination membership is unconfirmed or absent.",
    { id, interest: scope },
    ["id"]
  ),
  tool("watch_list", "Watch summaries. status spent finds spent timers.", {
    interest: str,
    type: { type: "string", enum: ["event", "timer"] },
    status: {
      type: "string",
      enum: ["enabled", "disabled", "armed", "inactive", "spent"]
    },
    search: { ...str, description: "Case-sensitive, in ids and names." }
  })
];
var NAMES = new Set(ATTENTION_TOOLS.map((item) => item.name));
var isAttentionTool = (name) => NAMES.has(name);
var UNAVAILABLE_NOTE = "No classifier can run on this device now, so this watch's events pass unchecked. It is kept, and runs once a classifier is available.";
async function callAttentionTool(attention, name, args) {
  const classifier = attention.classifier();
  try {
    return JSON.stringify(
      { classifier, ...await run(attention, name, args, classifier) },
      null,
      1
    );
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}
(classifier: ${classifier})`
    );
  }
}
async function run(attention, name, args, classifier) {
  const note = (object) => classifier === "unavailable" && object?.type === "event" && object.classifier ? { classifier_note: UNAVAILABLE_NOTE } : {};
  const shown = async (promise) => {
    const result = await promise;
    return { ...result, ...note(result.object) };
  };
  const scoped = text(args.interest);
  const watch = (key) => `watch/${required(args, key)}`;
  const options = () => ({
    expected: required(args, "expected_state"),
    ...scoped ? { interest: scoped } : {}
  });
  const edit = async (change, write = {}) => {
    const slug = watch("id");
    const current = (await attention.show(slug, scoped)).object;
    if (!current || current.type === "interest")
      throw new Error(`not-found: no watch ${String(args.id)}`);
    const value = change(
      stored(current),
      current.type === "timer" ? { used: current.used } : {}
    );
    return shown(
      attention.write(slug, value, {
        ...options(),
        ...write
      })
    );
  };
  switch (name) {
    case "interest_set":
      return attention.write(
        `interest/${required(args, "id")}`,
        { type: "interest", instructions: required(args, "instructions") },
        { expected: required(args, "expected_state") }
      );
    case "interest_show":
      return attention.show(`interest/${required(args, "id")}`);
    case "interest_list":
      return { interests: attention.interests(text(args.search)) };
    case "interest_remove":
      return attention.write(`interest/${required(args, "id")}`, null, {
        expected: required(args, "expected_state")
      });
    case "watch_add": {
      const interest = required(args, "interest");
      if ((await attention.show(watch("id"))).object)
        refuse(`watch ${String(args.id)} exists; use watch_update`);
      const now = seconds();
      const value = args.type === "timer" ? {
        type: "timer",
        interest_id: interest,
        enabled: true,
        armed_at: now,
        max_occurrences: 1,
        expires_at: null,
        ...timerFields(args)
      } : args.type === "event" ? {
        type: "event",
        interest_id: interest,
        enabled: true,
        kinds: [],
        ...eventFields(args)
      } : fail('type must be "event" or "timer"');
      return shown(
        attention.write(watch("id"), value, {
          expected: required(args, "expected_state"),
          interest
        })
      );
    }
    case "watch_update":
      return edit((value) => {
        const fields = value.type === "event" ? eventFields(args) : timerFields(args);
        const clear = Array.isArray(args.clear) ? args.clear : [];
        if (value.type === "timer" && clear.some((key) => !["channel", "root"].includes(String(key))))
          refuse("not an optional field of this timer");
        if (value.type === "timer" && !value.enabled && fields.enabled === true)
          refuse("use watch_rearm to turn a timer on");
        const next = { ...value, ...fields };
        for (const key of clear) delete next[String(key)];
        return next;
      });
    case "watch_enable":
    case "watch_disable":
      return edit((value) => {
        if (value.type === "timer" && name === "watch_enable")
          refuse("use watch_rearm to turn a timer on");
        return { ...value, enabled: name === "watch_enable" };
      });
    case "watch_rearm": {
      const { at, ...rest } = args;
      const now = seconds();
      if (at !== void 0 && (typeof at !== "number" || at < now))
        fail("at must be a Unix time no earlier than now");
      return edit(
        (value, status) => {
          if (value.type !== "timer") refuse("only a timer can be rearmed");
          const next = { ...value, ...timerFields(rest) };
          const used = status.used ?? 0;
          if (next.max_occurrences !== null && used >= next.max_occurrences || next.expires_at !== null && now >= next.expires_at)
            refuse(
              "the timer is spent; raise max_occurrences or expires_at to rearm it"
            );
          return {
            ...next,
            enabled: true,
            armed_at: typeof at === "number" ? at : now
          };
        },
        { rearm: true }
      );
    }
    case "watch_remove":
      return attention.write(watch("id"), null, options());
    case "watch_show":
      return shown(attention.show(watch("id"), scoped));
    case "watch_list": {
      const search = text(args.search);
      return {
        watches: attention.watches({
          ...scoped ? { interest: scoped } : {},
          ...args.type === "event" || args.type === "timer" ? { type: args.type } : {},
          ...typeof args.status === "string" ? { status: args.status } : {},
          ...search ? { search } : {}
        }).map(
          (summary) => summary.classified && classifier === "unavailable" ? { ...summary, classifier: "unavailable" } : summary
        )
      };
    }
    default:
      throw new Error(`No tool ${name}`);
  }
}
function stored(object) {
  const {
    id: _,
    status: __,
    ...rest
  } = object;
  const {
    used: ___,
    next_due: ____,
    ...value
  } = rest;
  return value;
}
var EVENT = [
  "channel",
  "root",
  "name",
  "enabled",
  "since",
  "channels",
  "kinds",
  "authors",
  "exclude_authors",
  "tags",
  "is_reply",
  "classifier"
];
var TIMER = [
  "channel",
  "root",
  "enabled",
  "prompt",
  "interval_secs",
  "max_occurrences",
  "expires_at"
];
function pick(args, names, other) {
  const wrong = other.filter((key) => !names.includes(key) && key in args);
  if (wrong.length) fail(`Not a field of this watch type: ${wrong.join(", ")}`);
  return Object.fromEntries(
    names.filter((key) => args[key] !== void 0).map((key) => [key, args[key]])
  );
}
function eventFields(args) {
  const fields = pick(args, EVENT, TIMER);
  if (fields.since === "now") fields.since = seconds();
  return fields;
}
function timerFields(args) {
  const fields = pick(args, TIMER, EVENT);
  for (const key of ["max_occurrences", "expires_at"])
    if (fields[key] === "unbounded") fields[key] = null;
  return fields;
}
var seconds = () => Math.floor(Date.now() / 1e3);
var fail = (message) => {
  throw new Error(`invalid: ${message}`);
};
var refuse = (message) => {
  throw new Error(`invalid-operation: ${message}`);
};
var text = (value) => typeof value === "string" && value.trim() ? value.trim() : void 0;
function required(args, name) {
  const value = args[name];
  if (typeof value === "string" && value) return value;
  if (name === "expected_state")
    refuse("every write needs the expected_state of a show");
  return fail(`${name} is required`);
}

// src/buzz-mcp/tools.ts
import { decode, npubEncode } from "nostr-tools/nip19";

// src/features/relay/events.ts
import {
  getEventHash,
  verifyEvent,
  verifiedSymbol
} from "nostr-tools";

// src/features/relay/budget.ts
var OUTBOX_INPUT_MAX_BYTES = 32 * 1024;

// src/features/relay/channel-lifecycle-protocol.ts
var CHANNEL_LIFECYCLE_KINDS = [9002, 9008, 9021, 9022, 41012];
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function lifecycleChannelId(value) {
  if (typeof value !== "string" || !UUID.test(value))
    throw new Error("Invalid channel ID");
  return value;
}
function lifecycleTemplate(action, channelId) {
  const kind = {
    archive: 9002,
    unarchive: 9002,
    delete: 9008,
    join: 9021,
    leave: 9022,
    hide: 41012
  }[action];
  const event = {
    kind,
    created_at: Math.floor(Date.now() / 1e3),
    content: "",
    tags: [
      ["h", lifecycleChannelId(channelId)],
      ...action === "archive" || action === "unarchive" ? [["archived", action === "archive" ? "true" : "false"]] : []
    ]
  };
  validateLifecycleTemplate(event);
  return event;
}
function validateLifecycleTemplate(event) {
  if (!event || !CHANNEL_LIFECYCLE_KINDS.some((kind) => kind === event.kind) || event.content !== "" || !Number.isSafeInteger(event.created_at) || event.created_at < 0 || !Array.isArray(event.tags) || event.tags.length !== (event.kind === 9002 ? 2 : 1) || event.tags[0]?.length !== 2 || event.tags[0]?.[0] !== "h")
    throw new Error("Invalid channel lifecycle command");
  lifecycleChannelId(event.tags[0]?.[1] ?? "");
  if (event.kind === 9002 && !["true", "false"].some(
    (value) => JSON.stringify(event.tags[1]) === JSON.stringify(["archived", value])
  ))
    throw new Error("Only archive metadata may be changed here");
}

// src/features/relay/channel-labels.ts
var MAX_CHANNEL_LABELS = 8;
var CHANNEL_TYPES = /* @__PURE__ */ new Set(["stream", "forum", "dm", "workflow", "system"]);
var LABEL = /^[a-z0-9.:-]{1,64}$/;
function validChannelLabel(value) {
  return typeof value === "string" && LABEL.test(value) && !CHANNEL_TYPES.has(value);
}
function channelLabelTags(labels) {
  const unique = [...new Set(labels)];
  if (unique.length > MAX_CHANNEL_LABELS)
    throw new Error(`Use at most ${MAX_CHANNEL_LABELS} channel labels.`);
  for (const label of unique)
    if (!validChannelLabel(label))
      throw new Error(
        "Use channel labels of 1\u201364 characters from a-z, 0-9, '.', ':' and '-', other than a channel type name."
      );
  return unique.map((label) => ["t", label]);
}

// src/features/relay/channel-details-protocol.ts
function canonicalDetailsName(name) {
  return name.replace(/^[#\p{White_Space}]+|\p{White_Space}+$/gu, "");
}
function detailsDraftErrors(draft) {
  return {
    name: !draft || typeof draft.name !== "string" || !draft.name || draft.name !== canonicalDetailsName(draft.name) || [...draft.name].length > 120 ? "Enter a channel name of 1\u2013120 characters without a leading #." : void 0,
    description: !draft || typeof draft.description !== "string" || [...draft.description].length > 1e3 ? "Use a description of at most 1,000 characters." : draft.description.includes("Buzz Huddle (") ? 'Remove "Buzz Huddle (" from the description; that text is used by Buzz for Huddles.' : void 0,
    lifetime: draft?.ttlSeconds !== void 0 && (!Number.isInteger(draft.ttlSeconds) || draft.ttlSeconds <= 0 || draft.ttlSeconds > 2147483647) ? "Channel duration could not be verified." : void 0,
    visibility: !draft || draft.visibility !== "public" && draft.visibility !== "private" ? "Channel visibility could not be verified." : void 0,
    labels: labelsError(draft?.labels)
  };
}
function labelsError(labels) {
  if (labels === void 0) return void 0;
  if (!Array.isArray(labels)) return "Channel labels could not be verified.";
  try {
    channelLabelTags(labels);
    return void 0;
  } catch (error) {
    return error.message;
  }
}

// src/features/relay/profile-search.ts
var PROFILE_SEARCH_MAX = 100;
var PROFILE_SEARCH_QUERY_MAX = 100;
var PROFILE_SEARCH_RETRY_MS = 5 * 6e4;

// src/features/relay/message-content.ts
import { fromMarkdown } from "mdast-util-from-markdown";
var MAX_ATTACHMENT_NAME_LENGTH = 256;
function safeAttachmentName(value) {
  const name = value.slice(0, MAX_ATTACHMENT_NAME_LENGTH);
  return name && !hasUnsafeAttachmentNameCharacter(name) ? name : void 0;
}
function hasUnsafeAttachmentNameCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === void 0) continue;
    if (code <= 31 || code >= 127 && code <= 159) return true;
    if (code === 8206 || code === 8207) return true;
    if (code >= 8234 && code <= 8238) return true;
    if (code >= 8294 && code <= 8297) return true;
  }
  return false;
}

// src/features/relay/attachment-limits.ts
var MIB = 1024 * 1024;
var UPLOAD_MAX_BYTES = 500 * MIB;

// src/features/relay/attachments.ts
function attachmentName(file) {
  let name = "";
  let bytes = 0;
  for (const char of file) {
    const clean = !safeAttachmentName(char) || char === "/" || char === "\\" ? " " : char;
    bytes += new TextEncoder().encode(clean).length;
    if (bytes > 255) break;
    name += clean;
  }
  return name.trim() || "File";
}
function attachmentMarkdown(name, result) {
  const label = Array.from(
    name,
    (char) => char.charCodeAt(0) < 32 ? " " : char
  ).join("").replace(/[\\`*_{}[\]()!<>&]/g, "\\$&");
  const image = /^(image\/(png|jpeg|gif|webp)|video\/mp4)$/.test(result.type);
  return `${image ? "!" : ""}[${label}](<${result.url}>)`;
}

// src/features/relay/thread-reference.ts
function threadReference(event) {
  let root;
  let reply;
  for (const [name, value, , marker] of event.tags) {
    if (name !== "e" || !value || !/^[0-9a-f]{64}$/i.test(value)) continue;
    if (marker === "root") root = value.toLowerCase();
    if (marker === "reply") reply = value.toLowerCase();
  }
  return reply ? { rootId: root ?? reply, parentId: reply } : void 0;
}

// src/features/agents/owner-attestation.ts
import { schnorr } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "nostr-tools/utils";
var KEY = /^[0-9a-f]{64}$/;
var SIG = /^[0-9a-f]{128}$/;
var CLAUSE = /^(kind=|created_at<|created_at>)(0|[1-9][0-9]*)$/;
async function attestedOwner(event) {
  const [tag3, ...extra] = event.tags.filter((tag4) => tag4[0] === "auth");
  if (!tag3 || extra.length || !satisfied(tag3[2] ?? "", event)) return void 0;
  return authTagOwner(event.pubkey, tag3);
}
async function authTagOwner(target2, tag3) {
  const [name, owner, conditions, sig] = tag3;
  if (name !== "auth" || tag3.length !== 4 || !owner || conditions === void 0 || !sig || !KEY.test(owner) || !SIG.test(sig) || owner === target2 || !validConditions(conditions))
    return void 0;
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`nostr:agent-auth:${target2}:${conditions}`)
    );
    return schnorr.verify(
      hexToBytes(sig),
      new Uint8Array(digest),
      hexToBytes(owner)
    ) ? owner : void 0;
  } catch {
    return void 0;
  }
}
function validConditions(conditions) {
  return conditions === "" || conditions.split("&").every((clause) => {
    const [, name, digits] = CLAUSE.exec(clause) ?? [];
    if (!name || !digits) return false;
    return Number(digits) <= (name === "kind=" ? 65535 : 4294967295);
  });
}
function satisfied(conditions, event, ignoreKind = false) {
  if (!validConditions(conditions)) return false;
  if (conditions === "") return true;
  return conditions.split("&").every((clause) => {
    const [, name, digits] = CLAUSE.exec(clause) ?? [];
    const value = Number(digits);
    if (name === "kind=") return ignoreKind || event.kind === value;
    return name === "created_at<" ? event.created_at < value : event.created_at > value;
  });
}

// src/buzz-mcp/tools.ts
var ROLES = ["owner", "admin", "member", "guest", "bot"];
var str2 = { type: "string" };
var strs = { type: "array", items: str2 };
var CHANNEL_TYPES2 = ["stream", "forum", "dm", "workflow", "system"];
var tool2 = (name, description, properties, required3 = []) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties,
    ...required3.length ? { required: required3 } : {},
    additionalProperties: false
  }
});
var TOOLS = [
  tool2(
    "agent_types",
    "List installed local agent types available for agent_create.",
    {}
  ),
  tool2(
    "agent_create",
    "Submit an unsaved agent-creation draft for your owner to review. Nothing is created until they save it. Use a type key from agent_types.",
    { type: str2, name: str2 },
    ["type", "name"]
  ),
  tool2(
    "agent_update",
    "Submit an unsaved draft of changes to one of your owner's agents for them to review. agent is its pubkey or exact name; type is a key from agent_types. Nothing changes until they save it.",
    { agent: str2, name: str2, type: str2, instructions: str2 },
    ["agent"]
  ),
  tool2(
    "send",
    "Post a message. Without channel, replies in the current thread. A reply goes in its message's thread.",
    {
      text: str2,
      path: str2,
      channel: str2,
      reply: str2,
      files: strs,
      mentions: strs,
      audience: {
        type: "string",
        enum: ["everyone", "agents"],
        description: "agents: only other agents need this (delegating, asking or answering an agent)"
      },
      final: {
        type: "boolean",
        description: "Your last message this turn; ends the turn."
      }
    },
    ["audience"]
  ),
  tool2("edit", "Edit your message.", { id: str2, text: str2 }, ["id", "text"]),
  tool2(
    "react",
    "React to a message.",
    { id: str2, emoji: str2, off: { type: "boolean" } },
    ["id", "emoji"]
  ),
  tool2(
    "read",
    "Read a thread (default: current), a channel's latest, or search with q.",
    {
      channel: str2,
      thread: str2,
      q: str2,
      author: {
        type: "string",
        description: "With q or channel: only this hex pubkey or npub."
      },
      since: {
        type: "integer",
        description: "With q or channel: Unix seconds, at or after."
      },
      before: { type: "integer", description: "Unix seconds, at or before." },
      before_id: {
        type: "string",
        description: "For paginating: with before, from a continue line."
      },
      limit: {
        type: "integer",
        description: "Search 20 (max 100), thread 100 (500), channel 30 (200)."
      }
    }
  ),
  tool2(
    "channels",
    "Channels you are in; with all, every one you can see. types lists only channels of those types; system channels are listed only when types has system.",
    {
      q: str2,
      all: { type: "boolean" },
      types: {
        type: "array",
        items: { type: "string", enum: CHANNEL_TYPES2 },
        minItems: 1,
        uniqueItems: true
      }
    }
  ),
  tool2(
    "channel",
    "Channel details (default: current), or an action on it. create may use your owner's template, by name. delete is permanent.",
    {
      channel: str2,
      action: {
        type: "string",
        enum: [
          "create",
          "update",
          "join",
          "leave",
          "archive",
          "unarchive",
          "delete"
        ]
      },
      name: str2,
      about: str2,
      visibility: { type: "string", enum: ["open", "private"] },
      type: {
        type: "string",
        enum: ["stream", "forum", "system"],
        description: "system: left out of ordinary channel lists. An open one is still found by anyone who lists system channels."
      },
      ttl: {
        type: "integer",
        description: "Seconds without a message before it archives; 0: never."
      },
      topic: str2,
      purpose: str2,
      template: str2
    }
  ),
  tool2(
    "members",
    "A channel's members; add or remove pubkeys or npubs, giving those added a role.",
    {
      channel: str2,
      add: strs,
      remove: strs,
      role: { type: "string", enum: ROLES }
    }
  ),
  tool2("users", "Profiles by pubkey or name.", { ids: strs, q: str2 }),
  tool2("dm", "Open a DM; returns its channel.", { to: strs }, ["to"]),
  tool2("mem_get", "Read memory; without slug, list slugs.", { slug: str2 }),
  tool2("mem_set", "Write memory.", { slug: str2, text: str2, path: str2 }, [
    "slug"
  ]),
  tool2(
    "notes_get",
    "Read a shared note, such as a team runbook, by name; without name, list notes. author: me (default for lists), all, an npub, a hex pubkey or a display name.",
    {
      name: str2,
      author: str2,
      latest: { type: "boolean" },
      tag: str2,
      limit: { type: "integer" }
    }
  ),
  tool2(
    "notes_set",
    "Publish your note under name, replacing your earlier one. title is needed the first time; title, summary and tags carry over when left out.",
    { name: str2, title: str2, summary: str2, tags: strs, text: str2, path: str2 },
    ["name"]
  ),
  tool2("notes_rm", "Delete your note.", { name: str2 }, ["name"]),
  tool2("canvas", "Read a channel's canvas, or replace it.", {
    channel: str2,
    text: str2,
    path: str2
  }),
  tool2(
    "media_get",
    "Get a file of any type from a Buzz media URL: saves it locally and gives its path; an image is also shown.",
    { url: str2 },
    ["url"]
  ),
  tool2(
    "repo",
    "A channel's Git repository (default: current): its URL and a header that lets git clone, fetch and push it as you for 60 seconds. create starts one for the channel.",
    {
      channel: str2,
      create: { type: "string", description: "The new repository's name." },
      repo: { type: "string", description: "owner/name, when it has several." }
    }
  ),
  tool2(
    "tabs",
    "Your owner's open tabs for this channel's threads, or open, close or rename a thread's tab. Opening never takes their focus; no name clears a rename.",
    {
      action: { type: "string", enum: ["open", "close", "rename"] },
      thread: str2,
      name: str2
    }
  )
];
var MESSAGES = [9, 40002, 40008, 45001, 45003];
var THREAD = [9, 40002, 40008, 45003];
var SEARCH = [9, 40002, 45001, 45003];
var HEX = /^[0-9a-f]{64}$/;
var NOTE = 30023;
var REPO = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,63}$/;
var REPO_PAGES = 5;
var creating = /* @__PURE__ */ new Map();
var PAGE = 500;
var MAX_EVENTS = 1e4;
var CHANNEL_BYTES = 16384;
var CHANNEL_PARTIAL = "Partial channel list: scan or output limit reached. Narrow with q or use a known channel ID.";
var ACTIONS = {
  details: [],
  create: ["name", "about", "visibility", "type", "ttl", "template"],
  update: ["name", "about", "visibility", "ttl", "topic", "purpose"],
  join: [],
  leave: [],
  archive: [],
  unarchive: [],
  delete: []
};
function callTool(client, context, name, args) {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`No tool ${name}`);
  return handler(new Tools(client, context), args);
}
var HANDLERS = {
  async agent_types({ client }) {
    if (!client.agentTypes)
      throw new Error("Agent creation is unavailable on this host");
    return JSON.stringify(await client.agentTypes());
  },
  async agent_create({ client }, args) {
    if (!client.createAgent)
      throw new Error("Agent creation is unavailable on this host");
    const type = text2(args.type)?.trim();
    const name = text2(args.name)?.trim();
    if (!type || !name) throw new Error("type and name are required");
    return JSON.stringify(await client.createAgent({ type, name }));
  },
  async agent_update({ client }, args) {
    if (!client.updateAgent)
      throw new Error("Agent changes are unavailable on this host");
    const agent = text2(args.agent);
    if (!agent) throw new Error("agent is required");
    const name = text2(args.name);
    const type = text2(args.type);
    const { instructions } = args;
    return JSON.stringify(
      await client.updateAgent({
        agent,
        ...name && { name },
        ...type && { type },
        ...typeof instructions === "string" && { instructions }
      })
    );
  },
  async send(tools, args) {
    const { client, context } = tools;
    const reply = text2(args.reply) ?? (args.channel === void 0 ? context.root : void 0);
    const channel = text2(args.channel) ?? (reply && reply !== context.root ? tag2(await tools.event(reply), "h") : void 0) ?? context.channel;
    if (!channel) throw new Error("channel is required here.");
    if (reply && context.topLevel && channel === context.channel)
      throw new Error(
        "This chat stays at the top level: send again without reply."
      );
    if (args.audience !== "everyone" && args.audience !== "agents")
      throw new Error("audience must be everyone or agents.");
    const files = await tools.attach(list(args.files));
    const content2 = `${await tools.body(args, !files.links) ?? ""}${files.links}`;
    const thread = reply ? await tools.threadTags(reply) : [];
    const mentions = await tools.mentions(
      channel,
      content2,
      list(args.mentions)
    );
    const event = await client.publish({
      kind: 9,
      content: content2,
      tags: [
        ["h", channel],
        ...thread,
        ...mentions.map((pubkey2) => ["p", pubkey2]),
        ...files.tags,
        ...args.audience === "agents" ? [["audience", "agents"]] : []
      ]
    });
    return `sent ${event.id}`;
  },
  async edit(tools, args) {
    const id2 = required2(args, "id");
    const target2 = await tools.event(id2);
    const channel = tag2(target2, "h");
    if (!channel) throw new Error(`${id2} is not a channel message.`);
    await tools.client.publish({
      kind: 40003,
      content: required2(args, "text"),
      // An edit replaces the attachments too, so it keeps the message's.
      tags: [
        ["h", channel],
        ["e", id2],
        ...target2.tags.filter((t) => t[0] === "imeta")
      ]
    });
    return "edited";
  },
  async react(tools, args) {
    const { client } = tools;
    const id2 = required2(args, "id");
    const emoji = required2(args, "emoji");
    if (args.off !== true) {
      await client.publish({ kind: 7, content: emoji, tags: [["e", id2]] });
      return "reacted";
    }
    const mine = await client.query([
      { kinds: [7], "#e": [id2], authors: [client.pubkey], limit: 100 }
    ]);
    const reaction = mine.find((event) => event.content === emoji);
    if (!reaction) return "no such reaction";
    await client.publish({ kind: 5, content: "", tags: [["e", reaction.id]] });
    return "removed";
  },
  async read(tools, args) {
    const { client, context } = tools;
    const limit = typeof args.limit === "number" ? args.limit : void 0;
    const before = unixTime(args, "before");
    const since = unixTime(args, "since");
    if (since !== void 0 && before !== void 0 && since > before)
      throw new Error("since must not be after before.");
    let author;
    if (args.author !== void 0)
      try {
        author = pubkey(args.author);
      } catch {
        throw new Error(
          "author must be a hex pubkey or npub; users finds one by name."
        );
      }
    const beforeId = args.before_id;
    if (beforeId !== void 0 && before === void 0)
      throw new Error("before_id needs before, from the same continue line.");
    if (beforeId !== void 0 && (typeof beforeId !== "string" || !HEX.test(beforeId)))
      throw new Error("before_id must be a 64-character event ID.");
    const filters = {
      ...author ? { authors: [author] } : {},
      ...since !== void 0 ? { since } : {}
    };
    const cursor = {
      ...before !== void 0 ? { until: before } : {},
      ...beforeId ? { before_id: beforeId } : {}
    };
    const q = text2(args.q);
    let channel = text2(args.channel) ?? context.channel;
    if (q) {
      if (beforeId)
        throw new Error(
          "before_id pages thread and channel reads; narrow a search with before or since."
        );
      const max2 = bound(limit, 20, 100);
      const found2 = await client.query([
        {
          kinds: SEARCH,
          search: q,
          limit: max2,
          ...args.channel ? { "#h": [channel] } : {},
          ...cursor,
          ...filters
        }
      ]);
      const lines2 = await tools.messages(found2, {});
      if (!lines2.length) return "No messages.";
      if (found2.length >= max2)
        lines2.push(
          "Result limit reached; more matches may exist. Narrow with channel, author, since or before."
        );
      return lines2.join("\n");
    }
    let scope2;
    let max;
    let more;
    let found;
    let first;
    if (text2(args.thread) || args.channel === void 0 && context.root) {
      if (author || since !== void 0)
        throw new Error(
          "author and since filter a search (q) or a channel read, not a thread; add q or channel."
        );
      const id2 = text2(args.thread) ?? context.root;
      let root = id2;
      if (id2 !== context.root) {
        const event = await tools.event(id2);
        root = rootOf(event);
        channel = tag2(event, "h") ?? channel;
      }
      if (!channel) throw new Error("channel is required here.");
      max = bound(limit, 100, 500);
      const events = await client.query([
        {
          kinds: THREAD,
          "#h": [channel],
          "#e": [root],
          limit: max + 1,
          ...cursor
        },
        ...before === void 0 ? [{ ids: [root], kinds: [...THREAD, 45001], limit: 1 }] : []
      ]);
      first = events.find((event) => event.id === root);
      found = events.filter((event) => event.id !== root);
      scope2 = { channel, root };
      more = { thread: root, limit: max };
    } else {
      if (!channel) throw new Error("channel is required here.");
      max = bound(limit, 30, 200);
      found = await client.query([
        {
          kinds: MESSAGES,
          "#h": [channel],
          limit: max + 1,
          ...cursor,
          ...filters
        }
      ]);
      scope2 = { channel };
      more = {
        channel,
        ...author ? { author } : {},
        ...since !== void 0 ? { since } : {},
        limit: max
      };
    }
    const shown = found.slice(0, max);
    const last = shown.at(-1);
    const lines = await tools.messages(
      first ? [first, ...shown] : shown,
      scope2
    );
    if (!lines.length) return "No messages.";
    const noun = scope2.root ? "replies" : "messages";
    return [
      scope2.root ? `thread ${scope2.root} in ${channel}` : `channel ${channel}`,
      ...lines,
      last && found.length > max ? `Older ${noun} remain; continue with ${JSON.stringify({ ...more, before: last.created_at, before_id: last.id })}` : `The relay returned no older ${noun}.`
    ].join("\n");
  },
  async channels(tools, args) {
    const { client } = tools;
    const ids = /* @__PURE__ */ new Set();
    const types = args.types === void 0 ? void 0 : list(args.types);
    if (types && (!Array.isArray(args.types) || !types.length || types.length !== args.types.length || types.some((type) => !CHANNEL_TYPES2.includes(type))))
      throw new Error(`types must list some of ${CHANNEL_TYPES2.join(", ")}.`);
    const scope2 = types ? { "#t": [...new Set(types)] } : {};
    const member = (event) => {
      const id2 = tag2(event, "d");
      if (id2) ids.add(id2);
      return true;
    };
    const memberships = { kinds: [39002], "#p": [client.pubkey] };
    let membershipsComplete = true;
    if (!types || types.some((type) => type !== "system"))
      membershipsComplete = await tools.scan(memberships, member);
    if (types?.includes("system"))
      membershipsComplete = await tools.scan({ ...memberships, "#t": ["system"] }, member) && membershipsComplete;
    const all = args.all === true;
    const q = text2(args.q)?.toLowerCase();
    const rows = [];
    const encoder = new TextEncoder();
    let bytes = encoder.encode(CHANNEL_PARTIAL).length;
    const channelsComplete = !ids.size && !all ? true : await tools.scan(
      all ? { kinds: [39e3], ...scope2 } : { kinds: [39e3], "#d": [...ids], ...scope2 },
      (event) => {
        const id2 = tag2(event, "d") ?? "";
        const flags = [
          tag2(event, "t") === "stream" ? "" : tag2(event, "t"),
          has(event, "private") ? "private" : "",
          has(event, "archived") ? "archived" : "",
          ids.has(id2) ? "" : membershipsComplete ? "not joined" : "membership unknown"
        ].filter(Boolean);
        const row = `${id2} ${tag2(event, "name") ?? ""}${flags.length ? ` (${flags.join(", ")})` : ""}`;
        if (q && !row.toLowerCase().includes(q)) return true;
        if (rows.length === PAGE) return false;
        const size = encoder.encode(row).length + 1;
        if (bytes + size > CHANNEL_BYTES) {
          const brief = `${id2} (details omitted; use channel for details)`;
          if (bytes + encoder.encode(brief).length + 1 <= CHANNEL_BYTES)
            rows.push(brief);
          return false;
        }
        rows.push(row);
        bytes += size;
        return true;
      }
    );
    if (!membershipsComplete || !channelsComplete) rows.push(CHANNEL_PARTIAL);
    return rows.join("\n") || "No channels.";
  },
  async channel(tools, args) {
    const { client } = tools;
    const action = args.action ?? "details";
    const fields = typeof action === "string" && Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : void 0;
    if (typeof action !== "string" || !fields)
      throw new Error(
        `action must be one of ${Object.keys(ACTIONS).join(", ")}.`
      );
    const extra = Object.keys(args).filter(
      (key) => key !== "channel" && key !== "action" && !fields.includes(key)
    );
    if (extra.length)
      throw new Error(`${extra.join(", ")} cannot be used with ${action}.`);
    if (action === "create") {
      if (args.channel !== void 0)
        throw new Error("create makes a new channel; leave out channel.");
      return tools.create(args);
    }
    const channel = target(tools, args);
    if (action === "details") return tools.details(channel);
    if (action === "update") return tools.update(channel, args);
    const { kind, content: content2, tags } = lifecycleTemplate(
      action,
      channel
    );
    await client.publish({ kind, content: content2, tags });
    const shown = async () => {
      if (action === "join" || action === "leave")
        return (await tools.roster(channel)).some(
          (member) => member.pubkey === client.pubkey
        ) === (action === "join");
      const metadata = await tools.metadata(channel);
      if (action === "delete") return !metadata;
      return !!metadata && has(metadata, "archived") === (action === "archive");
    };
    const done = {
      join: "joined",
      leave: "left",
      archive: "archived",
      unarchive: "unarchived",
      delete: "deleted"
    };
    const now = await until(shown, Boolean).catch(unread);
    if (now === true) return `${done[action]} ${channel}`;
    return `The community accepted ${action} but ${now ? now.message : "does not show it yet"}.`;
  },
  async members(tools, args) {
    const channel = target(tools, args);
    const add = keys(args, "add");
    const remove = keys(args, "remove");
    const role = args.role;
    if (role !== void 0 && !ROLES.includes(role))
      throw new Error(`role must be one of ${ROLES.join(", ")}.`);
    if (role !== void 0 && !add.length)
      throw new Error("role is for the members you add.");
    if (add.length || remove.length) {
      lifecycleChannelId(channel);
      if ([...add, ...remove].includes(tools.client.pubkey))
        throw new Error("For yourself, use channel with action join or leave.");
      if (add.some((key) => remove.includes(key)))
        throw new Error("Add or remove someone, not both.");
      if (add.length + remove.length > 50)
        throw new Error("Change at most 50 members at a time.");
      const { lines, changed } = await tools.change(
        channel,
        add,
        remove,
        role
      );
      if (!changed) throw new Error(lines.join("\n"));
      return lines.join("\n");
    }
    const members = await tools.members(channel);
    const names = await tools.names(members.map((member) => member.pubkey));
    return members.map(
      ({ pubkey: pubkey2, role: role2 }) => `${pubkey2} ${names.get(pubkey2) ?? ""}${role2 === "member" ? "" : ` (${role2})`}`
    ).join("\n");
  },
  async users(tools, args) {
    const { client } = tools;
    const ids = list(args.ids).map(pubkey);
    const q = text2(args.q)?.toLowerCase();
    if (!ids.length && !q) throw new Error("Give ids or q.");
    const named = !ids.length && q && [...q].length <= PROFILE_SEARCH_QUERY_MAX ? await client.searchProfiles?.(q, PROFILE_SEARCH_MAX) : void 0;
    const profiles = named?.filter((event) => event.kind === 0) ?? await client.query([
      ids.length ? { kinds: [0], authors: ids, limit: ids.length } : { kinds: [0], search: q, limit: 100 }
    ]);
    const rows = newest(profiles).map((event) => {
      const profile = parse(event.content);
      const name = profileName(profile) ?? "";
      const about = typeof profile.about === "string" && profile.about.trim() ? ` \u2014 ${profile.about.trim().slice(0, 120)}` : "";
      return { name, row: `${event.pubkey} ${name}${about}` };
    }).filter(
      ({ name }) => !q || ids.length || named || name.toLowerCase().includes(q)
    );
    return rows.map(({ row }) => row).join("\n") || "No users.";
  },
  async dm(tools, args) {
    const { client } = tools;
    const to = list(args.to).map(pubkey);
    if (!to.length) throw new Error("to is required.");
    const people = /* @__PURE__ */ new Set([client.pubkey, ...to]);
    const find = async () => (await client.query([
      { kinds: [39e3], "#p": [client.pubkey], "#t": ["dm"], limit: 500 }
    ])).find((event) => {
      const members = new Set(
        event.tags.filter((t) => t[0] === "p").map((t) => t[1])
      );
      return members.size === people.size && [...people].every((key) => members.has(key));
    });
    let found = await find();
    if (!found) {
      await client.publish({
        kind: 41010,
        content: "",
        tags: [...to.map((key) => ["p", key]), ["d", crypto.randomUUID()]]
      });
      for (let tries = 0; !found && tries < 5; tries++) {
        if (tries) await new Promise((resolve) => setTimeout(resolve, 400));
        found = await find();
      }
    }
    const channel = found && tag2(found, "d");
    if (!channel) throw new Error("The DM did not open.");
    return channel;
  },
  async mem_get(tools, args) {
    const slug = text2(args.slug);
    if (!slug) {
      const { entries: entries2, partial: partial2 } = await tools.client.memories();
      const lines = entries2.map((entry) => `${entry.slug} ${time(entry.createdAt)}`).join("\n");
      if (!partial2) return lines || "No memory.";
      if (!lines) throw new Error("Memory could not be read; try again.");
      return `${lines}
This list is incomplete: some memory could not be read.`;
    }
    const key = memorySlug(slug);
    const { entries, partial } = await tools.client.memories(key);
    const body = entries.find((entry) => entry.slug === key)?.body;
    if (body !== void 0) return body;
    if (partial) throw new Error(`Memory ${key} could not be read; try again.`);
    return `No memory ${key}.`;
  },
  async mem_set(tools, args) {
    const key = memorySlug(required2(args, "slug"));
    const body = await tools.body(args, true);
    const { entries, partial } = await tools.client.memories(key);
    const current = entries.find((entry) => entry.slug === key);
    if (!current && partial)
      throw new Error(`Memory ${key} could not be read; try again.`);
    await tools.client.remember(key, body, current?.createdAt ?? 0);
    return "saved";
  },
  async notes_get(tools, args) {
    const { client } = tools;
    const name = args.name === void 0 ? void 0 : noteSlug(args.name);
    const author = optional(args, "author");
    if (name === void 0) {
      if (args.latest !== void 0)
        throw new Error("latest is for reading a note by name.");
      const who = author || "me";
      const topic = optional(args, "tag");
      const limit = typeof args.limit === "number" ? args.limit : void 0;
      const notes2 = latestNotes(
        await client.query([
          {
            kinds: [NOTE],
            ...who === "all" ? {} : { authors: [await tools.author(who)] },
            ...topic ? { "#t": [topic] } : {},
            limit: bound(limit, 50, 200)
          }
        ])
      );
      if (!notes2.length) return "No notes.";
      const names2 = await tools.names(notes2.map((note2) => note2.pubkey));
      return notes2.map(
        (note2) => `${tag2(note2, "d")} ${note2.pubkey} ${names2.get(note2.pubkey) ?? ""} ${time(note2.created_at)} ${tag2(note2, "title") || "(untitled)"}`
      ).join("\n");
    }
    if (args.tag !== void 0 || args.limit !== void 0)
      throw new Error("tag and limit are for listing notes, without name.");
    if (author === "all")
      throw new Error("author all is for listing; leave author out instead.");
    if (author && args.latest === true)
      throw new Error("Give author or latest, not both.");
    const notes = latestNotes(
      await client.query([
        {
          kinds: [NOTE],
          "#d": [name],
          ...author ? { authors: [await tools.author(author)] } : {},
          limit: 50
        }
      ])
    );
    const names = await tools.names(notes.map((note2) => note2.pubkey));
    if (!notes.length) return `No note ${name}.`;
    if (notes.length > 1 && args.latest !== true)
      throw new Error(
        `${notes.length} authors have a note ${name}; give author or latest.
${notes.map(
          (note2) => `${note2.pubkey} ${names.get(note2.pubkey) ?? ""} ${time(note2.created_at)} ${tag2(note2, "title") || "(untitled)"}`
        ).join("\n")}`
      );
    const note = notes[0];
    const topics = note.tags.filter((t) => t[0] === "t" && t[1]);
    return [
      `${NOTE}:${note.pubkey}:${name} by ${names.get(note.pubkey) ?? note.pubkey}, ${time(note.created_at)}`,
      `title: ${tag2(note, "title") ?? ""}`,
      ...has(note, "summary") ? [`summary: ${tag2(note, "summary")}`] : [],
      ...topics.length ? [`tags: ${topics.map((t) => t[1]).join(", ")}`] : [],
      "",
      note.content
    ].join("\n");
  },
  async notes_set(tools, args) {
    const { client } = tools;
    const name = noteSlug(args.name);
    const body = await tools.body(args, true);
    if (!body.trim()) throw new Error("A note needs text.");
    const given = (key) => {
      const value = args[key];
      if (value !== void 0 && typeof value !== "string")
        throw new Error(`${key} must be text.`);
      return value;
    };
    const title = given("title");
    const summary = given("summary");
    if (args.tags !== void 0 && (!Array.isArray(args.tags) || !args.tags.every((item) => typeof item === "string" && item.trim())))
      throw new Error("tags must be a list of words.");
    const own = {
      kinds: [NOTE],
      authors: [client.pubkey],
      "#d": [name],
      limit: 1,
      consistency: "strong"
    };
    const [prior] = latestNotes(await client.query([own]));
    if (title === void 0 && !prior)
      throw new Error("title is required for a new note.");
    const kept = (key) => prior?.tags.filter((t) => t[0] === key && t[1]).map((t) => t[1]) ?? [];
    const topics = args.tags === void 0 ? kept("t") : args.tags.map((t) => t.trim());
    const about = summary ?? (prior && tag2(prior, "summary"));
    const after = prior ? (prior.created_at + 1) * 1e3 : 0;
    if (after - Date.now() > 5e3)
      throw new Error("The note was just changed; try again.");
    await waitUntil(after);
    const saved = await client.publish({
      kind: NOTE,
      content: body,
      tags: [
        ["d", name],
        ["title", title ?? tag2(prior, "title") ?? ""],
        ...about === void 0 ? [] : [["summary", about]],
        ...topics.map((topic) => ["t", topic]),
        [
          "published_at",
          kept("published_at")[0] ?? String(Math.floor(Date.now() / 1e3))
        ]
      ]
    });
    const [current] = latestNotes(await client.query([own]));
    if (!current)
      throw new Error(
        `conflict: note ${name} was not found after this write. Read it with notes_get, then write again.`
      );
    if (current.id !== saved.id)
      throw new Error(
        `conflict: note ${name} now holds another version (${current.id}, ${time(current.created_at)}), not this text. Read it with notes_get, then write again.`
      );
    return `saved ${NOTE}:${client.pubkey}:${name}`;
  },
  async notes_rm(tools, args) {
    const { client } = tools;
    const name = noteSlug(args.name);
    const [mine] = latestNotes(
      await client.query([
        {
          kinds: [NOTE],
          authors: [client.pubkey],
          "#d": [name],
          limit: 1,
          consistency: "strong"
        }
      ])
    );
    if (!mine) throw new Error(`You have no note ${name}.`);
    const after = (mine.created_at + 1) * 1e3;
    if (after - Date.now() > 5e3)
      throw new Error("The note was just changed; try again.");
    await waitUntil(after);
    const coordinate = `${NOTE}:${client.pubkey}:${name}`;
    await client.publish({ kind: 5, content: "", tags: [["a", coordinate]] });
    return `deleted ${coordinate}`;
  },
  async canvas(tools, args) {
    const { client, context } = tools;
    const channel = text2(args.channel) ?? context.channel;
    if (!channel) throw new Error("channel is required here.");
    const content2 = await tools.body(args, false);
    const [head] = await client.query([
      { kinds: [40100], "#h": [channel], limit: 1 }
    ]);
    if (!head && !await tools.metadata(channel)) throw unseen(channel);
    if (content2 === void 0) return head?.content || "No canvas.";
    const after = head ? (head.created_at + 1) * 1e3 : 0;
    if (after - Date.now() > 5e3)
      throw new Error("The canvas was just changed; try again.");
    await waitUntil(after);
    await client.publish({ kind: 40100, content: content2, tags: [["h", channel]] });
    return "saved";
  },
  async repo(tools, args) {
    const { client } = tools;
    const { gitAuth } = client;
    if (!gitAuth) throw new Error("Git access needs Buzz Desktop.");
    const channel = target(tools, args);
    const create = optional(args, "create");
    if (create !== void 0) {
      if (!REPO.test(create) || create.includes(".."))
        throw new Error(
          "create must be 1 to 64 letters, digits, '.', '_' or '-', not starting with '.'."
        );
      const previous = creating.get(client.pubkey) ?? Promise.resolve();
      const started = previous.catch(() => {
      }).then(async () => {
        const created = await start(tools, channel, create);
        try {
          return await access(gitAuth, created);
        } catch (error) {
          throw new Error(
            `Started ${create}, but its Git header failed: ${reason(error)} Call repo again without create.`
          );
        }
      });
      creating.set(client.pubkey, started);
      try {
        return await started;
      } finally {
        if (creating.get(client.pubkey) === started)
          creating.delete(client.pubkey);
      }
    }
    const { found, complete } = await repos(tools, channel, false);
    const name = optional(args, "repo");
    const chosen = found.filter(
      (event) => !name || `${event.pubkey}/${tag2(event, "d")}` === name
    );
    if (chosen.length === 1 && (complete || name))
      return access(gitAuth, chosen[0]);
    const listed2 = found.map((event) => `${event.pubkey}/${tag2(event, "d")}`);
    if (!complete)
      throw new Error(
        `This channel's repositories could not all be read; try again${listed2.length ? `, or choose repo: ${listed2.join(", ")}` : ""}.`
      );
    if (!found.length)
      throw new Error(
        "This channel has no repository from its owners or admins."
      );
    throw new Error(`Choose repo: ${listed2.join(", ")}`);
  },
  async media_get(tools, args) {
    const media = await tools.client.media(required2(args, "url"));
    const saved = `Saved ${media.path} (${media.type}, ${media.size} bytes).`;
    if (media.data) {
      const head = atob(media.data.slice(0, 16));
      const type = sniff(Uint8Array.from(head, (c) => c.charCodeAt(0)));
      if (type?.startsWith("image/"))
        return { data: media.data, type, text: saved };
    }
    return `${saved} Open it with your own tools.`;
  },
  async tabs(tools, args) {
    const { client, context } = tools;
    const tabs = client.tabs;
    if (!tabs)
      throw new Error(
        "Tabs are kept in Buzz Desktop and are unavailable here."
      );
    const channel = context.channel;
    if (!channel) throw new Error("Tabs need a channel to work in.");
    if (args.action === void 0) {
      const open = tabs.list(channel);
      return open.length ? open.map(
        (tab) => `${tab.root} ${tab.pane}${tab.name ? ` ${JSON.stringify(tab.name)}` : ""}${tab.shown ? " (shown)" : ""}`
      ).join("\n") : "No thread tabs open.";
    }
    if (args.action !== "open" && args.action !== "close" && args.action !== "rename")
      throw new Error("action must be open, close or rename.");
    const event = await tools.event(required2(args, "thread"));
    if (tag2(event, "h") !== channel)
      throw new Error(`${event.id} is not in this channel.`);
    const root = threadReference(event)?.rootId ?? event.id;
    if (args.action === "open")
      return tabs.open(channel, root) ? `opened ${root}` : "already open";
    if (args.action === "rename")
      return tabs.rename(channel, root, optional(args, "name") ?? "") ? "renamed" : "not open";
    const closed = tabs.close(channel, root);
    if (closed === "shown")
      throw new Error("Your owner is looking at that tab, so it stays open.");
    return closed === "closed" ? "closed" : "not open";
  }
};
var Tools = class {
  constructor(client, context) {
    this.client = client;
    this.context = context;
  }
  cache = /* @__PURE__ */ new Map();
  once(key, load) {
    let value = this.cache.get(key);
    if (!value) {
      value = load();
      this.cache.set(key, value);
    }
    return value;
  }
  /** `text`, or the file at `path`. Undefined when neither is given and
   * `needed` is false. */
  async body(args, needed) {
    const path = text2(args.path);
    const value = path ? new TextDecoder().decode(await this.client.read(path)) : typeof args.text === "string" ? args.text : void 0;
    if (value === void 0 && needed) throw new Error("Give text or path.");
    return value;
  }
  async event(id2) {
    if (!HEX.test(id2)) throw new Error(`Not an event id: ${id2}`);
    const [event] = await this.client.query([
      { ids: [id2], kinds: [...THREAD, 45001], limit: 1 }
    ]);
    if (!event) throw new Error(`No message ${id2}.`);
    return event;
  }
  /** The e-tag of a reply to `parent`. Agents never nest: a reply to any
   * message in a thread is a reply to the thread's root. */
  async threadTags(parent) {
    const root = parent === this.context.root ? parent : rootOf(await this.event(parent));
    return [["e", root, "", "reply"]];
  }
  /** Visit matching events in relay order, retaining only what the caller needs.
   * False means the scan or caller's output budget stopped the listing. */
  async scan(filter, visit) {
    let count = 0;
    for (let cursor = {}; ; ) {
      const limit = Math.min(PAGE, MAX_EVENTS - count + 1);
      const page = await this.client.query([{ ...filter, ...cursor, limit }]);
      for (const event of page) {
        if (++count > MAX_EVENTS || !visit(event)) return false;
      }
      const last = page.at(-1);
      if (!last || page.length < limit) return true;
      cursor = { until: last.created_at, before_id: last.id };
    }
  }
  members(channel) {
    return this.once(`members/${channel}`, () => this.roster(channel));
  }
  /** The channel's members now, uncached. */
  async roster(channel) {
    const [list2] = await this.client.query([
      { kinds: [39002], "#d": [channel], limit: 1 }
    ]);
    return (list2?.tags ?? []).filter((t) => t[0] === "p" && t[1]).map((t) => ({ pubkey: t[1], role: t[3] || "member" }));
  }
  /** The channel's metadata now, if the agent can see it. */
  async metadata(channel) {
    const [metadata] = await this.client.query([
      { kinds: [39e3], "#d": [channel], limit: 1 }
    ]);
    return metadata;
  }
  async details(channel) {
    const metadata = await this.metadata(channel);
    if (!metadata) throw unseen(channel);
    const role = (await this.roster(channel)).find(
      (member) => member.pubkey === this.client.pubkey
    )?.role;
    const flags = [
      tag2(metadata, "t"),
      has(metadata, "private") ? "private" : "open",
      has(metadata, "archived") ? "archived" : "",
      tag2(metadata, "ttl") ? `archives after ${tag2(metadata, "ttl")}s idle` : ""
    ].filter(Boolean);
    return [
      `${channel} ${tag2(metadata, "name") ?? ""} (${flags.join(", ")})`,
      ...["about", "topic", "purpose"].flatMap(
        (key) => tag2(metadata, key) ? [`${key}: ${tag2(metadata, key)}`] : []
      ),
      `you: ${role ?? "not a member"}`
    ].join("\n");
  }
  async create(args) {
    const name = canonicalDetailsName(required2(args, "name"));
    const about = optional(args, "about") || void 0;
    const ttl = seconds2(args.ttl);
    checkDetails(name, about, ttl);
    if (args.visibility !== "open" && args.visibility !== "private")
      throw new Error("visibility must be open or private.");
    const type = args.type ?? "stream";
    if (type !== "stream" && type !== "forum" && type !== "system")
      throw new Error("type must be stream, forum or system.");
    const template = args.template === void 0 ? void 0 : await this.template(required2(args, "template"));
    const id2 = crypto.randomUUID();
    await this.client.publish({
      kind: 9007,
      content: "",
      tags: [
        ["h", id2],
        ["name", name],
        ["visibility", args.visibility],
        ["channel_type", type],
        ...about ? [["about", about]] : [],
        ...ttl ? [["ttl", String(ttl)]] : []
      ]
    });
    const shown = await until(() => this.metadata(id2), Boolean).catch(unread);
    if (!shown || shown instanceof Error)
      return `The community accepted channel ${id2} but ${shown ? shown.message : "does not show it yet"}${template ? "; the template was not applied" : ""}.`;
    const lines = [`created ${id2}`];
    if (!template) return lines.join("\n");
    const agents = template.agents.filter((key) => key !== this.client.pubkey);
    if (template.canvas.trim())
      try {
        await this.client.publish({
          kind: 40100,
          content: template.canvas,
          tags: [
            ["h", id2],
            ["expected-revision", "none"]
          ]
        });
        lines.push("started the Canvas");
      } catch (error) {
        lines.push(
          `Canvas not started${agents.length ? ", so no agents were added" : ""}: ${reason(error)}`
        );
        return lines.join("\n");
      }
    if (agents.length) lines.push(...(await this.change(id2, agents, [])).lines);
    return lines.join("\n");
  }
  /** The owner's template named `name`, as one, without guessing. */
  async template(name) {
    if (!this.client.templates)
      throw new Error(
        "Channel templates are kept in Buzz Desktop and are unavailable here."
      );
    const templates = await this.client.templates();
    const found = templates.filter(
      (template) => template.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (found.length > 1)
      throw new Error(
        `${found.length} templates are named ${name}; your owner should rename one.`
      );
    if (!found[0])
      throw new Error(
        `No template named ${name}. ${templates.length ? `Templates: ${templates.map((t) => t.name).join(", ")}.` : "Your owner has none."}`
      );
    return found[0];
  }
  async update(channel, args) {
    const metadata = await this.metadata(channel);
    if (!metadata) throw unseen(channel);
    const wanted = [];
    if (args.name !== void 0)
      wanted.push(["name", canonicalDetailsName(required2(args, "name"))]);
    for (const key of ["about", "topic", "purpose"]) {
      const value2 = optional(args, key);
      if (value2 !== void 0) wanted.push([key, value2]);
    }
    if (args.visibility !== void 0) {
      if (args.visibility !== "open" && args.visibility !== "private")
        throw new Error("visibility must be open or private.");
      wanted.push(["visibility", args.visibility]);
    }
    if (args.ttl !== void 0)
      wanted.push(["ttl", String(seconds2(args.ttl) ?? "")]);
    if (!wanted.length)
      throw new Error("Give name, about, visibility, ttl, topic or purpose.");
    const value = (key) => wanted.find((t) => t[0] === key)?.[1];
    checkDetails(
      value("name"),
      value("about"),
      Number(value("ttl")) || void 0
    );
    await this.client.publish({
      kind: 9002,
      content: "",
      tags: [["h", lifecycleChannelId(channel)], ...wanted]
    });
    const shows = (now2) => !!now2 && wanted.every(
      ([key, value2]) => key === "visibility" ? has(now2, "private") === (value2 === "private") : (tag2(now2, key) ?? "") === value2
    );
    const now = await until(() => this.metadata(channel), shows).catch(unread);
    if (now instanceof Error)
      return `The community accepted the update but ${now.message}.`;
    return shows(now) ? `updated ${channel}` : "The community accepted the update but does not show it yet.";
  }
  /** Adds and removes members, each tried on its own, and reports each as the
   * roster shows it. `changed` is whether any was accepted. */
  async change(channel, add, remove, role) {
    const refused = /* @__PURE__ */ new Map();
    for (const [targets, kind] of [
      [add, 9e3],
      [remove, 9001]
    ])
      for (const key of targets)
        try {
          await this.client.publish({
            kind,
            content: "",
            tags: [
              ["h", channel],
              ["p", key],
              ...kind === 9e3 && role ? [["role", role]] : []
            ]
          });
        } catch (error) {
          refused.set(key, reason(error));
        }
    const added = (roster2, key) => roster2.some((m) => m.pubkey === key && (!role || m.role === role));
    const removed = (roster2, key) => !roster2.some((m) => m.pubkey === key);
    const roster = await until(
      () => this.roster(channel),
      (now) => add.every((key) => refused.has(key) || added(now, key)) && remove.every((key) => refused.has(key) || removed(now, key))
    ).catch(unread);
    const names = await this.names([...add, ...remove]).catch(
      () => /* @__PURE__ */ new Map()
    );
    const who = (key) => names.has(key) ? `${key} ${names.get(key)}` : key;
    const report = (key, verb, done) => refused.has(key) ? `not ${verb} ${who(key)}: ${refused.get(key)}` : roster instanceof Error ? `${who(key)}: the community accepted it but ${roster.message}` : done?.(roster, key) ? `${verb} ${who(key)}${verb === "added" && role ? ` as ${role}` : ""}` : `${who(key)}: the community accepted it but does not show it yet`;
    return {
      changed: refused.size < add.length + remove.length,
      lines: [
        ...add.map((key) => report(key, "added", added)),
        ...remove.map((key) => report(key, "removed", removed))
      ]
    };
  }
  /** The author `value` names: me, a pubkey or npub, or one display name. */
  async author(value) {
    if (value === "me") return this.client.pubkey;
    try {
      return pubkey(value);
    } catch {
    }
    const q = value.toLowerCase();
    const named = [...q].length <= PROFILE_SEARCH_QUERY_MAX ? await this.client.searchProfiles?.(q, PROFILE_SEARCH_MAX) : void 0;
    const profiles = named?.filter((event) => event.kind === 0) ?? await this.client.query([{ kinds: [0], search: q, limit: 100 }]);
    const found = newest(profiles).filter(
      (event) => profileName(parse(event.content))?.toLowerCase() === q
    );
    if (found.length > 1)
      throw new Error(
        `${found.length} people are named ${value}; give their npub.
${found.map((event) => npubEncode(event.pubkey)).join("\n")}`
      );
    if (!found[0]) throw new Error(`No one is named ${value}.`);
    return found[0].pubkey;
  }
  /** Display names of `pubkeys` that have a profile. */
  async names(pubkeys) {
    const wanted = [...new Set(pubkeys)];
    const names = /* @__PURE__ */ new Map();
    if (!wanted.length) return names;
    const profiles = await this.client.query([
      { kinds: [0], authors: wanted, limit: wanted.length }
    ]);
    for (const event of newest(profiles)) {
      const name = profileName(parse(event.content));
      if (name) names.set(event.pubkey, name);
    }
    return names;
  }
  /** Messages oldest first with their latest edits, a line each: its ID,
   * author and its claimed (unverified) agent owner, channel and thread,
   * omitting what `scope` names. Other agent read surfaces trim the same
   * fields, so change them together, including the `buzz` CLI's agent format
   * (block/buzz `crates/buzz-cli/src/commands/event_output.rs`). */
  async messages(events, scope2) {
    const ids = events.filter((event) => event.kind !== 40003).map((e) => e.id);
    const edits = ids.length ? await this.client.query([{ kinds: [40003], "#e": ids, limit: 500 }]) : [];
    const messages = edited([...events, ...edits]);
    const names = await this.names(messages.map((event) => event.pubkey));
    return messages.map((event) => {
      const name = names.get(event.pubkey);
      const channel = tag2(event, "h");
      const owner = tag2(event, "auth");
      const reference = threadReference(event);
      const thread = reference?.rootId;
      return [
        event.id,
        `from ${event.pubkey}`,
        name && JSON.stringify(name),
        owner && `claimed owner ${owner}`,
        channel && channel !== scope2.channel && `in ${channel}`,
        thread && thread !== scope2.root && `re ${thread}`,
        reference && reference.parentId !== thread && `reply_to ${reference.parentId}`,
        `at ${time(event.created_at)}: ${event.content}`
      ].filter(Boolean).join(" ");
    });
  }
  /** Who `content` notifies: `mentions`, `nostr:npub…` links, and `@Name`
   * for a channel member, as the CLI resolves them. Each must be a member. */
  async mentions(channel, content2, explicit) {
    const keys2 = new Set(explicit.map(pubkey));
    for (const match of content2.matchAll(/nostr:(npub1[02-9ac-hj-np-z]{58})/g))
      keys2.add(pubkey(match[1]));
    const prose = content2.replace(/^```[\s\S]*?^```/gm, " ").replace(/`[^`\n]*`/g, " ");
    if (!prose.includes("@") && !keys2.size) return [];
    const members = await this.members(channel);
    if (prose.includes("@")) {
      const byName = /* @__PURE__ */ new Map();
      for (const [key, name] of await this.names(
        members.map((member) => member.pubkey)
      )) {
        const lower = name.toLowerCase();
        byName.set(lower, [...byName.get(lower) ?? [], key]);
      }
      const longest = [...byName.keys()].sort((a, b) => b.length - a.length);
      const unknown = [];
      for (const match of prose.matchAll(/(^|\s)@/g)) {
        const rest = prose.slice((match.index ?? 0) + match[0].length).toLowerCase();
        const name = longest.find(
          (candidate) => rest.startsWith(candidate) && /^($|[\s,;.!?:)\]}])/.test(rest.slice(candidate.length))
        );
        const found = name ? byName.get(name) ?? [] : [];
        if (found.length === 1) keys2.add(found[0]);
        else {
          const token2 = name ?? rest.match(/^[a-z0-9._-]+/)?.[0];
          if (token2)
            unknown.push(`@${token2}${found.length ? " (ambiguous)" : ""}`);
        }
      }
      if (unknown.length && !explicit.length)
        throw new Error(
          `No single channel member is ${unknown.join(", ")}. Pass their pubkeys in mentions, or drop the @.`
        );
    }
    const outside = [...keys2].filter(
      (key) => !members.some((member) => member.pubkey === key)
    );
    if (outside.length)
      throw new Error(`Not in this channel: ${outside.join(", ")}`);
    return [...keys2].slice(0, 50);
  }
  /** Uploads each file and returns its `imeta` tags and the links to append.
   * Any file the community accepts attaches; it decides the type. */
  async attach(paths) {
    const tags = [];
    let links = "";
    for (const path of paths) {
      const data = await this.client.read(path);
      const upload = await this.client.upload(
        data,
        sniff(data) ?? "application/octet-stream"
      );
      const name = attachmentName(path.split(/[\\/]/).pop() ?? "");
      tags.push([...imeta(upload), `filename ${name}`]);
      links += `
${attachmentMarkdown(name, upload)}`;
    }
    return { tags, links };
  }
};
function rootOf(event) {
  const tags = event.tags.filter(
    (t) => t[0] === "e" && t.length >= 4 && HEX.test(t[1] ?? "")
  );
  const root = tags.find((t) => t[3] === "root");
  const reply = tags.find((t) => t[3] === "reply");
  return (root && reply ? root : reply)?.[1] ?? event.id;
}
function edited(events) {
  const edits = /* @__PURE__ */ new Map();
  for (const event of events)
    if (event.kind === 40003) {
      const target2 = tag2(event, "e");
      const last = target2 && edits.get(target2);
      if (target2 && (!last || last.created_at < event.created_at))
        edits.set(target2, event);
    }
  return events.filter((event) => event.kind !== 40003).map((event) => {
    const edit = edits.get(event.id);
    return edit && edit.pubkey === event.pubkey ? { ...event, content: edit.content } : event;
  }).sort((a, b) => a.created_at - b.created_at);
}
function newest(events) {
  const latest = /* @__PURE__ */ new Map();
  for (const event of events) {
    const seen = latest.get(event.pubkey);
    if (!seen || seen.created_at < event.created_at)
      latest.set(event.pubkey, event);
  }
  return [...latest.values()];
}
function imeta(upload) {
  return [
    "imeta",
    `url ${upload.url}`,
    `m ${upload.type}`,
    `x ${upload.sha256}`,
    `size ${upload.size}`,
    ...["dim", "blurhash", "thumb", "duration"].filter((key) => upload[key] !== void 0).map((key) => `${key} ${upload[key]}`)
  ];
}
function sniff(data) {
  const at = (offset, ...bytes) => bytes.every((byte, index) => data[offset + index] === byte);
  if (at(0, 255, 216, 255)) return "image/jpeg";
  if (at(0, 137, 80, 78, 71)) return "image/png";
  if (at(0, 71, 73, 70, 56)) return "image/gif";
  if (at(0, 82, 73, 70, 70) && at(8, 87, 69, 66, 80))
    return "image/webp";
  if (at(4, 102, 116, 121, 112)) return "video/mp4";
  return void 0;
}
function memorySlug(slug) {
  const key = slug === "core" || slug.startsWith("mem/") ? slug : `mem/${slug}`;
  if (key.length > 255 || !/^(core|mem\/[a-z0-9][a-z0-9_-]{0,63}(\/[a-z0-9][a-z0-9_-]{0,63})*)$/.test(
    key
  ))
    throw new Error(
      `Bad slug ${slug}: use lowercase parts like notes or team/plan.`
    );
  return key;
}
function noteSlug(value) {
  if (typeof value !== "string" || !/^[a-z0-9._-]{1,80}$/.test(value))
    throw new Error(
      `Bad note name ${String(value)}: use up to 80 of a-z, 0-9, - _ and .`
    );
  return value;
}
async function waitUntil(at) {
  while (Date.now() < at)
    await new Promise((resolve) => setTimeout(resolve, at - Date.now()));
}
function latestNotes(events) {
  const latest = /* @__PURE__ */ new Map();
  for (const event of events) {
    const name = tag2(event, "d");
    if (event.kind !== NOTE || name === void 0) continue;
    const key = `${event.pubkey}:${name}`;
    const seen = latest.get(key);
    if (!seen || seen.created_at < event.created_at || seen.created_at === event.created_at && event.id < seen.id)
      latest.set(key, event);
  }
  return [...latest.values()].sort((a, b) => b.created_at - a.created_at);
}
function pubkey(value) {
  if (HEX.test(value.toLowerCase())) return value.toLowerCase();
  try {
    const decoded = decode(value);
    if (decoded.type === "npub") return decoded.data;
  } catch {
  }
  throw new Error(`Not a pubkey: ${value}`);
}
var profileName = (profile) => [profile.display_name, profile.name].find(
  (name) => typeof name === "string" && !!name.trim()
);
function parse(content2) {
  try {
    const value = JSON.parse(content2);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
var tag2 = (event, name) => event.tags.find((t) => t[0] === name)?.[1];
var has = (event, name) => event.tags.some((t) => t[0] === name);
var reason = (error) => error instanceof Error ? error.message : String(error);
async function until(load, done) {
  let value = await load();
  for (let tries = 1; !done(value) && tries < 5; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    value = await load();
  }
  return value;
}
var unseen = (channel) => new Error(
  `No channel ${channel} that you can see (it may not be visible yet). If you supplied a name, channels with q finds its ID.`
);
async function repos(tools, channel, strong) {
  const bound2 = [];
  let cursor = {};
  let complete = false;
  for (let page = 0; page < REPO_PAGES && !complete; page++) {
    const events = await tools.client.query([
      {
        kinds: [30617],
        "#buzz-channel": [channel],
        limit: 100,
        ...strong ? { consistency: "strong" } : {},
        ...cursor
      }
    ]);
    bound2.push(
      ...events.filter((event) => tag2(event, "buzz-channel") === channel)
    );
    complete = events.length < 100;
    const last = events.at(-1);
    if (last) cursor = { until: last.created_at, before_id: last.id };
  }
  const trusted = await Promise.all(
    bound2.map(
      async (event) => leads(tools, channel, event.pubkey, await attestedOwner(event))
    )
  );
  return { found: bound2.filter((_, index) => trusted[index]), complete };
}
async function start(tools, channel, name) {
  const { client } = tools;
  const { found, complete } = await repos(tools, channel, true);
  if (found.length) throw new Error("This channel already has a repository.");
  if (!complete)
    throw new Error(
      "This channel's repositories could not all be read, so none was started; try again."
    );
  if (!await tools.metadata(channel)) throw unseen(channel);
  const coordinate = {
    kinds: [30617],
    authors: [client.pubkey],
    "#d": [name],
    limit: 1,
    consistency: "strong"
  };
  const [mine] = await client.query([coordinate]);
  if (mine) throw new Error(`You already have a repository named ${name}.`);
  if (!await leads(tools, channel, client.pubkey, client.owner))
    throw new Error(
      "Only a channel's owner or an admin, or their agent, can start its repository."
    );
  const created = await client.publish({
    kind: 30617,
    content: "",
    tags: [
      ["d", name],
      ["name", name],
      ["buzz-channel", channel],
      ["buzz-protect", "refs/heads/**", "no-force-push", "no-delete"]
    ]
  });
  let current;
  try {
    [current] = await client.query([coordinate]);
  } catch (error) {
    throw new Error(`${name} was announced, but ${unread(error).message}`);
  }
  if (current?.id !== created.id || tag2(current, "buzz-channel") !== channel)
    throw new Error(`${name} was announced, but the relay binds it elsewhere.`);
  return created;
}
async function access(gitAuth, event) {
  const { url, header } = await gitAuth(event.pubkey, tag2(event, "d") ?? "");
  return [
    `${tag2(event, "name") ?? tag2(event, "d")}: ${url}`,
    "For the next 60 seconds, pass this header to each git command (call again for a new one; never save it):",
    `git -c http.${url}.extraHeader='${header}' clone ${url}`
  ].join("\n");
}
async function leads(tools, channel, author, owner) {
  return (await tools.members(channel)).some(
    (member) => (member.role === "owner" || member.role === "admin") && (member.pubkey === author || member.pubkey === owner)
  );
}
var unread = (error) => new Error(`its state could not be read back: ${reason(error)}`);
function target(tools, args) {
  if (args.channel === void 0) {
    if (!tools.context.channel) throw new Error("channel is required here.");
    return tools.context.channel;
  }
  const channel = text2(args.channel);
  if (!channel) throw new Error("channel must be a channel ID.");
  return channel;
}
function keys(args, name) {
  const value = args[name];
  if (value === void 0) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new Error(`${name} must be a list of pubkeys.`);
  return [...new Set(value.map(pubkey))];
}
function optional(args, key) {
  const value = args[key];
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new Error(`${key} must be text.`);
  return value.trim();
}
function seconds2(value) {
  if (value === void 0 || value === 0) return void 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new Error("ttl must be a whole number of seconds.");
  return value;
}
function unixTime(args, key) {
  const value = args[key];
  if (value === void 0) return void 0;
  if (!Number.isSafeInteger(value) || value < 0 || value >= 1e11)
    throw new Error(
      `${key} must be Unix seconds: a whole number, not milliseconds.`
    );
  return value;
}
function checkDetails(name, about, ttl) {
  const errors = detailsDraftErrors({
    name: name ?? "-",
    description: about ?? "",
    visibility: "public",
    ttlSeconds: ttl
  });
  const error = errors.name ?? errors.description ?? errors.lifetime;
  if (error) throw new Error(error);
}
var text2 = (value) => typeof value === "string" && value.trim() ? value.trim() : void 0;
var list = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
function required2(args, name) {
  const value = args[name];
  if (typeof value !== "string" || !value)
    throw new Error(`${name} is required.`);
  return value;
}
var bound = (value, fallback, max) => Math.max(1, Math.min(max, Math.floor(value ?? fallback)));
var time = (seconds3) => `${new Date(seconds3 * 1e3).toISOString().slice(0, 16)}Z`;

// src/buzz-mcp/session-tools.ts
var BUZZ_SESSION = Object.freeze({
  tools: [...TOOLS, ...ATTENTION_TOOLS]
});
var listed = ({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema
});
var sessionTools = (added = []) => [
  ...TOOLS.map((tool3) => ({ ...tool3, load: "always" })),
  ...ATTENTION_TOOLS.map((tool3) => ({ ...tool3, load: "search" })),
  ...added.map((tool3) => ({ ...listed(tool3), load: "search" }))
];
function turnNote(client) {
  const attention = client?.attention;
  if (!attention) return void 0;
  if (!attention.enabled()) return ATTENTION_OFF;
  return attention.interests().length ? ATTENTION_REVIEW : ATTENTION_NONE;
}
async function callSessionTool(client, context, name, args, added = []) {
  if (!client) throw new Error("Buzz is not ready yet. Try again.");
  const tool3 = added.find((tool4) => tool4.name === name);
  if (tool3) return tool3.call(client, context, args);
  if (!isAttentionTool(name)) return callTool(client, context, name, args);
  const { attention } = client;
  if (!attention) throw new Error(`No tool ${name}`);
  if (!attention.enabled())
    throw new Error(
      `Attention is off for you: your owner turned it off, so these tools do nothing now.
(classifier: ${attention.classifier()})`
    );
  return callAttentionTool(attention, name, args);
}

// src/buzz-mcp/rpc.ts
var content = (reply) => typeof reply === "string" ? [{ type: "text", text: reply }] : [
  { type: "image", data: reply.data, mimeType: reply.type },
  ...reply.text ? [{ type: "text", text: reply.text }] : []
];
export {
  appClient,
  callSessionTool,
  content,
  sessionTools,
  turnNote
};
