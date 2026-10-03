/* =========================================================
   心理状态实时栏 · 酒馆扩展
   ========================================================= */

const PSY_MODULE = "psy-panel";
const PSY_STORAGE = "psy_panel_data";

/* ---------- 数据存储 ---------- */
let PSY = {
  characters: {}
};

function loadPsy() {
  try {
    const s = localStorage.getItem(PSY_STORAGE);
    if (s) PSY = JSON.parse(s);
  } catch (e) {}
}
function savePsy() {
  localStorage.setItem(PSY_STORAGE, JSON.stringify(PSY));
}

/* ---------- 从世界书拿主要角色 ---------- */
function getWorldCharacters() {
  try {
    const ctx = SillyTavern.getContext();
    const wi = ctx.worldInfo || ctx.world_info;
    if (!wi) return [];
    for (const key in wi) {
      const entry = wi[key];
      const content = (entry.content || "").trim();
      const comment = entry.comment || "";
      if (key.includes("主要角色") || comment.includes("主要角色")) {
        return content.split(/[、,，\/\s\n]+/).map(s => s.trim()).filter(Boolean);
      }
    }
  } catch (e) { console.warn("[心理栏] 读世界书失败", e); }
  return [];
}

/* ---------- 解析 AI 输出里的 [心理状态] ---------- */
function parsePsyBlock(text) {
  const re = /\[心理状态\]([\s\S]*?)(?=\n\[[^\]]+\]|$)/;
  const m = text.match(re);
  if (!m) return null;

  const body = m[1];
  const result = {};
  let currentChar = null;

  const lines = body.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    let typeMatch = line.match(/^(思维|情感心理|情感|生理)[:：]\s*(\d+)%?\s*[|｜]?\s*(.*)$/);
    if (typeMatch && currentChar) {
      const [, type, val, note] = typeMatch;
      const key = mapType(type);
      result[currentChar][key] = { v: parseInt(val), note: note.trim() };
      continue;
    }

    let nameMatch = line.match(/^([^:：]+)[:：]?\s*$/);
    if (nameMatch && !line.match(/思维|情感|生理/)) {
      currentChar = nameMatch[1].trim();
      result[currentChar] = result[currentChar] || {};
      continue;
    }

    let inlineMatch = line.match(/^([^:：]+)[:：]\s*(思维|情感心理|情感|生理)[:：]\s*(\d+)%?\s*[|｜]?\s*(.*)$/);
    if (inlineMatch) {
      const [, name, type, val, note] = inlineMatch;
      const charName = name.trim();
      result[charName] = result[charName] || {};
      const key = mapType(type);
      result[charName][key] = { v: parseInt(val), note: note.trim() };
      continue;
    }
  }

  return Object.keys(result).length ? result : null;
}

function mapType(t) {
  if (t === "思维") return "think";
  if (t === "情感心理" || t === "情感") return "emo";
  if (t === "生理") return "phy";
  return "think";
}

/* ---------- 渲染面板 ---------- */
function renderPanel() {
  const body = document.querySelector("#psy-panel .psy-body");
  if (!body) return;

  const chars = Object.keys(PSY.characters);
  if (!chars.length) {
    body.innerHTML = '<div class="psy-empty">等待剧情推进…</div>';
    return;
  }

  body.innerHTML = chars.map(name => {
    const c = PSY.characters[name];
    return `
      <div class="psy-char">
        <div class="psy-name">${esc(name)}</div>
        ${renderRow("思维", "think", c.think)}
        ${renderRow("情感心理", "emo", c.emo)}
        ${renderRow("生理", "phy", c.phy)}
      </div>`;
  }).join("");
}

function renderRow(label, key, data) {
  const v = data ? data.v : 0;
  const note = data ? data.note : "";
  return `
    <div class="psy-row">
      <div class="psy-label"><span>${label}</span><b>${v}%</b></div>
      <div class="psy-bar ${key}"><i style="width:${v}%"></i></div>
      <div class="psy-note">${esc(note)}</div>
    </div>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ---------- 创建面板 DOM ---------- */
function createPanel() {
  if (document.getElementById("psy-panel")) return;

  const panel = document.createElement("div");
  panel.id = "psy-panel";
  panel.innerHTML = `
    <div class="psy-head" id="psy-drag">
      <span>🧠 心理状态</span>
      <span class="close" id="psy-close">✕</span>
    </div>
    <div class="psy-body"></div>
  `;
  document.body.appendChild(panel);

  const fab = document.createElement("div");
  fab.id = "psy-fab";
  fab.textContent = "🧠";
  fab.style.display = "none";
  fab.onclick = () => {
    panel.style.display = "flex";
    fab.style.display = "none";
  };
  document.body.appendChild(fab);

  document.getElementById("psy-close").onclick = () => {
    panel.style.display = "none";
    fab.style.display = "flex";
  };

  let drag = false, ox = 0, oy = 0;
  const handle = document.getElementById("psy-drag");
  handle.addEventListener("mousedown", e => {
    drag = true;
    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!drag) return;
    panel.style.left = (e.clientX - ox) + "px";
    panel.style.top = (e.clientY - oy) + "px";
  });
  document.addEventListener("mouseup", () => { drag = false; });

  renderPanel();
}

/* ---------- 处理 AI 回复 ---------- */
function onMessageReceived(messageId) {
  try {
    const ctx = SillyTavern.getContext();
    const msg = ctx.chat[messageId];
    if (!msg || msg.is_user) return;

    const text = msg.mes || "";
    const parsed = parsePsyBlock(text);
    if (parsed) {
      for (const name in parsed) {
        PSY.characters[name] = Object.assign(
          PSY.characters[name] || {},
          parsed[name]
        );
      }
      savePsy();
      renderPanel();
    }

    const worldChars = getWorldCharacters();
    let changed = false;
    for (const name of worldChars) {
      if (!PSY.characters[name]) {
        PSY.characters[name] = {
          think: { v: 50, note: "…" },
          emo:   { v: 50, note: "…" },
          phy:   { v: 50, note: "…" }
        };
        changed = true;
      }
    }
    if (changed) { savePsy(); renderPanel(); }

    hidePsyBlock(messageId);
  } catch (e) {
    console.warn("[心理栏] 处理失败", e);
  }
}

/* ---------- 隐藏消息里的 [心理状态] 段 ---------- */
function hidePsyBlock(messageId) {
  const el = document.querySelector('.mes[mesid="' + messageId + '"] .mes_text');
  if (!el) return;
  const html = el.innerHTML;
  const re = /(\[心理状态\][\s\S]*?)(?=\n\[[^\]]+\]|<br\s*\/?>|$)/;
  if (re.test(html)) {
    el.innerHTML = html.replace(re, '<span style="display:none">$1</span>');
  }
}

/* ---------- 初始化 ---------- */
jQuery(async () => {
  loadPsy();
  createPanel();

  const ctx = SillyTavern.getContext();
  const { eventSource, event_types } = ctx;

  eventSource.on(event_types.MESSAGE_RECEIVED, (id) => {
    onMessageReceived(id);
  });

  eventSource.on(event_types.CHAT_CHANGED, () => {
    renderPanel();
  });

  console.log("[心理状态实时栏] 已加载");
});
