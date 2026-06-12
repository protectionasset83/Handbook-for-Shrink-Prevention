(() => {
  const state = {
    knowledge: []
  };

  const STOP_WORDS = new Set([
    "the", "a", "an", "is", "it", "to", "of", "on", "in", "for", "and",
    "or", "are", "was", "were", "be", "by", "with", "this", "that", "there",
    "customer", "product", "item"
  ]);

  const SYNONYMS = {
    paid: ["paid", "already paid", "prepaid", "pre paid", "completed online"],
    unpaid: ["unpaid", "without paying", "not paid", "loss", "shrink"],
    online: ["online", "pickup", "other terminal"],
    sticker: ["sticker", "label", "pickup sticker"],
    blue: ["blue", "blue sticker"]
  };

  const chatToggle = document.getElementById("chatToggle");
  const chatPanel = document.getElementById("chatPanel");
  const chatClose = document.getElementById("chatClose");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text)
      .split(" ")
      .filter(Boolean)
      .filter(token => !STOP_WORDS.has(token));
  }

  function expandQuery(query) {
    const q = normalize(query);
    const tokens = new Set(tokenize(query));

    for (const token of [...tokens]) {
      if (SYNONYMS[token]) {
        SYNONYMS[token].forEach(v => tokens.add(v));
      }
    }

    if (q.includes("blue sticker")) {
      tokens.add("blue sticker");
      tokens.add("completed online");
      tokens.add("already paid");
      tokens.add("paid");
      tokens.add("online");
      tokens.add("not a loss");
    }

    if (q.includes("without paying") || q.includes("taking the product")) {
      tokens.add("unpaid");
      tokens.add("loss");
    }

    return [...tokens];
  }

  function buildKnowledge(data) {
    const rules = (data.rules || []).map((text, index) => ({
      type: "rule",
      source: `Rule ${index + 1}`,
      text
    }));

    const reasonCodes = (data.reasonCodes || []).map(code => ({
      type: "reason",
      source: `Reason Code ${code.number}: ${code.title}`,
      text: `${code.title}. ${code.definition}`
    }));

    const lossCodes = (data.lossCodes || []).map(code => ({
      type: "loss",
      source: `Loss Code ${code.number}: ${code.title}`,
      text: `${code.title}. ${code.definition}`
    }));

    return [...rules, ...reasonCodes, ...lossCodes];
  }

  async function loadKnowledge() {
    const res = await fetch("./rules.json", { cache: "no-store" });
    const data = await res.json();
    state.knowledge = buildKnowledge(data);
  }

  function scoreItem(query, item) {
    const q = normalize(query);
    const text = normalize(item.text);
    const expanded = expandQuery(query);

    let score = 0;

    for (const token of expanded) {
      if (text.includes(token)) {
        score += token.includes(" ") ? 6 : 2;
      }
    }

    if (q.includes("blue sticker") && text.includes("blue sticker")) score += 20;
    if ((q.includes("paid") || q.includes("loss") || q.includes("without paying")) &&
        (text.includes("already paid") || text.includes("completed online"))) {
      score += 12;
    }

    return score;
  }

  function findMatches(query, limit = 3) {
    return state.knowledge
      .map(item => ({ ...item, score: scoreItem(query, item) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function makeAnswer(query, matches) {
    const q = normalize(query);

    if (q.includes("blue sticker")) {
      return {
        answer: "Blue sticker means the item is already paid, so it is not a loss.",
        support: matches
      };
    }

    if (!matches.length) {
      return {
        answer: "I could not find a clear matching rule in this handbook. Try using words from the rule or add a new rule for this scenario.",
        support: []
      };
    }

    const topText = normalize(matches[0].text);

    if (topText.includes("already paid") || topText.includes("completed online")) {
      return {
        answer: "Based on the handbook, this item appears to be already paid, so it should not be treated as a loss.",
        support: matches
      };
    }

    if (topText.includes("personal item") || topText.includes("not a product")) {
      return {
        answer: "Based on the handbook, this looks like a personal or non-merchandise item and should not be treated as store loss.",
        support: matches
      };
    }

    return {
      answer: matches[0].text,
      support: matches
    };
  }

  function addMessage(text, sender, support = []) {
    const div = document.createElement("div");
    div.className = `chat-msg ${sender}`;
    div.textContent = text;

    if (sender === "bot" && support.length) {
      const supportDiv = document.createElement("div");
      supportDiv.className = "chat-support";
      supportDiv.innerHTML =
        "<strong>Matched handbook guidance:</strong><br>" +
        support.map(s => `• ${s.source}: ${s.text}`).join("<br>");
      div.appendChild(supportDiv);
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function handleAsk(question) {
    addMessage(question, "user");

    const matches = findMatches(question);
    const result = makeAnswer(question, matches);

    addMessage(result.answer, "bot", result.support);
  }

  chatToggle.addEventListener("click", () => {
    chatPanel.classList.remove("hidden");
    chatInput.focus();
  });

  chatClose.addEventListener("click", () => {
    chatPanel.classList.add("hidden");
  });

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = chatInput.value.trim();
    if (!question) return;

    chatInput.value = "";
    await handleAsk(question);
  });

  loadKnowledge().catch(() => {
    addMessage("I could not load the handbook rules. Make sure rules.json is in the same folder as index.html.", "bot");
  });
})();
