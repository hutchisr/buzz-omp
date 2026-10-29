# OMP for Buzz

An external Buzz plugin that runs [Oh My Pi](https://github.com/can1357/oh-my-pi) on your computer. Based on the agent lifecycle and conversation behavior of Buzz’s bundled `src/bundled/pi` plugin, using OMP’s native JSONL RPC protocol instead of Pi durable.

## Install

1. Install OMP and sign in to a provider from its terminal UI. Check `omp --version`; this plugin is verified with **OMP 18.13.3**. It requires RPC host tools, `prompt_result`, and session-settled notifications.
2. In the Buzz desktop app, open **Settings → Plugins → Manage plugins**, add the GitHub repository **`hutchisr/buzz-omp`** (or `https://github.com/hutchisr/buzz-omp`), and select the discovered **`dist`** plugin. Review access and enable **OMP**. The signed build is included; Buzz does not need Node.js or run a build. You can also install a local checkout’s `dist` folder.
3. Create an agent with **OMP** as its harness. Set its working directory and instructions. Model choices load automatically from OMP during creation, in Settings, and on the agent’s card in **Your agents**, without invoking a model.
4. Use **Filter models** to search names, IDs, or providers (case-insensitive; multiple words narrow the results). **Refresh** reloads the list after provider configuration changes. The inherited choice shows the resolved model name followed by **· Default**; **Custom model…** accepts an explicit ID. Card selections save through Buzz immediately; Settings uses a full-width **Save** button. Commit custom IDs with Enter or by leaving the field.

The agent’s **Identity** section contains model, thinking effort, and instructions. **Settings** contains the workspace and conversation-history scope.

Cards in the same workspace share in-flight model discovery. Closing one card does not cancel the others; the OMP discovery process stops when its last reader leaves. Refresh performs a new read rather than keeping a stale global catalog.

**Thinking effort → auto** explicitly passes `--thinking auto` to OMP. It is separate from **OMP default**, which leaves the CLI thinking override unset.

Buzz needs a desktop build with the current `agents`, `host.spawn`, `host.resolveDirectory`, and injected React services. A browser-only Buzz session cannot start OMP. The app searches `~/.local/bin` and standard Homebrew directories on macOS; ensure `omp` is on the app’s executable search path.

Controls use Buzz’s shared button, field, preference-row, and popup styles in light and dark themes. The model filter supports arrow keys and Enter to select, Escape to dismiss, and Tab to reach Refresh; other pickers also support Home/End and typeahead. Enter does nothing when the search has no matches. Lists stay available if a refresh fails, and discovery is cancelled when the form unmounts or its workspace changes. Save appears when settings change. The OMP favicon appears in harness choices and the model picker.

## Behavior

- One persistent OMP session per Buzz thread by default; channel-wide history is optional. Solo chats and DMs always share one session. Replies remain in the triggering thread, except Solo chats, which stay top-level.
- Agents added to multiple communities use each membership's connection, memory, session index, and job lifecycle. Existing history stays in place; older hosts that only provide a public key remain supported.
- Owner mentions and cryptographically verified NIP-OA delegate mentions can start local work. Unrelated authors are ignored. Buzz supplies signature-verified events; the plugin separately verifies delegation.
- The standard Buzz tools are available with a `buzz_` prefix: conversations, profiles, channels, Canvas, attachments, media, memory, notes, repositories, agent management, Interests and watches. Tools added by active plugins are included too. `buzz_read` and `buzz_send` default to the current conversation and accept explicit destinations. Agent keys stay in Buzz’s native signing service, not in the OMP process or plugin JavaScript.
- OMP’s own filesystem and shell tools run in the configured working directory. Relative paths in `buzz_send` attachments resolve there too. With OMP’s filesystem tools enabled, it exposes Buzz host tools through `xd://buzz_<name>`: read the tool description, then write its JSON arguments to that virtual path.
- If no `buzz_send` succeeds during a mention turn, the final assistant text is posted automatically. Successful sends suppress that fallback. Failed turns report an error in Activity and notify the conversation.
- Attention uses Buzz’s owner-controlled switch and standard Interest/watch state checks. Addressed watches and timers use the destination’s persistent conversation; watches without a destination run isolated, ephemeral turns and require an explicit `buzz_send` destination. Attention turns send only when they call a tool; their final text and generic failure notices are not automatically posted. Stale wakes are discarded before prompting OMP.
- Stop interrupts the active turn. Compact uses OMP’s compaction. New session switches to a new history directory without deleting the previous transcript.
- Turns in the same session are serialized; different sessions can work concurrently. Each turn opens OMP, resumes the session, waits for background work to settle, then closes the process. Idle conversations do not retain child processes.
- Sessions live under `~/.buzz/omp/<agent>/<conversation-and-workspace-hash>/<generation>/`. Buzz’s agent storage keeps the conversation index. Changing working directory selects a different history binding. Provider/model changes do not discard conversation history.
- OMP uses its existing credentials, settings, extensions, skills and tools. Team instructions, core memory, and queued conversation notes are supplied by Buzz. Full transcripts remain accessible through `omp --session <session-path>`.

## Access and limits

**This is trusted local code, not a sandbox.** OMP starts with `--yolo` and can read/write files and run commands as your user. Explicit OMP policies still apply. Install only trusted plugins and give agents appropriate working directories. Headless runs should ask questions through Buzz rather than terminal dialogs.

Usage accounting, an embedded transcript viewer, and a provider-login editor are not included. Configure credentials in OMP. Relay-workflow-authored mentions without an owner NIP-OA delegation are not admitted. Plugin wake triggers are not registered.

Disabling the plugin, quitting Buzz, or removing the agent stops its processes. If Buzz offers to resume an interrupted mention, it continues in its saved conversation, but side effects are **not exactly-once**: a send or local command interrupted after execution may be repeated. New session preserves old history on disk; removing the plugin does not delete those files.

Verified on macOS with OMP 18.13.3. Linux and Windows have not been exercised. The automated smoke uses the real OMP binary with a local deterministic provider and in-memory Buzz handles; it does not sign or send messages to a real Buzz relay.

## Development

```sh
npm ci
npm test
npm run smoke
npm run build
```

`npm run smoke` requires `omp` on PATH (or `OMP_BIN=/absolute/path/to/omp`). It uses a temporary HOME, isolated sessions, and a loopback OpenAI-compatible server; it uses no paid provider or real Buzz account. It exercises model discovery for saved and not-yet-created agents without model invocation, workspace read/write/readback, file attachments, Attention and plugin tools, reply suppression, persistence across runtime restarts, Compact, New, standalone turns, and Stop.

`npm run build` produces the self-contained `dist/plugin.js`, manifest, and README. Keep `dist` with the source when distributing through Git. Buzz imports built artifacts; it does not run npm. After rebuilding, review and apply the folder update in Buzz. The bundle includes licenses for its bundled dependencies, Buzz’s shared tools, and the unchanged [OMP collab-web favicon](https://github.com/can1357/oh-my-pi/blob/main/packages/collab-web/public/favicon.svg).

The shared tool handlers are a pinned Apache-2.0 snapshot in `vendor/buzz`; `source.json` records their upstream revision and files. Normal builds require no Buzz source checkout. To refresh the snapshot, review and update the revision in `scripts/vendor-buzz-tools.mjs`, then run `npm run vendor:buzz -- /path/to/buzz-app`, test, and rebuild. The adapter supplies Buzz’s injected agent/host services; it imports no private app modules at runtime.
