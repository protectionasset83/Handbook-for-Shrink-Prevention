
/* Shrink Prevention Website
 * - Stores data in localStorage
 * - Fix: editing one rule no longer overwrites all rules
 * - Adds safer "Add rules" vs "Replace all rules"
 */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    rules: "shrink-prevention-rules",
    reason: "reason-codes",
    loss: "loss-codes",
  };

  const DEFAULT_ADMIN_PASSWORD = "admin123";

  const AUTH_TOKEN_KEY = "shrink-prevention-admin-token";
  const API_ENABLED = window.location.protocol !== "file:";


  const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16"];
  const STICKY_COLORS = ["#FEF08A","#FBCFE8","#BFDBFE","#BBF7D0","#DDD6FE","#FED7AA"];
  const ROTATIONS = [2,-2,1,-1];

  const $ = (sel) => document.querySelector(sel);

  const state = {
    rules: [],
    reasonCodes: [],
    lossCodes: [],
    viewMode: "infographic",
    searchQuery: "",
    currentPage: 1,
    rowsPerPage: 10,
    expandedCodeKey: null,
    isAdmin: false,
    adminToken: null,
    serverOnline: null,
    lastSync: null,
    editingRuleIndex: null,
    message: null, // {type:'info'|'warn'|'error', text:string}
  };

  function safeJsonParse(value, fallback) {
    try {
      if (value == null) return fallback;
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function loadFromLocalStorage() {
    state.rules = safeJsonParse(localStorage.getItem(STORAGE_KEYS.rules), []);
    state.reasonCodes = safeJsonParse(localStorage.getItem(STORAGE_KEYS.reason), []);
    state.lossCodes = safeJsonParse(localStorage.getItem(STORAGE_KEYS.loss), []);
  }

  function saveKey(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function saveToLocalStorage() {
    saveKey(STORAGE_KEYS.rules, state.rules);
    saveKey(STORAGE_KEYS.reason, state.reasonCodes);
    saveKey(STORAGE_KEYS.loss, state.lossCodes);
  }

  async function loadFromRulesJson() {
  try {
    const res = await fetch("./rules.json", { cache: "no-store" });
    const data = await res.json();

    state.rules = Array.isArray(data.rules) ? data.rules : [];
    state.reasonCodes = Array.isArray(data.reasonCodes) ? data.reasonCodes : [];
    state.lossCodes = Array.isArray(data.lossCodes) ? data.lossCodes : [];

  } catch (e) {
    console.error("Failed to load rules.json", e);
    state.rules = [];
    state.reasonCodes = [];
    state.lossCodes = [];
  }
}
/* 👆 END ADD 👆 */

async function loadAll() {
  // Load from local storage first
  loadFromLocalStorage();

    // 2) If served over http/https, also load the shared server state.
    if (API_ENABLED) {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          state.rules = Array.isArray(data.rules) ? data.rules : state.rules;
          state.reasonCodes = Array.isArray(data.reasonCodes) ? data.reasonCodes : state.reasonCodes;
          state.lossCodes = Array.isArray(data.lossCodes) ? data.lossCodes : state.lossCodes;
          state.serverOnline = true;
          state.lastSync = data.updatedAt || null;

          // Cache the server state locally as well.
          saveToLocalStorage();
        } else {
          state.serverOnline = false;
        }
      } catch {
        state.serverOnline = false;
      }
    }
  }

  async function saveAll() {
    // Always save locally.
    saveToLocalStorage();

    // If we have a server and an admin token, also persist to the shared server store.
    if (API_ENABLED && state.adminToken) {
      try {
        const res = await fetch("/api/state", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${state.adminToken}`,
          },
          body: JSON.stringify({
            rules: state.rules,
            reasonCodes: state.reasonCodes,
            lossCodes: state.lossCodes,
          }),
        });

        if (res.status === 401) {
          // Token expired/invalid. Force logout.
          state.isAdmin = false;
          state.adminToken = null;
          localStorage.removeItem(AUTH_TOKEN_KEY);
          toast("Admin session expired. Please login again.", "warn");
          render();
          return;
        }

        if (!res.ok) {
          state.serverOnline = false;
          toast("Saved locally, but failed to sync to server.", "warn");
          render();
          return;
        }

        state.serverOnline = true;
        state.lastSync = new Date().toISOString();
      } catch {
        state.serverOnline = false;
        toast("Saved locally, but server is unreachable.", "warn");
        render();
      }
    }
  }

  function parseRules(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    const parsed = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cleaned = trimmed
        .replace(/^[\d\.]+\s*[-•*)\]]\s*/, "")
        .replace(/^[a-z]\)\s*/i, "")
        .replace(/^[-•*]\s*/, "");
      if (cleaned.length > 0) parsed.push(cleaned);
    }
    return parsed;
  }

  function parseCodes(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    const codes = [];
    let current = null;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        if (current) codes.push(current);
        current = { number: match[1], title: match[2], definition: "" };
      } else if (current && trimmed.length > 0) {
        current.definition += (current.definition ? " " : "") + trimmed;
      }
    }
    if (current) codes.push(current);
    return codes;
  }

  function getFilteredRules() {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return state.rules;
    return state.rules.filter((r) => String(r).toLowerCase().includes(q));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function closeSidebar() {
    $("#sidebar").classList.add("hidden");
    $("#overlay").classList.add("hidden");
  }

  function openSidebar() {
    $("#sidebar").classList.remove("hidden");
    $("#overlay").classList.remove("hidden");
  }

  function setActiveNav() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      const v = btn.getAttribute("data-view");
      btn.classList.toggle("active", v === state.viewMode);
    });
  }

  function setAdminUI() {
    $("#adminStatus").textContent = state.isAdmin ? "Admin" : "Viewer";
    $("#adminLoginBtn").classList.toggle("hidden", state.isAdmin);
    $("#adminLogoutBtn").classList.toggle("hidden", !state.isAdmin);
  }

  function toast(text, type = "info") {
    state.message = { text, type };
    render();
    window.setTimeout(() => {
      if (state.message && state.message.text === text) {
        state.message = null;
        render();
      }
    }, 2800);
  }

  function openModal(html) {
    const root = $("#modalRoot");
    root.innerHTML = `
      <div class="modal-backdrop" data-modal-close="true"></div>
      <div class="modal" role="dialog" aria-modal="true">
        ${html}
      </div>
    `;
  }

  function closeModal() {
    $("#modalRoot").innerHTML = "";
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderHeaderMessage() {
    if (!state.message) return "";
    const badge =
      state.message.type === "warn"
        ? "background:#fff7ed;border-color:rgba(234,88,12,.25);"
        : state.message.type === "error"
        ? "background:#fef2f2;border-color:rgba(220,38,38,.25);"
        : "background:#f3f4f6;border-color:rgba(0,0,0,.08);";
    return `<div class="notice" style="${badge}">${escapeHtml(state.message.text)}</div>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderInfographicView() {
    const rulesPerPage = state.rowsPerPage;
    const filtered = getFilteredRules();
    const totalPages = Math.max(1, Math.ceil(filtered.length / rulesPerPage));
    state.currentPage = clamp(state.currentPage, 1, totalPages);

    const start = (state.currentPage - 1) * rulesPerPage;
    const pageRules = filtered.slice(start, start + rulesPerPage);

    const cards = pageRules
      .map((rule) => {
        // For display index, we want the index in the full list (not just filtered slice)
        const idx = state.rules.indexOf(rule);
        const color = COLORS[idx % COLORS.length];
        const border = color;

        return `
          <article class="card">
            <div class="card-border" style="background:${border};"></div>
            <button class="report-btn" data-action="report" data-index="${idx}" title="Report this rule" aria-label="Report this rule">!</button>

            <div class="rule-head">
              <div class="badge" style="background:${color};">${idx + 1}</div>
              <div class="rule-text">${escapeHtml(rule)}</div>
            </div>

            ${state.isAdmin ? `
              <div class="card-actions">
                <button class="btn btn-primary" data-action="edit-rule" data-index="${idx}">Edit</button>
                <button class="btn btn-danger" data-action="delete-rule" data-index="${idx}">Delete</button>
              </div>
            ` : ""}
          </article>
        `;
      })
      .join("");

    const pager =
      totalPages > 1
        ? `
          <div class="pagination">
            <button class="btn btn-ghost" data-action="page-prev" ${state.currentPage === 1 ? "disabled" : ""}>◀</button>
            <div class="page-pill">Page ${state.currentPage} of ${totalPages}</div>
            <button class="btn btn-ghost" data-action="page-next" ${state.currentPage === totalPages ? "disabled" : ""}>▶</button>
          </div>
        `
        : "";

    const empty = filtered.length === 0 ? `<div class="panel" style="text-align:center;">No rules available</div>` : "";

    return `
      <section class="view bg-infographic">
        <div class="container">
          <div class="view-title">Shrink Prevention Rules</div>
          <div style="margin-bottom:10px;">
  <label style="font-size:14px;">Rows:</label>
  <select id="rowsSelect">
    <option value="5">5</option>
    <option value="10" selected>10</option>
    <option value="20">20</option>
    <option value="30">30</option>
    <option value="50">50</option>
  </select>
</div>
          ${renderHeaderMessage()}
          ${empty}
          <div class="grid">${cards}</div>
          ${pager}
        </div>
      </section>
    `;
  }

  function renderStickyView() {
    const rulesPerPage = 10;
    const filtered = getFilteredRules();
    const totalPages = Math.max(1, Math.ceil(filtered.length / rulesPerPage));
    state.currentPage = clamp(state.currentPage, 1, totalPages);

    const start = (state.currentPage - 1) * rulesPerPage;
    const pageRules = filtered.slice(start, start + rulesPerPage);

    const notes = pageRules
      .map((rule) => {
        const idx = state.rules.indexOf(rule);
        const bg = STICKY_COLORS[idx % STICKY_COLORS.length];
        const rot = ROTATIONS[idx % ROTATIONS.length];
        return `
          <div class="sticky" style="background:${bg}; transform: rotate(${rot}deg);">
            <button class="report-btn" data-action="report" data-index="${idx}" title="Report this rule" aria-label="Report this rule">!</button>
            <div class="sticky-top">Rule #${idx + 1}</div>
            <div class="sticky-text">${escapeHtml(rule)}</div>
            ${state.isAdmin ? `
              <div class="btn-row" style="margin-top:10px;">
                <button class="btn btn-primary btn-sm" data-action="edit-rule" data-index="${idx}">Edit</button>
                <button class="btn btn-danger btn-sm" data-action="delete-rule" data-index="${idx}">Delete</button>
              </div>
            ` : ""}
          </div>
        `;
      })
      .join("");

    const pager =
      totalPages > 1
        ? `
          <div class="pagination">
            <button class="btn btn-ghost" data-action="page-prev" ${state.currentPage === 1 ? "disabled" : ""}>◀</button>
            <div class="page-pill">Page ${state.currentPage} of ${totalPages}</div>
            <button class="btn btn-ghost" data-action="page-next" ${state.currentPage === totalPages ? "disabled" : ""}>▶</button>
          </div>
        `
        : "";

    const empty = filtered.length === 0 ? `<div class="panel" style="text-align:center;">No rules available</div>` : "";

    return `
      <section class="view bg-sticky">
        <div class="container">
          <div class="view-title">Shrink Prevention Rules</div>
          ${renderHeaderMessage()}
          ${empty}
          <div class="sticky-wrap">${notes}</div>
          ${pager}
        </div>
      </section>
    `;
  }

  function renderCodesView(type) {
    const isReason = type === "reason";
    const title = isReason ? "Reason Codes" : "Loss Codes";
    const codes = isReason ? state.reasonCodes : state.lossCodes;

    const addPanel = state.isAdmin
      ? `
        <div class="panel" style="margin-bottom:14px;">
          <h3>Add New Codes</h3>
          <div class="small muted" style="margin-bottom:8px;">
            Format: <b>1. Title</b> then definition lines. Repeat for each code.
          </div>
          <textarea id="codesTextarea" placeholder="1. Code Title&#10;Code definition here&#10;&#10;2. Another Code&#10;Its definition"></textarea>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn btn-primary" data-action="save-codes" data-type="${type}">Save Codes</button>
          </div>
        </div>
      `
      : "";

    const list = codes.length
      ? codes
          .map((c, i) => {
            const key = `${type}-${i}`;
            const expanded = state.expandedCodeKey === key;
            return `
              <div class="code-item">
                <button class="code-btn" data-action="toggle-code" data-key="${key}">
                  <div class="code-num">${escapeHtml(c.number)}</div>
                  <div class="code-title">${escapeHtml(c.title)}</div>
                  <div class="code-actions">
                    ${state.isAdmin ? `<button class="btn btn-danger btn-sm" data-action="delete-code" data-type="${type}" data-index="${i}" title="Delete code" aria-label="Delete code">Delete</button>` : ""}
                  </div>
                  <div class="muted" style="font-size:18px; padding-left:6px;">${expanded ? "▴" : "▾"}</div>
                </button>
                ${expanded ? `<div class="code-def">${escapeHtml(c.definition || "No definition")}</div>` : ""}
              </div>
            `;
          })
          .join("")
      : `<div class="panel" style="text-align:center;">No codes available</div>`;

    return `
      <section class="view bg-codes">
        <div class="container">
          <div class="codes-head">
            <div class="view-title" style="margin:0;">${title}</div>
          </div>
          ${renderHeaderMessage()}
          ${addPanel}
          ${list}
        </div>
      </section>
    `;
  }

  function renderManageView() {
    if (!state.isAdmin) {
      return `
        <section class="view bg-manage">
          <div class="container">
            <div class="view-title">Manage Rules</div>
            ${renderHeaderMessage()}
            <div class="panel" style="text-align:center;">
              <div style="font-size:46px;opacity:.35;">🔒</div>
              <h3 style="margin-top:10px;">Admin Access Required</h3>
              <div class="muted small" style="margin: 8px 0 14px;">Login to add/edit rules and codes.</div>
              <button class="btn btn-primary" data-action="open-admin-login">Admin Login</button>
            </div>
          </div>
        </section>
      `;
    }

    const editing = Number.isInteger(state.editingRuleIndex);
    const idx = state.editingRuleIndex;
    const current = editing ? (state.rules[idx] ?? "") : "";

    return `
      <section class="view bg-manage">
        <div class="container">
          <div class="view-title">${editing ? `Edit Rule #${idx + 1}` : "Manage Rules"}</div>
          ${renderHeaderMessage()}

          <div class="panel">
            ${
              editing
                ? `
                  <h3>Update rule text</h3>
                  <textarea id="rulesTextarea" placeholder="Rule text">${escapeHtml(current)}</textarea>
                  <div class="btn-row" style="margin-top:10px;">
                    <button class="btn btn-primary" data-action="save-edit-rule" data-index="${idx}">Save Changes</button>
                    <button class="btn btn-ghost" data-action="cancel-edit-rule">Cancel</button>
                  </div>
                  <div class="small muted" style="margin-top:10px;">
                    Fix applied: saving an edit updates only this rule (it will not delete other rules).
                  </div>
                `
                : `
                  <h3>Add rules</h3>
                  <div class="small muted" style="margin-bottom:8px;">
                    Enter one rule per line. Use <b>Add</b> to append without losing existing rules.
                    Use <b>Replace All</b> only if you intend to overwrite the entire list.
                  </div>
                  <textarea id="rulesTextarea" placeholder="Enter rules - one per line&#10;Any format works!"></textarea>

                  <div class="btn-row" style="margin-top:10px;">
                    <button class="btn btn-primary" data-action="add-rules">Add Rules</button>
                    <button class="btn btn-danger" data-action="replace-rules">Replace All Rules</button>
                  </div>

                  <div class="btn-row" style="margin-top:10px;">
                    <button class="btn btn-ghost" data-action="export-data">Export Data</button>
                    <label class="btn btn-ghost" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
                      Import Data
                      <input id="importFile" class="hidden" type="file" accept="application/json" />
                    </label>
                  </div>

                  <div class="small muted" style="margin-top:10px;">
                    Export creates a JSON backup you can save in OneDrive/Drive to make “forever” storage practical across devices.
                  </div>
                `
            }
          </div>

          <div class="panel" style="margin-top:14px;">
            <h3>Quick stats</h3>
            <div class="small muted">
              Rules: <b>${state.rules.length}</b> · Reason Codes: <b>${state.reasonCodes.length}</b> · Loss Codes: <b>${state.lossCodes.length}</b>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function render() {
    setActiveNav();
    setAdminUI();

    const main = $("#main");
    if (!main) return;

    let html = "";
    if (state.viewMode === "infographic") html = renderInfographicView();
    else if (state.viewMode === "sticky") html = renderStickyView();
    else if (state.viewMode === "reason") html = renderCodesView("reason");
    else if (state.viewMode === "loss") html = renderCodesView("loss");
    else html = renderManageView();

    main.innerHTML = html;
  }

  // Actions
  function setView(view) {
    state.viewMode = view;
    state.currentPage = 1;
    state.expandedCodeKey = null;
    // Keep editing state unless switching away from manage; if user navigates away, cancel edit
    if (view !== "input") state.editingRuleIndex = null;
    render();
  }

  function openAdminLoginModal() {
    openModal(`
      <div class="modal-top">
        <h3>Admin Login</h3>
        <button class="close-x" data-modal-close="true" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <div class="small muted" style="margin-bottom:10px;">Admin password is configured by the site administrator (change it for production).</div>
        <label class="small muted" for="adminPwd">Password</label>
        <input id="adminPwd" type="password" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.18);font-family:var(--font);font-size:14px;" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close="true">Cancel</button>
        <button class="btn btn-primary" data-action="admin-login">Login</button>
      </div>
    `);
    window.setTimeout(() => {
      const inp = $("#adminPwd");
      if (inp) inp.focus();
    }, 50);
  }

  function confirmModal({ title, body, confirmText, confirmAction, danger = false }) {
    openModal(`
      <div class="modal-top">
        <h3>${escapeHtml(title)}</h3>
        <button class="close-x" data-modal-close="true" aria-label="Close">×</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close="true">Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="${confirmAction}">${escapeHtml(confirmText)}</button>
      </div>
    `);
  }

  function reportRuleModal(index) {
    const rule = state.rules[index];
    if (rule == null) return;

    openModal(`
      <div class="modal-top">
        <h3>Report Rule</h3>
        <button class="close-x" data-modal-close="true" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <div class="kv">
          <div class="k">Rule #${index + 1}</div>
          <div class="v">${escapeHtml(rule)}</div>
        </div>

        <div class="kv" style="margin-top:10px;background:#eff6ff;">
          <div class="k">Email</div>
          <div class="v"><b>sneha.balakrishnan@lowes.com</b></div>
          <div class="small muted" style="margin-top:8px;">
            Use the button below to copy a ready-to-paste email.
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close="true">Close</button>
        <button class="btn btn-primary" data-action="copy-report-email" data-index="${index}">Copy Email</button>
      </div>
    `);
  }

  // Event listeners
  function attachShellListeners() {
    $("#menuBtn").addEventListener("click", () => {
      const hidden = $("#sidebar").classList.contains("hidden");
      hidden ? openSidebar() : closeSidebar();
    });
    $("#overlay").addEventListener("click", closeSidebar);

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        setView(view);
        closeSidebar();
      });
    });

    $("#searchInput").addEventListener("input", (e) => {
      state.searchQuery = e.target.value || "";
      state.currentPage = 1;
      render();
    });

    $("#adminLoginBtn").addEventListener("click", () => {
      openAdminLoginModal();
    });

    $("#adminLogoutBtn").addEventListener("click", () => {
      state.isAdmin = false;
      state.adminToken = null;
      state.editingRuleIndex = null;
      localStorage.removeItem(AUTH_TOKEN_KEY);
      toast("Logged out.");
      render();
    });

    // Modal close + action delegation
    $("#modalRoot").addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      const closeEl = t.closest('[data-modal-close="true"]');
      if (closeEl) {
        closeModal();
        return;
      }

      const actionEl = t.closest("[data-action]");
      const action = actionEl ? actionEl.getAttribute("data-action") : null;
      if (!action) return;

      if (action === "admin-login") {
        const pwd = ($("#adminPwd")?.value || "").trim();

        (async () => {
          if (!pwd) {
            toast("Enter a password.", "warn");
            return;
          }

          // If the site is running from a server, authenticate against the server so the password
          // is NOT embedded in the front-end and admin access works for the shared database.
          if (API_ENABLED) {
            try {
              const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pwd }),
              });

              if (!res.ok) {
                toast("Incorrect password.", "error");
                return;
              }

              const data = await res.json();
              state.isAdmin = true;
              state.adminToken = data && data.token ? data.token : null;

              if (state.adminToken) {
                localStorage.setItem(AUTH_TOKEN_KEY, state.adminToken);
              }

              closeModal();
              toast("Admin access enabled.");
              render();
            } catch {
              toast("Cannot reach the server. Try again.", "error");
            }
            return;
          }

          // Local/offline mode (opened as a file) – fallback to the built-in password.
          if (pwd === DEFAULT_ADMIN_PASSWORD) {
            state.isAdmin = true;
            closeModal();
            toast("Admin access enabled.");
            render();
          } else {
            toast("Incorrect password.", "error");
          }
        })();

        return;
      }

      if (action === "copy-report-email") {
        const idx = Number(actionEl.getAttribute("data-index"));
        const rule = state.rules[idx];
        const content = `To: sneha.balakrishnan@lowes.com\nSubject: Rule Report\n\nRule #${idx + 1}: ${rule}`;
        navigator.clipboard
          .writeText(content)
          .then(() => toast("Copied to clipboard."))
          .catch(() => toast("Copy failed. Try running from https or localhost.", "warn"));
        return;
      }

      if (action === "confirm-delete-rule") {
        const idx = Number(actionEl.getAttribute("data-index"));
        if (!Number.isInteger(idx)) return;
        state.rules = state.rules.filter((_, i) => i !== idx);
        saveKey(STORAGE_KEYS.rules, state.rules);
        closeModal();
        toast(`Deleted rule #${idx + 1}.`);
        render();
        return;
      }

      if (action === "confirm-replace-all") {
        const text = $("#rulesTextarea")?.value || "";
        const parsed = parseRules(text);
        state.rules = parsed;
        saveKey(STORAGE_KEYS.rules, state.rules);
        closeModal();
        toast("Replaced all rules.");
        // Stay in manage view
        render();
        return;
      }
    });

    // Main delegation
    $("#main").addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      const actionEl = t.closest("[data-action]");
      const action = actionEl ? actionEl.getAttribute("data-action") : null;
      if (!action) return;

      if (action === "page-prev") {
        state.currentPage = Math.max(1, state.currentPage - 1);
        render();
        return;
      }
      if (action === "page-next") {
        const filtered = getFilteredRules();
        const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
        state.currentPage = Math.min(totalPages, state.currentPage + 1);
        render();
        return;
      }

      if (action === "report") {
        const idx = Number(actionEl.getAttribute("data-index"));
        reportRuleModal(idx);
        return;
      }

      if (action === "edit-rule") {
        if (!state.isAdmin) return;
        const idx = Number(actionEl.getAttribute("data-index"));
        if (!Number.isInteger(idx)) return;
        state.editingRuleIndex = idx;
        setView("input"); // manage view
        closeSidebar();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (action === "delete-rule") {
        if (!state.isAdmin) return;
        const idx = Number(actionEl.getAttribute("data-index"));
        const rule = state.rules[idx];
        confirmModal({
          title: "Confirm Delete",
          body: `<div class="kv"><div class="k">Delete rule #${idx + 1}?</div><div class="v">${escapeHtml(rule)}</div></div>`,
          confirmText: "Delete",
          confirmAction: `confirm-delete-rule`,
          danger: true,
        });
        // Attach index onto confirm button by rewriting modalRoot after open
        // We'll do it by finding that button and setting data-index.
        setTimeout(() => {
          const btn = document.querySelector('#modalRoot [data-action="confirm-delete-rule"]');
          if (btn) btn.setAttribute("data-index", String(idx));
        }, 0);
        return;
      }

      if (action === "open-admin-login") {
        openAdminLoginModal();
        return;
      }

      if (action === "cancel-edit-rule") {
        state.editingRuleIndex = null;
        toast("Edit cancelled.");
        render();
        return;
      }

      if (action === "save-edit-rule") {
        if (!state.isAdmin) return;
        const idx = Number(actionEl.getAttribute("data-index"));
        const text = ($("#rulesTextarea")?.value || "").trim();
        if (!text) {
          toast("Rule text cannot be empty.", "warn");
          return;
        }
        // FIX: update only the edited rule (no overwriting the entire array)
        const updated = state.rules.slice();
        updated[idx] = text;
        state.rules = updated;
        saveKey(STORAGE_KEYS.rules, state.rules);
        state.editingRuleIndex = null;
        toast(`Updated rule #${idx + 1}.`);
        setView("infographic");
        return;
      }

      if (action === "add-rules") {
        if (!state.isAdmin) return;
        const text = $("#rulesTextarea")?.value || "";
        const newRules = parseRules(text);
        if (!newRules.length) {
          toast("Nothing to add.", "warn");
          return;
        }
        // Append, with de-dupe (case-insensitive)
        const existingLower = new Set(state.rules.map((r) => String(r).toLowerCase().trim()));
        const toAdd = [];
        for (const r of newRules) {
          const key = String(r).toLowerCase().trim();
          if (!existingLower.has(key)) {
            existingLower.add(key);
            toAdd.push(r);
          }
        }
        if (!toAdd.length) {
          toast("All provided rules already exist.", "warn");
          return;
        }
        state.rules = state.rules.concat(toAdd);
        saveKey(STORAGE_KEYS.rules, state.rules);
        $("#rulesTextarea").value = "";
        toast(`Added ${toAdd.length} rule(s).`);
        render();
        return;
      }

      if (action === "replace-rules") {
        if (!state.isAdmin) return;
        confirmModal({
          title: "Replace All Rules",
          body: `<div class="kv"><div class="k">This will overwrite your entire rules list.</div><div class="v">If you only want to add, use “Add Rules” instead.</div></div>`,
          confirmText: "Replace All",
          confirmAction: "confirm-replace-all",
          danger: true,
        });
        return;
      }

      if (action === "export-data") {
        const payload = {
          exportedAt: new Date().toISOString(),
          rules: state.rules,
          reasonCodes: state.reasonCodes,
          lossCodes: state.lossCodes,
        };
        downloadJson("shrink-prevention-backup.json", payload);
        toast("Export started.");
        return;
      }

      if (action === "save-codes") {
        if (!state.isAdmin) return;
        const type = actionEl.getAttribute("data-type");
        const textarea = $("#codesTextarea");
        const text = textarea?.value || "";
        const newCodes = parseCodes(text);
        if (!newCodes.length) {
          toast("Nothing to save.", "warn");
          return;
        }
        if (type === "reason") {
          state.reasonCodes = state.reasonCodes.concat(newCodes);
          saveKey(STORAGE_KEYS.reason, state.reasonCodes);
        } else {
          state.lossCodes = state.lossCodes.concat(newCodes);
          saveKey(STORAGE_KEYS.loss, state.lossCodes);
        }
        if (textarea) textarea.value = "";
        toast("Codes saved.");
        render();
        return;
      }

      if (action === "toggle-code") {
        const key = actionEl.getAttribute("data-key");
        state.expandedCodeKey = state.expandedCodeKey === key ? null : key;
        render();
        return;
      }

      if (action === "delete-code") {
        if (!state.isAdmin) return;
        const type = actionEl.getAttribute("data-type");
        const idx = Number(actionEl.getAttribute("data-index"));
        if (!Number.isInteger(idx)) return;

        const list = type === "reason" ? state.reasonCodes : state.lossCodes;
        const code = list[idx];

        confirmModal({
          title: "Delete Code",
          body: `<div class="kv"><div class="k">Delete ${escapeHtml(code?.number ?? "")}. ${escapeHtml(code?.title ?? "")}?</div><div class="v">${escapeHtml(code?.definition ?? "")}</div></div>`,
          confirmText: "Delete",
          confirmAction: "confirm-delete-code",
          danger: true,
        });

        setTimeout(() => {
          const btn = document.querySelector('#modalRoot [data-action="confirm-delete-code"]');
          if (btn) {
            btn.setAttribute("data-type", String(type));
            btn.setAttribute("data-index", String(idx));
          }
        }, 0);
        return;
      }
    });

    // Modal delegation for delete-code confirm
    $("#modalRoot").addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const actionEl = t.closest("[data-action]");
      const action = actionEl ? actionEl.getAttribute("data-action") : null;
      if (action !== "confirm-delete-code") return;

      const type = actionEl.getAttribute("data-type");
      const idx = Number(actionEl.getAttribute("data-index"));
      if (!Number.isInteger(idx)) return;

      if (type === "reason") {
        state.reasonCodes = state.reasonCodes.filter((_, i) => i !== idx);
        saveKey(STORAGE_KEYS.reason, state.reasonCodes);
      } else {
        state.lossCodes = state.lossCodes.filter((_, i) => i !== idx);
        saveKey(STORAGE_KEYS.loss, state.lossCodes);
      }
      state.expandedCodeKey = null;
      closeModal();
      toast("Code deleted.");
      render();
    });

    // Import file input
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "rowsSelect") {
  state.rowsPerPage = Number(t.value);
  state.currentPage = 1;
  render();
  return;
}
      if (!(t instanceof HTMLInputElement)) return;
      if (t.id !== "importFile") return;
      const file = t.files && t.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(String(reader.result || "{}"));
          const rules = Array.isArray(payload.rules) ? payload.rules : [];
          const reason = Array.isArray(payload.reasonCodes) ? payload.reasonCodes : [];
          const loss = Array.isArray(payload.lossCodes) ? payload.lossCodes : [];
          state.rules = rules;
          state.reasonCodes = reason;
          state.lossCodes = loss;
          saveAll();
          toast("Import complete.");
          render();
        } catch {
          toast("Import failed: invalid JSON file.", "error");
        } finally {
          // reset input so same file can be selected again
          t.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  async function boot() {
    // Persist admin session on this device (server will enforce auth on save).
    state.adminToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (state.adminToken) state.isAdmin = true;

    await loadFromRulesJson();

    attachShellListeners();
    setView("infographic");
    render();

    // If the user is in local/file mode, remind them that data is device-local.
    if (!API_ENABLED) {
      // No toast by default (avoid noise), but the README explains this limitation.
    }
  }

  boot();
})();
