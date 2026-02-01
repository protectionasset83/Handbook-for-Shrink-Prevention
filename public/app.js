/* Shrink Prevention – Read-Only Permanent Version
 * Rules loaded from rules.json (GitHub)
 * No admin, no saving, no localStorage
 */

(function () {
  "use strict";

  const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16"];
  const STICKY_COLORS = ["#FEF08A","#FBCFE8","#BFDBFE","#BBF7D0","#DDD6FE","#FED7AA"];
  const ROTATIONS = [2,-2,1,-1];

  const $ = (s) => document.querySelector(s);

  const state = {
    rules: [],
    reasonCodes: [],
    lossCodes: [],
    viewMode: "infographic",
    searchQuery: "",
    currentPage: 1,
    expandedCodeKey: null
  };

  async function loadData() {
    const res = await fetch("./rules.json", { cache: "no-store" });
    const data = await res.json();
    state.rules = Array.isArray(data.rules) ? data.rules : data;
    state.reasonCodes = data.reasonCodes || [];
    state.lossCodes = data.lossCodes || [];
  }

  function getFilteredRules() {
    const q = state.searchQuery.toLowerCase().trim();
    return q ? state.rules.filter(r => r.toLowerCase().includes(q)) : state.rules;
  }

  function renderInfographic() {
    const rules = getFilteredRules();
    return `
      <section class="view bg-infographic">
        <div class="container">
          <div class="view-title">Shrink Prevention Rules</div>
          <div class="grid">
            ${rules.map((r,i)=>`
              <article class="card">
                <div class="card-border" style="background:${COLORS[i%COLORS.length]}"></div>
                <div class="rule-head">
                  <div class="badge" style="background:${COLORS[i%COLORS.length]}">${i+1}</div>
                  <div class="rule-text">${r}</div>
                </div>
              </article>
            `).join("")}
          </div>
        </div>
      </section>`;
  }

  function renderSticky() {
    return `
      <section class="view bg-sticky">
        <div class="container">
          <div class="view-title">Shrink Prevention Rules</div>
          <div class="sticky-wrap">
            ${state.rules.map((r,i)=>`
              <div class="sticky" style="background:${STICKY_COLORS[i%STICKY_COLORS.length]};transform:rotate(${ROTATIONS[i%ROTATIONS.length]}deg)">
                <div class="sticky-top">Rule #${i+1}</div>
                <div class="sticky-text">${r}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </section>`;
  }

  function renderCodes(title, list) {
    return `
      <section class="view bg-codes">
        <div class="container">
          <div class="view-title">${title}</div>
          ${list.length ? list.map((c,i)=>`
            <div class="code-item">
              <div class="code-num">${c.number}</div>
              <div class="code-title">${c.title}</div>
              <div class="code-def">${c.definition || ""}</div>
            </div>
          `).join("") : `<div class="panel">No data available</div>`}
        </div>
      </section>`;
  }

  function render() {
    const main = $("#main");
    if (!main) return;

    if (state.viewMode === "sticky") main.innerHTML = renderSticky();
    else if (state.viewMode === "reason") main.innerHTML = renderCodes("Reason Codes", state.reasonCodes);
    else if (state.viewMode === "loss") main.innerHTML = renderCodes("Loss Codes", state.lossCodes);
    else main.innerHTML = renderInfographic();
  }

  function attach() {
    $("#menuBtn").onclick = () => {
      $("#sidebar").classList.toggle("hidden");
      $("#overlay").classList.toggle("hidden");
    };
    $("#overlay").onclick = () => {
      $("#sidebar").classList.add("hidden");
      $("#overlay").classList.add("hidden");
    };

    document.querySelectorAll(".nav-btn").forEach(b=>{
      b.onclick=()=>{
        state.viewMode=b.dataset.view;
        render();
        $("#sidebar").classList.add("hidden");
        $("#overlay").classList.add("hidden");
      };
    });

    $("#searchInput").oninput=(e)=>{
      state.searchQuery=e.target.value;
      render();
    };
  }

  async function boot() {
    await loadData();
    attach();
    render();
  }

  boot();
})();


