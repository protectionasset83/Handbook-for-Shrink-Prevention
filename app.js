/* Shrink Prevention Website */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    rules: "shrink-prevention-rules",
    reason: "reason-codes",
    loss: "loss-codes",
  };

  const DEFAULT_ADMIN_PASSWORD = "admin123";

  const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"];
  const STICKY_COLORS = ["#FEF08A","#FBCFE8","#BFDBFE","#BBF7D0","#DDD6FE"];
  const ROTATIONS = [2,-2,1,-1];

  const $ = (sel) => document.querySelector(sel);

  const state = {
    rules: [],
    viewMode: "infographic",
    searchQuery: "",
    currentPage: 1,
    rowsPerPage: 10,
    isAdmin: false,
    editingRuleIndex: null,
  };

  /* ------------------ DATA LOAD ------------------ */

  async function loadFromRulesJson() {
    try {
      const res = await fetch("./rules.json", { cache: "no-store" });
      const data = await res.json();
      state.rules = Array.isArray(data.rules) ? data.rules : [];
    } catch {
      state.rules = [];
    }
  }

  /* ------------------ RENDER ------------------ */

  function renderInfographicView() {
    const filtered = getFilteredRules();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.rowsPerPage));
    state.currentPage = clamp(state.currentPage, 1, totalPages);

    const start = (state.currentPage - 1) * state.rowsPerPage;
    const pageRules = filtered.slice(start, start + state.rowsPerPage);

    const cards = pageRules.map((rule, i) => {
      const idx = state.rules.indexOf(rule);
      const color = COLORS[idx % COLORS.length];
      return `
        <article class="card">
          <div class="card-border" style="background:${color};"></div>
          <div class="rule-head">
            <div class="badge" style="background:${color};">${idx + 1}</div>
            <div class="rule-text">${escapeHtml(rule)}</div>
          </div>
        </article>
      `;
    }).join("");

    return `
      <section class="view bg-infographic">
        <div class="container">
          <div class="view-title-row">
            <div class="view-title">Shrink Prevention Rules</div>
            <div class="rows-selector">
              <label>Rows:</label>
              <select id="rowsSelect">
                ${[5,10,20,30,50].map(n =>
                  `<option value="${n}" ${state.rowsPerPage===n?"selected":""}>${n}</option>`
                ).join("")}
              </select>
            </div>
          </div>

          <div class="grid">${cards}</div>

          <div class="pagination">
            <button data-action="page-prev" ${state.currentPage===1?"disabled":""}>◀</button>
            <span>Page ${state.currentPage} of ${totalPages}</span>
            <button data-action="page-next" ${state.currentPage===totalPages?"disabled":""}>▶</button>
          </div>
        </div>
      </section>
    `;
  }

  function render() {
    const main = $("#main");
    if (!main) return;
    main.innerHTML = renderInfographicView();
  }

  /* ------------------ HELPERS ------------------ */

  function getFilteredRules() {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return state.rules;
    return state.rules.filter(r => r.toLowerCase().includes(q));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  /* ------------------ EVENTS ------------------ */

  function attachShellListeners() {

    $("#main").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      if (btn.dataset.action === "page-prev") {
        state.currentPage--;
        render();
      }

      if (btn.dataset.action === "page-next") {
        state.currentPage++;
        render();
      }
    });

    document.addEventListener("change", (e) => {
      if (e.target.id === "rowsSelect") {
        state.rowsPerPage = Number(e.target.value);
        state.currentPage = 1;
        render();
      }
    });
  }

  /* ------------------ BOOT ------------------ */

  async function boot() {
    await loadFromRulesJson();
    attachShellListeners();
    render();
  }

  boot();
})();
