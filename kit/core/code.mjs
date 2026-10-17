const KEYWORDS = /\b(alignas|alignof|auto|bool|break|case|char|class|const|constexpr|continue|default|delete|do|double|else|enum|extern|false|float|for|if|inline|int|long|namespace|new|nullptr|private|public|return|short|signed|sizeof|static|struct|switch|template|this|true|typedef|typename|union|unsigned|using|virtual|void|volatile|while|def|import|from|in|is|not|and|or|None|True|False|lambda|pass|function|let|var|end|elseif|module|entity|architecture|begin|process|signal|port|is)\b/g;
const TYPES = /\b(u?int(8|16|32|64)_t|size_t|string|std|cout|cin|endl|printf|scanf|malloc|free|NULL)\b/g;

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(line) {
  const parts = [];
  const re = /(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+(?:\.\d+)?\b)/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    parts.push(["", line.slice(last, m.index)]);
    const t = m[0];
    parts.push([t.startsWith("//") || (t.startsWith("#") && !/^#(include|define|pragma|if|endif|ifdef|ifndef)/.test(t)) ? "cm" : t.startsWith("#") ? "pp" : /^["']/.test(t) ? "st" : "nu", t]);
    last = m.index + t.length;
  }
  parts.push(["", line.slice(last)]);
  return parts.map(([cls, text]) => {
    const e = escapeHtml(text);
    if (cls) return `<span class="${cls}">${e}</span>`;
    return e.replace(KEYWORDS, '<span class="kw">$1</span>').replace(TYPES, '<span class="ty">$1</span>');
  }).join("");
}

export function createCodePanel(parent, { title = "main.cpp", source = "", onRun, onStep, onReset } = {}) {
  const el = document.createElement("section");
  el.id = "code";
  el.setAttribute("aria-label", `Code: ${title}`);
  el.innerHTML = `<header><b></b><span class="cstatus" aria-live="polite"></span><button class="ctoggle" aria-expanded="true">Hide</button></header><ol class="lines"></ol><footer><button class="crun primary">Run</button><button class="cstep ghost">Step</button><button class="creset ghost">Reset</button></footer>`;
  parent.append(el);
  el.querySelector("header b").textContent = title;
  const list = el.querySelector(".lines");
  const status = el.querySelector(".cstatus");
  const toggle = el.querySelector(".ctoggle");
  toggle.addEventListener("click", () => {
    const open = el.classList.toggle("closed");
    toggle.textContent = open ? "Code" : "Hide";
    toggle.setAttribute("aria-expanded", String(!open));
  });
  el.querySelector(".crun").addEventListener("click", () => onRun?.());
  el.querySelector(".cstep").addEventListener("click", () => onStep?.());
  el.querySelector(".creset").addEventListener("click", () => onReset?.());
  let lines = [];
  const slots = new Map();

  function render() {
    list.replaceChildren();
    lines.forEach((text, i) => {
      const li = document.createElement("li");
      li.dataset.n = String(i + 1);
      const slot = slots.get(i + 1);
      if (slot) {
        const indent = text.match(/^\s*/)[0];
        li.innerHTML = `<code>${escapeHtml(indent)}</code>`;
        const pick = document.createElement("select");
        pick.className = "slot";
        pick.setAttribute("aria-label", `Choose line ${i + 1}`);
        pick.innerHTML = `<option value="">${escapeHtml(slot.placeholder ?? "choose a line…")}</option>` + slot.options.map((o, j) => `<option value="${j}">${escapeHtml(o)}</option>`).join("");
        if (slot.value != null) pick.value = String(slot.value);
        pick.addEventListener("change", () => {
          slot.value = pick.value === "" ? null : +pick.value;
          slot.onPick?.(slot.value);
        });
        li.append(pick);
      } else {
        li.innerHTML = `<code>${highlight(text) || " "}</code>`;
      }
      list.append(li);
    });
  }

  const api = {
    el,
    setSource(src, title2) {
      lines = src.replace(/\t/g, "  ").split("\n");
      slots.clear();
      if (title2) el.querySelector("header b").textContent = title2;
      render();
    },
    setActive(n) {
      list.querySelectorAll("li.active").forEach((li) => li.classList.remove("active"));
      if (n == null) return;
      const li = list.children[n - 1];
      if (!li) return;
      li.classList.add("active");
      li.scrollIntoView({ block: "nearest" });
    },
    mark(n, kind, note) {
      const li = list.children[n - 1];
      if (!li) return;
      li.classList.remove("error", "ok", "warn");
      li.classList.add(kind);
      if (note) li.dataset.note = note; else delete li.dataset.note;
    },
    clearMarks() {
      list.querySelectorAll("li").forEach((li) => { li.classList.remove("error", "ok", "warn", "active"); delete li.dataset.note; });
    },
    slot(n, cfg) {
      slots.set(n, { ...cfg });
      render();
      return slots.get(n);
    },
    slotValue: (n) => slots.get(n)?.value ?? null,
    setSlotValue(n, v) {
      const s = slots.get(n);
      if (!s) return;
      s.value = v;
      render();
      s.onPick?.(v);
    },
    status(text, kind = "") {
      status.textContent = text;
      status.className = `cstatus ${kind}`;
    },
    buttons({ run = true, step = true, reset = true } = {}) {
      el.querySelector(".crun").hidden = !run;
      el.querySelector(".cstep").hidden = !step;
      el.querySelector(".creset").hidden = !reset;
    },
    show(v) { el.hidden = !v; },
  };
  api.setSource(source);
  return api;
}

export const CODE_CSS = `
#code{position:absolute;left:max(16px,env(safe-area-inset-left,0px));bottom:62px;width:min(440px,calc(100% - 400px));max-height:min(52%,520px);display:flex;flex-direction:column;pointer-events:auto;background:color-mix(in srgb,var(--panel) 94%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--line);border-radius:14px;overflow:hidden}
#code header{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line);font-family:var(--f-mono);font-size:12px}
#code header b{font-weight:600}
#code .cstatus{flex:1;color:var(--mute);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#code .cstatus.error{color:var(--error)}#code .cstatus.ok{color:var(--phosphor)}
#code .ctoggle{cursor:pointer;background:none;border:1px solid var(--line);border-radius:6px;padding:2px 8px;font-size:11px;color:var(--mute)!important}
#code .lines{margin:0;padding:6px 0;overflow:auto;list-style:none;counter-reset:ln;font-family:var(--f-mono);font-size:12.5px;line-height:1.55}
#code .lines li{counter-increment:ln;display:flex;align-items:center;padding:0 10px 0 0;border-left:3px solid transparent;white-space:pre;position:relative}
#code .lines li::before{content:counter(ln);display:inline-block;width:2.6em;text-align:right;padding-right:10px;color:var(--mute);opacity:.6;flex:none}
#code .lines li code{font:inherit;white-space:pre}
#code .lines li.active{background:color-mix(in srgb,var(--signal) 16%,transparent);border-left-color:var(--signal)}
#code .lines li.active::before{content:"▶";color:var(--signal);opacity:1}
#code .lines li.error{background:color-mix(in srgb,var(--error) 18%,transparent);border-left-color:var(--error)}
#code .lines li.ok{border-left-color:var(--phosphor)}
#code .lines li.warn{border-left-color:var(--heat)}
#code .lines li[data-note]::after{content:attr(data-note);margin-left:12px;font-family:var(--f-ui);font-size:11.5px;color:var(--mute);white-space:nowrap}
#code .lines li.error[data-note]::after{color:var(--error)}
#code .slot{font:inherit;font-size:12px;background:var(--panel2);color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:1px 6px;max-width:100%}
#code footer{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--line)}
#code footer button{padding:5px 10px;font-size:12.5px}
#code.closed .lines,#code.closed footer{display:none}
#code .kw{color:#c792ea}#code .ty{color:#56b4e9}#code .st{color:#e6c07b}#code .nu{color:#f78c6c}#code .cm{color:var(--mute);font-style:italic}#code .pp{color:#ff9e64}
:root[data-look="paper"] #code .kw{color:#7a3fb0}:root[data-look="paper"] #code .ty{color:#0a6aa1}:root[data-look="paper"] #code .st{color:#8a5a00}:root[data-look="paper"] #code .nu{color:#b5461c}
@media (max-width:760px){#code{width:auto;right:max(12px,env(safe-area-inset-right,0px));left:max(12px,env(safe-area-inset-left,0px));max-height:34%;bottom:calc(46% + 70px)}}
`;
