// External plugins share Buzz's CSS, not its internal React component modules.
// Match Button/Select markup; native popovers supply top-layer placement and light dismissal.
export function createControls(React) {
  const h = React.createElement;
  const glyph = (path, props = {}) => h("svg", { viewBox: "0 0 24 24", width: 16, height: 16,
    fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
    "aria-hidden": true, focusable: false, ...props }, h("path", { d: path }));
  function Button({ children, variant = "subtle", size = "md", shape = "capsule", loading = false, disabled, ...props }) {
    return h("button", { type: "button", ...props, className: "buzz-button", "data-buzz-ui": "",
      "data-variant": variant, "data-size": size, "data-button-shape": shape,
      "data-loading": loading || undefined, "data-disabled": disabled || loading ? "" : undefined,
      "aria-busy": loading || undefined, disabled: disabled || loading },
    h("span", { className: "buzz-button-label" }, children),
    loading && glyph("M12 3a9 9 0 1 1-9 9", { className: "buzz-button-spinner" }));
  }
  function Select({ label, value, options, onChange, disabled = false, leading, description,
    searchable = false, loading = false, error, onOpen, onRefresh, compact = false, appearance = "outline", valueLabel, valueSuffix }) {
    const id = React.useId();
    const trigger = React.useRef(null), popup = React.useRef(null), filter = React.useRef(null);
    const search = React.useRef({ text: "", at: 0 });
    const [open, setOpen] = React.useState(false);
    const [active, setActive] = React.useState(-1);
    const [query, setQuery] = React.useState("");
    const selected = Math.max(0, options.findIndex((option) => option.value === value));
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const visible = searchable && words.length
      ? options.filter((option) => words.every((word) => `${option.label} ${option.value}`.toLowerCase().includes(word)))
      : options;
    const focus = (index) => popup.current.querySelectorAll('[role="option"]')[index]?.focus({ preventScroll: true });
    const close = (restore = false) => { popup.current.hidePopover(); if (restore) trigger.current.focus(); };
    const choose = (option) => { close(true); onChange(option.value); };
    const show = () => {
      if (open || disabled) return;
      setQuery(""); setActive(-1);
      search.current = { text: "", at: 0 };
      const box = trigger.current.getBoundingClientRect();
      const width = Math.min(Math.max(box.width, searchable ? 340 : 280), window.innerWidth - 24);
      const below = window.innerHeight - box.bottom - 16;
      const above = box.top - 16;
      const top = below < 180 && above > below;
      Object.assign(popup.current.style, { left: `${Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12))}px`,
        top: top ? "auto" : `${box.bottom + 4}px`, bottom: top ? `${window.innerHeight - box.top + 4}px` : "auto",
        width: `${width}px`, maxHeight: `${Math.max(80, Math.min(400, top ? above : below))}px` });
      popup.current.showPopover();
      if (searchable) filter.current.focus({ preventScroll: true });
      else {
        focus(selected);
        popup.current.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
      }
      onOpen?.();
    };
    React.useEffect(() => {
      if (disabled && open) close();
    }, [disabled, open]);
    React.useEffect(() => {
      if (!open) return;
      const reposition = (event) => { if (!popup.current.contains(event.target)) close(); };
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, true);
      return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
    }, [open]);
    return h("div", { className: compact ? undefined : "buzz-preference-row", "data-buzz-ui": "" },
      h("div", { className: compact ? "sr-only" : "buzz-preference-row-content" },
        h("span", { id: `${id}-label`, className: "buzz-preference-row-label" }, label),
        description && h("span", { className: "buzz-preference-row-description" }, description)),
      h("div", { className: compact ? undefined : "buzz-preference-row-trailing" },
        h("div", { className: "buzz-select text-body", "data-variant": "compact", "data-buzz-ui": "" },
          h(Button, { ref: trigger, variant: appearance === "subtle" ? "subtle" : "outline", size: "sm", shape: compact ? "capsule" : "control", disabled,
            "aria-label": label, "aria-haspopup": searchable ? "dialog" : "listbox",
            "aria-controls": searchable ? `${id}-popup` : id, "aria-expanded": open,
            onClick: () => open ? close(true) : show(),
            onKeyDown: (event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); show(); } } },
          h("span", { className: "buzz-select-value-content" },
            leading && h("span", { className: "buzz-select-leading" }, leading),
            h("span", { className: "buzz-select-value", title: options[selected]?.label }, valueLabel ?? options[selected]?.label),
            valueSuffix && h("span", { className: "buzz-select-value-suffix" }, valueSuffix)),
          glyph("m6 9 6 6 6-6", { className: "buzz-dropdown-chevron" })),
          h("div", { id: `${id}-popup`, ref: popup, popover: "auto", role: searchable ? "dialog" : undefined,
            "aria-labelledby": searchable ? `${id}-label` : undefined,
            className: "buzz-select-popup text-body", "data-buzz-ui": "", "data-variant": "compact",
            style: { position: "fixed", margin: 0, minWidth: 0, overflowY: "auto" },
            onToggle: (event) => setOpen(event.newState === "open"),
            onKeyDown: (event) => {
              const typing = event.target === filter.current;
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
              if (event.key === "Tab") {
                if (searchable && ((typing && !event.shiftKey) || (!typing && event.shiftKey))) return;
                close(true); return;
              }
              if (typing && event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault(); event.stopPropagation();
                const option = visible[Math.max(0, active)];
                if (option) choose(option);
                return;
              }
              if (!visible.length || (searchable && !typing)) return;
              let next;
              if (event.key === "ArrowDown") next = (active + 1) % visible.length;
              if (event.key === "ArrowUp") next = active <= 0 ? visible.length - 1 : active - 1;
              if (!typing && event.key === "Home") next = 0;
              if (!typing && event.key === "End") next = visible.length - 1;
              if (!typing && event.key.length === 1 && event.key !== " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
                const now = Date.now();
                search.current = { text: (now - search.current.at < 700 ? search.current.text : "") + event.key.toLowerCase(), at: now };
                const found = visible.findIndex((option) => option.label.toLowerCase().startsWith(search.current.text));
                if (found >= 0) next = found;
              }
              if (next !== undefined) {
                event.preventDefault(); event.stopPropagation();
                if (searchable) setActive(next); else focus(next);
                popup.current.querySelectorAll('[role="option"]')[next]?.scrollIntoView({ block: "nearest" });
              }
            } },
          searchable && h("div", { style: { position: "sticky", top: 0, zIndex: 1,
            background: "var(--surface-popover)", padding: "var(--space-2)", display: "grid", gap: "var(--space-2)" } },
            h("div", { style: { display: "flex", gap: "var(--space-2)" } },
              h("input", { ref: filter, type: "search", role: "combobox", className: "buzz-input", "data-size": "sm",
                "aria-label": "Filter models", "aria-controls": id, "aria-expanded": open, "aria-autocomplete": "list",
                "aria-activedescendant": active >= 0 && visible[active] ? `${id}-option-${active}` : undefined,
                placeholder: "Filter by name, ID or provider…", value: query,
                onChange: (event) => { setQuery(event.target.value); setActive(-1); } }),
              h(Button, { size: "sm", loading, onClick: onRefresh, "aria-label": "Refresh models" }, "Refresh")),
            h("span", { role: "status", className: "buzz-field-description" },
              loading ? "Loading models from OMP…" : `${visible.length} choices`),
            error && h("p", { role: "alert", className: "buzz-field-error", style: { margin: 0 } }, error)),
          h("div", { id, role: "listbox", "aria-labelledby": `${id}-label`, "aria-busy": loading || undefined },
            ...visible.map((option, index) => h("button", { id: `${id}-option-${index}`, type: "button", role: "option", key: option.value,
              className: "buzz-select-option", tabIndex: -1, "aria-selected": option.value === value,
              "data-selected": option.value === value ? "" : undefined, "data-highlighted": active === index ? "" : undefined,
              style: { width: "100%", textAlign: "start", font: "inherit" },
              onFocus: () => setActive(index), onPointerMove: () => searchable ? setActive(index) : focus(index),
              onMouseDown: (event) => { if (searchable) event.preventDefault(); },
              onClick: () => choose(option) },
              h("span", { className: "buzz-select-option-main" }, h("span", { className: "buzz-select-option-content" }, option.label)),
              h("span", { className: "buzz-select-indicator", "data-selected": option.value === value ? "" : undefined }, glyph("m5 12 4 4L19 6"))))),
          !visible.length && h("p", { className: "buzz-field-description", role: "status", style: { padding: "var(--space-3)", margin: 0 } },
            loading ? "Waiting for OMP’s model list…" : "No matching models.")))));
  }
  return { Button, Select };
}
