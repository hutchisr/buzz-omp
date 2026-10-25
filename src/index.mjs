import { Runtime, DEFAULTS, EFFORTS, config } from "./runtime.mjs";
import { createControls } from "./ui.mjs";
import ompArtwork from "./omp.svg";

const ompIconUrl = `data:image/svg+xml,${encodeURIComponent(ompArtwork)}`;

export const inject = ["agents", "host", "react"];
export function apply(ctx) {
  const { agents, host, react: React } = ctx;
  if (!host.spawn || !host.resolveDirectory) return;
  const runtime = new Runtime(host, agents);
  const typeKey = `${ctx.pluginOwner?.id ?? "local.omp"}/omp`;
  const sync = () => {
    const snapshot = agents.snapshot();
    if (snapshot.status !== "loading") runtime.sync(snapshot.running.filter((agent) => agent.type === typeKey));
  };
  const unsubscribe = agents.subscribe(sync);
  ctx.effect(() => () => { unsubscribe(); return runtime.dispose(); });
  const h = React.createElement;
  const { Button, Select } = createControls(React);
  const OmpIcon = React.forwardRef(function OmpIcon({ size = "1em", ...props }, ref) {
    const dimension = typeof size === "number" ? `${size / 16}rem` : size;
    return h("svg", { ref, width: dimension, height: dimension, viewBox: "0 0 64 64",
      "aria-hidden": true, focusable: false, ...props },
    h("image", { href: ompIconUrl, width: 64, height: 64 }));
  });
  const stack = { display: "grid", gap: "var(--space-4)", minWidth: 0 };
  const field = { display: "grid", gap: "var(--space-2)", minWidth: 0 };

  function Fields({ config: value, onChange, disabled, modelOnly = false, hideModel = false, modelAppearance, section }) {
    const settings = config(value);
    const [custom, setCustom] = React.useState(false);
    const [customText, setCustomText] = React.useState("");
    const [catalog, setCatalog] = React.useState(null);
    const [checking, setChecking] = React.useState(false);
    const [error, setError] = React.useState("");
    const request = React.useRef(null);
    React.useEffect(() => {
      setCatalog(null); setError(""); setChecking(false);
      return () => { request.current?.abort(); request.current = null; };
    }, [settings.workspace]);
    const loadModels = async () => {
      if (request.current) return;
      const controller = new AbortController();
      request.current = controller;
      setChecking(true); setError("");
      try {
        // Read OMP's defaults, not an unsaved/custom selection that may be invalid.
        const result = await runtime.discover(settings.workspace, controller.signal);
        if (!controller.signal.aborted) setCatalog(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(`${failure instanceof Error ? failure.message : String(failure)}. Check that omp is installed and signed in from a terminal.`);
      } finally {
        if (request.current === controller) { request.current = null; setChecking(false); }
      }
    };
    React.useEffect(() => { if (!hideModel && section !== "runtime") void loadModels(); }, [settings.workspace, hideModel, section]);
    const defaultName = catalog?.models.find((model) => model.id === catalog.current)?.label ?? catalog?.current;
    const change = (key) => (event) => onChange({ ...settings, [key]: event.target.value });
    const models = (catalog?.models ?? []).map((model) => ({ value: model.id, label: model.label }));
    if (settings.model && !models.some((model) => model.value === settings.model))
      models.push({ value: settings.model, label: settings.model });
    const modelPicker = h(Select, { label: "Model", value: settings.model, disabled, leading: h(OmpIcon, { size: 20 }),
      compact: modelOnly, appearance: modelAppearance,
      valueLabel: !settings.model && defaultName ? defaultName : undefined,
      valueSuffix: !settings.model && defaultName ? " · Default" : undefined,
      searchable: true, loading: checking, error, onRefresh: loadModels,
      onOpen: () => { if (!catalog) void loadModels(); },
      options: [{ value: "", label: defaultName ? `${defaultName} · Default` : checking ? "Loading default model…" : "Default model unavailable" },
        ...models, { value: "\0custom", label: "Custom model…" }],
      onChange: (model) => { setCustom(model === "\0custom"); if (model === "\0custom") setCustomText(settings.model);
        else onChange({ ...settings, model, effort: "" }); } });
    const customEditor = custom && h("label", { className: "buzz-field", "data-buzz-ui": "" },
      h("span", { className: "buzz-field-label" }, "Custom model ID"),
      h("input", { className: "buzz-input", value: customText, disabled, autoFocus: true,
        autoCapitalize: "none", spellCheck: false, placeholder: "provider/model-id",
        onChange: (event) => setCustomText(event.target.value),
        onBlur: () => { const model = customText.trim(); if (model && model !== settings.model) onChange({ ...settings, model, effort: "" }); },
        onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } } }));
    if (modelOnly) return h("div", { style: stack }, modelPicker, customEditor);
    return h("div", { style: stack },
      h("p", { className: "buzz-field-description", style: { margin: 0 } },
        "Uses OMP on this computer and its existing provider sign-in. Local tools run with your user account’s permissions."),
      h("div", { className: "buzz-settings-group", "data-layout": "rows", "data-buzz-ui": "" },
        section !== "runtime" && !hideModel && modelPicker,
        section !== "runtime" && h(Select, { label: "Thinking effort", value: settings.effort, disabled,
          options: [{ value: "", label: "OMP default" }, ...EFFORTS.map((value) => ({ value, label: value }))],
          onChange: (effort) => onChange({ ...settings, effort }) }),
        section !== "identity" && h(Select, { label: "Conversation history", value: settings.scope, disabled,
          options: [{ value: "thread", label: "One session per thread" }, { value: "channel", label: "One session per channel" }],
          onChange: (scope) => onChange({ ...settings, scope }) })),
      section !== "runtime" && !hideModel && h("p", { role: "status", className: "buzz-field-description", style: { margin: 0 } },
        checking ? "Loading available models from OMP…" : catalog ? `${catalog.models.length} models available from OMP.` : "Open Model to load available models from OMP."),
      section !== "runtime" && customEditor,
      ...[["workspace", "Working directory", "~/.buzz"], ["instructions", "Agent instructions", "What should this agent know?"]]
        .filter(([key]) => section === "identity" ? key !== "workspace" : section === "runtime" ? key === "workspace" : true)
        .map(([key, label, placeholder]) =>
        h("label", { key, className: "buzz-field", "data-buzz-ui": "" },
          h("span", { className: "buzz-field-label" }, label),
          h(key === "instructions" ? "textarea" : "input", {
            className: key === "instructions" ? "buzz-textarea" : "buzz-input", value: settings[key], "data-buzz-ui": "",
            "data-appearance": key === "instructions" ? "outlined" : undefined,
            disabled, placeholder, rows: key === "instructions" ? 5 : undefined, onChange: change(key),
          }))),
      h("p", { className: "buzz-field-description", style: { margin: 0 } }, "Solo chats and DMs always share one session. Model and effort choices must be supported by your OMP provider."));
  }
  function Settings({ agent, save, settingsHost, settingsContent, settingsSection }) {
    const [draft, setDraft] = React.useState(() => config(agent.config));
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState("");
    React.useEffect(() => { setDraft(config(agent.config)); }, [agent.pubkey, agent.config]);
    const dirty = JSON.stringify(draft) !== JSON.stringify(config(agent.config));
    return h("form", { style: stack, onSubmit: async (event) => {
      event.preventDefault(); setSaving(true); setError("");
      try { await (settingsHost?.pendingSave ? settingsHost.pendingSave(draft) : save(draft)); }
      catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
      finally { setSaving(false); }
    } }, settingsSection !== "identity" && settingsContent,
    settingsSection !== "runtime" && settingsHost?.typeControl?.(dirty),
    h(Fields, { config: draft, onChange: setDraft, disabled: saving, section: settingsSection }),
    (dirty || saving || settingsHost?.pendingSave) && h("div", null,
      h(Button, { type: "submit", variant: "prominent", loading: saving, style: { width: "100%" } }, saving ? "Saving…" : "Save")),
    error && h("p", { role: "alert", className: "buzz-field-error", style: { margin: 0 } }, error));
  }
  function Activity({ agent }) {
    React.useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);
    const sessions = runtime.sessions(agent.pubkey);
    return h("div", { style: stack }, h("h3", { className: "text-body", style: { margin: 0 } }, "OMP conversations"),
      !sessions.length ? h("p", { className: "buzz-field-description", style: { margin: 0 } }, "Mention this agent in a Buzz conversation to start its first session.") :
        h("ul", { style: { ...stack, listStyle: "none", padding: 0 } }, ...sessions.map((session) =>
          h("li", { key: session.key, style: field },
            h("strong", null, `${session.channelId.slice(0, 12)}${session.root ? ` / thread ${session.root.slice(0, 12)}` : " / channel"}`),
            h("span", { className: "text-body-sm" }, session.status),
            session.at && h("time", { className: "buzz-field-description", dateTime: new Date(session.at).toISOString() }, new Date(session.at).toLocaleString())))),
      h("p", { className: "buzz-field-description", style: { margin: 0 } }, "Use the conversation’s session controls to interrupt, compact, or start fresh. OMP keeps transcripts under ~/.buzz/omp; opening one with omp --session <path> shows its full history."));
  }
  agents.register({
    id: "omp", title: "OMP", icon: OmpIcon, description: "Local OMP with persistent conversations and Buzz read/send tools.",
    defaults: () => ({ config: { ...DEFAULTS } }),
    Create: (props) => h(Fields, { ...props, hideModel: true }),
    CreateModel: (props) => h(Fields, { ...props, modelOnly: true }),
    adopt: (carry, saved) => ({ ...saved, instructions: carry.instructions ?? saved.instructions, workspace: carry.workspace ?? saved.workspace }),
    carry: (saved) => { const { instructions, workspace } = config(saved); return { instructions, workspace }; },
    summary: (agent) => config(agent.config).model || "OMP default model",
    tabs: [{ id: "settings", title: "Settings", role: "settings", splitSettings: true, component: Settings },
      { id: "activity", title: "Activity", role: "activity", component: Activity }],
    sessions: { list: (pubkey) => runtime.sessions(pubkey), subscribe: runtime.subscribe },
    sessionControls: { scope: (agent) => config(agent.config).scope,
      state: (agent, place) => runtime.state(agent, place), run: (agent, place, action) => runtime.control(agent, place, action), subscribe: runtime.subscribe },
    models: (agent) => runtime.models(agent), run: (delivery) => runtime.run(delivery),
    runOnce: (turn) => runtime.runOnce(turn), timeoutMs: 30 * 60_000, resumes: true,
  });
}
