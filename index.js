/* =========================================================
   心理状态实时栏 · 酒馆扩展 v1.1
   ========================================================= */

const PSY_STORAGE = "psy_panel_data";

let PSY = { characters: {} };

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
  } catch (e) {}
  return [];
}

/* ---------- 角色名是否合法 ---------- */
function isValidName(name) {
  if (!name) return false;
  name = name.trim();
  if (name.length === 0 || name.length > 20) return false;
  // 不能包含这些字符
  if (/[<>|｜\[\]{}（）()「」『』\/\\:：,，。\.、\s]/.test(name)) return false;
  // 不能是纯数字或纯符号
  if (/^[\d\W]+$/.test(name)) return false;
  return true;
}

/* ---------- 解析 AI 输出里的 [心理状态] ---------- */
function parsePsyBlock(text) {
  // 只匹配 [心理状态] 开始，到下一个 [xxx] 块或结束
  const blockRe = /\[心理状态\]([\s\S]*?)(?=\n\s*\[[^\]]{1,20}\][^]*$|$)/;
  const m = text.match(blockRe);
  if (!m) return null;

  const body = m[1];
  const result = {};
  let currentChar = null;

  const lines = body.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // 跳过 HTML 标签行
    if (/^<\/?(details|summary|status|div|span|p|br)/i.test(line)) {
      currentChar = null;
      continue;
    }
    // 跳过包含标签的行
    if (/<[a-zA-Z\/]/.test(line)) {
      currentChar = null;
      continue;
    }

    // 类型行： 思维：50%|备注
    let typeMatch = line.match(/^(思维|情感心理|情感|生理)[:：]\s*(\d+)%?\s*[|｜]?\s*(.*)$/);
    if (typeMatch && currentChar) {
      const [, type, val, note] = typeMatch;
      const key = mapType(type);
      result[currentChar][key] = { v: parseInt(val), note: note.trim() };
      continue;
    }

    // 名字行： 小茉莉： 或 小茉莉
    let nameMatch = line.match(/^([^:：<>|｜\[\]{}（）()「」]{1,20})[:：]?\s*$/);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      if (isValidName(name)) {
        currentChar = name;
        result[currentChar] = result[currentChar] || {};
      } else {
        currentChar = null;
      }
      continue;
    }

    // 行内带名字： 小茉莉：思维：50%|备注
    let inlineMatch = line.match(/^([^:：<>|｜\[\]{}（）()「」]{1,20})[:：]\s*(思维|情感心理|情感|生理)[:：]\s*(\d+)%?\s*[|｜]?\s*(.*)$/);
    if (inlineMatch) {
      const [, name, type, val, note] = inlineMatch;
      const charName = name.trim();
      if (isValidName(charName)) {
        result[charName] = result[charName] || {};
        const key = mapType(type);
        result[charName][key] = { v: parseInt(val), note: note.trim() };
      }
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

  // 过滤掉非法角色名
  const chars = Object.keys(PSY.characters).filter(isValidName);

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
        if (!isValidName(name)) continue;
        PSY.characters[name] = Object.assign(
          PSY.characters[name] || {},
          parsed[name]
        );
      }
      // 清掉非法角色
      for (const k in PSY.characters) {
        if (!isValidName(k)) delete PSY.characters[k];
      }
      savePsy();
      renderPanel();
    }
  } catch (e) {
    console.warn("[心理栏] 处理失败", e);
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

  console.log("[心理状态实时栏] 已加载 v1.1");
});
