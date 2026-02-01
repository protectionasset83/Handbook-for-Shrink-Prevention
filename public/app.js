/* Shrink Prevention Website
 * READ-ONLY VERSION
 * Rules are loaded permanently from rules.json (GitHub)
 * No admin, no saving, no localStorage
 */

(function () {
  "use strict";

  const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16"];
  const STICKY_COLORS = ["#FEF08A","#FBCFE8","#BFDBFE","#BBF7D0","#DDD6FE","#FED7AA"];
  const ROTATIONS = [2,-2,1,-1];

  const $ = (sel) => document.querySelector(sel);

  const state = {
    rules: [],
    viewMode: "infographic",
    searchQuery: "",
    currentPage: 1
  };

  async function loadRules() {
    try {
      const res = await fetch("./rules.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load rules.json");
      const data = await res.json();
      state.rules = Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      state.rules = [];
    }
  }

  function getFilteredRules() {
    const q = state.searchQuery.toLowerCase().trim();
    if (!q) return state.rules;
    return state.rules.filter(r => r.toLowerCase().includes(q));
  }

  function renderInfographic() {
    const rulesPerPage = 10;
    const filtered = getFilteredRules();
    const totalPages = Math.max(1, Math.ceil(filtered.length / rulesPerPage));
    state.currentPage = Math.min(state.currentPage, totalPages);

    const start = (state.currentPage - 1) * rulesPerPage;
    const pageRules = filtered.slice(start, start + rulesPerPage);

    const cards = pageRules.map(rule => {
      const idx = state.rules.indexOf(rule);
      const color = COLORS[idx % COLORS.length];
      return `
        <article class="card">
          <div class="card-border" style="background:${color};"></div>
          <div class="rule-head">
            <div class="badge" style="background:${color};">${idx + 1}</div>
            <div class="rule-text">${rule}</div>
          </div>
        </article>
      `;
    }).join("");

    const pager = totalPages > 1 ? `
      <div class="pagination">
        <button class="btn btn-ghost" ${state.currentPage===1?"disabled":""} data-p="prev">◀</button>
        <div class="page-pill">Page ${state.currentPage} of ${totalPages}</div>
        <button class="btn btn-ghost" ${state.currentPage===totalPages?"disabled":""} data-p="next">▶</button>
      </div>
    ` : "";

    return `
      <section class="view bg-infographic">
        <div class="container">
          <div class="view-title">Shrink Prevention Rules</div>
          <div class="grid">${cards || "<div>No rules available</div>"}</div>
          ${pager}
        </div>
      </section>
    `;
  }

  function renderSticky() {
    const filtered = getFilteredRules();
    return `
      <section class="view bg-sticky">
        <div class="container sticky-wrap">
          ${filtered.map(rule => {
            const idx = state.rules.indexOf(rule);
            return `
              <div class="sticky" style="background:${STICKY_COLORS[idx % STICKY_COLORS.length]};transform:rotate(${ROTATIONS[idx % ROTATIONS.length]}deg)">
                <div class="sticky-top">Rule #${idx + 1}</div>
                <div class="sticky-text">${rule}</div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function render() {
    const main = $("#main");
    if (!main) return;
    main.innerHTML = state.viewMode === "sticky" ? renderSticky() : renderInfographic();
  }

  function boot() {
    $("#searchInput").addEventListener("input", e => {
      state.searchQuery = e.target.value;
      render();
    });

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        state.viewMode = btn.dataset.view;
        render();
      });
    });

    loadRules().then(render);
  }

  boot();
})();

