(() => {
  console.log("chatbot-v4 loaded");

  const state = {
    knowledge: [],
    lastQuestion: "",
    lastAnswer: "",
    lastMatches: [],
    feedbackGiven: false
  };

  const chatToggle = document.getElementById("chatToggle");
  const chatPanel = document.getElementById("chatPanel");
  const chatClose = document.getElementById("chatClose");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");
  const chatFeedback = document.getElementById("chatFeedback");
  const thumbsUpBtn = document.getElementById("thumbsUpBtn");
  const thumbsDownBtn = document.getElementById("thumbsDownBtn");

  const GLOSSARY = {
    "loss": "Loss means unpaid sellable merchandise that should have been paid for but was not properly included in the completed transaction.",
    "sku": "SKU means Stock Keeping Unit. It is an identifier used to distinguish a specific product or product variant.",
    "3.4": "3.4 refers to Genesis 3.4, which is used to search transaction history and verify whether an item was paid for.",
    "genesis 3.4": "Genesis 3.4 is used to search transaction history and verify whether an item was paid for."
  };

  const FALLBACK = `I could not find a confirmed handbook answer for this question.
Please do not rely on this response alone for a final loss decision.
Kindly request that this scenario be added to the handbook if needed.`;

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text).split(" ").filter(Boolean);
  }

  function addMessage(text, sender) {
    const div = document.createElement("div");
    div.className = `chat-msg ${sender}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function resetFeedbackUI() {
    state.feedbackGiven = false;
    if (chatFeedback) chatFeedback.classList.add("hidden");
    if (thumbsUpBtn) thumbsUpBtn.classList.remove("active");
    if (thumbsDownBtn) thumbsDownBtn.classList.remove("active");
  }

  function showFeedbackUI() {
    if (chatFeedback) chatFeedback.classList.remove("hidden");
  }

  function saveFeedback(type) {
    if (!state.lastQuestion || !state.lastAnswer || state.feedbackGiven) return;

    const existing = JSON.parse(localStorage.getItem("handbookChatFeedback") || "[]");
    existing.push({
      question: state.lastQuestion,
      answer: state.lastAnswer,
      feedback: type,
      matches: state.lastMatches,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem("handbookChatFeedback", JSON.stringify(existing));

    state.feedbackGiven = true;

    if (type === "up") {
      thumbsUpBtn?.classList.add("active");
      thumbsDownBtn?.classList.remove("active");
      addMessage("Thanks — I’ll treat that as a useful answer pattern.", "bot");
    } else {
      thumbsDownBtn?.classList.add("active");
      thumbsUpBtn?.classList.remove("active");
      addMessage("Thanks — please consider adding this scenario to the handbook if it should be covered.", "bot");
    }
  }

  async function loadKnowledge() {
    const res = await fetch("./rules.json", { cache: "no-store" });
    const data = await res.json();

    const rules = (data.rules || []).map((text, index) => ({
      type: "rule",
      label: `Rule ${index + 1}`,
      text
    }));

    const reasonCodes = (data.reasonCodes || []).map(code => ({
      type: "reason",
      label: code.title,
      text: `${code.title}. ${code.definition}`
    }));

    const lossCodes = (data.lossCodes || []).map(code => ({
      type: "loss",
      label: code.title,
      text: `${code.title}. ${code.definition}`
    }));

    state.knowledge = [...rules, ...reasonCodes, ...lossCodes];
  }

  function getQuestionType(question) {
    const q = normalize(question);

    if (
      q.startsWith("what is") ||
      q.startsWith("what are") ||
      q.startsWith("define") ||
      q.includes("meaning of")
    ) {
      return "definition";
    }

    if (
      q.includes("what to do") ||
      q.startsWith("how to") ||
      q.startsWith("how do i") ||
      q.includes("what should i do")
    ) {
      return "action";
    }

    if (
      q.includes("is it loss") ||
      q.includes("already paid") ||
      q.includes("paid or") ||
      q.includes("without paying")
    ) {
      return "decision";
    }

    return "general";
  }

  function expandTokens(tokens) {
    const extra = [];

    for (const t of tokens) {
      if (t === "sticler" || t === "stiker" || t === "stickr") extra.push("sticker");
      if (t === "recall") extra.push("suspended");
      if (t === "suspended") extra.push("recall");
      if (t === "pickup") extra.push("online");
      if (t === "scrap") extra.push("non-sellable");
      if (t === "sellable") extra.push("merchandise");
    }

    return [...new Set([...tokens, ...extra])];
  }

  function scoreItem(question, item) {
    const qTokens = expandTokens(tokenize(question));
    const text = normalize(item.text);
    const q = normalize(question);

    let score = 0;

    for (const token of qTokens) {
      if (token.length >= 3 && text.includes(token)) score += 2;
    }

    if (q.includes("blue sticker") && text.includes("blue sticker")) score += 15;
    if (q.includes("recall") && text.includes("recall")) score += 12;
    if (q.includes("suspended") && text.includes("suspended")) score += 12;
    if (q.includes("3.4") && text.includes("3.4")) score += 8;
    if (q.includes("scrap") && text.includes("sellable merchandise")) score += 6;
    if (q.includes("non sellable") && text.includes("sellable merchandise")) score += 6;

    return score;
  }

  function findBestMatches(question, limit = 3) {
    return state.knowledge
      .map(item => ({ ...item, score: scoreItem(question, item) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function getGlossaryAnswer(question) {
    const q = normalize(question);

    if (q === "what is loss" || q === "loss" || q.includes("what is loss")) {
      return GLOSSARY["loss"];
    }

    if (q === "what is sku" || q === "sku" || q.includes("what is sku")) {
      return GLOSSARY["sku"];
    }

    if (q === "what is 3.4" || q.includes("what is 3.4") || q.includes("what is genesis 3.4")) {
      return GLOSSARY["3.4"];
    }

    return null;
  }

  function buildAnswer(question, matches) {
    const qType = getQuestionType(question);
    const q = normalize(question);

    const glossaryAnswer = getGlossaryAnswer(question);
    if (glossaryAnswer) {
      return glossaryAnswer;
    }

    if (!matches.length || matches[0].score < 6) {
      return FALLBACK;
    }

    if (q.includes("blue sticker")) {
      return `A blue sticker usually means the item was already paid online, so it should not be treated as a loss.

What you should do:
- Confirm the sticker belongs to that exact item.
- Check the related pickup or online order record in 3.4.
- Match the item details before making the final decision.

Best conclusion:
If the sticker and the transaction match the item, it is already paid and not a loss.`;
    }

    if (q.includes("recall") || q.includes("suspended")) {
      if (qType === "definition") {
        return `Recall or suspended transaction means the item was already bagged or part of a suspended transaction.

Best approach:
Review what the camera shows when the transaction is recalled and completed, and judge the item based on that point in the transaction.`;
      }

      return `For a recall or suspended transaction, review what the camera shows when the transaction is recalled and completed.

What you should do:
- Confirm the item was part of the suspended or recalled transaction.
- Check whether it was already bagged.
- Review the transaction completion point carefully before deciding there is loss.

Best approach:
Do not treat it as loss just because the item appears before recall. Judge it based on what happens when the transaction is resumed and completed.`;
    }

    if (q.includes("scrap") || q.includes("non sellable") || q.includes("sellable lumber")) {
      return `First confirm whether the item is actually sellable merchandise.

What you should do:
- Check whether it is scrap wood, damaged cut-off material, or other non-sellable leftover material.
- Confirm whether it is a normal sellable lumber product or just unusable scrap.
- Review the item appearance and surrounding context before calling it loss.

Best approach:
If it is scrap or non-sellable material, it should not be treated as sellable loss.`;
    }

    if (qType === "definition") {
      if (matches[0].score < 8) return FALLBACK;
      return `Based on the handbook, this means:

${matches[0].text}`;
    }

    if (qType === "action") {
      return `Based on the handbook, here is the best next step:

- ${matches.map(m => m.text).join("\n- ")}

Best approach:
Use the camera view and transaction details together before deciding whether there is loss.`;
    }

    if (qType === "decision") {
      return `Based on the handbook, this should be decided by checking the most relevant transaction and video evidence first.

Most relevant guidance:
- ${matches.map(m => m.text).join("\n- ")}

Best approach:
Only decide loss after ruling out payment, pickup, prior transaction, or legitimate correction.`;
    }

    if (matches[0].score < 8) {
      return FALLBACK;
    }

    return `Here is the most relevant handbook guidance for your question:

- ${matches.map(m => m.text).join("\n- ")}

Best approach:
Use the strongest matching handbook rule together with the transaction and camera review.`;
  }

  async function handleAsk(question) {
    resetFeedbackUI();
    addMessage(question, "user");

    const matches = findBestMatches(question, 3);
    const answer = buildAnswer(question, matches);

    state.lastQuestion = question;
    state.lastAnswer = answer;
    state.lastMatches = matches.map(m => ({
      label: m.label,
      text: m.text,
      score: m.score
    }));

    addMessage(answer, "bot");
    showFeedbackUI();
  }

  thumbsUpBtn?.addEventListener("click", () => saveFeedback("up"));
  thumbsDownBtn?.addEventListener("click", () => saveFeedback("down"));

  if (chatToggle) {
    chatToggle.addEventListener("click", () => {
      chatPanel.classList.remove("hidden");
      if (chatInput) chatInput.focus();
    });
  }

  if (chatClose) {
    chatClose.addEventListener("click", () => {
      chatPanel.classList.add("hidden");
    });
  }

  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const question = (chatInput?.value || "").trim();
      if (!question) return;

      chatInput.value = "";
      await handleAsk(question);
    });
  }

  loadKnowledge().then(() => {
    console.log("chatbot-v6 knowledge loaded");
  }).catch(() => {
    addMessage(
      "I could not load the handbook rules. Please make sure rules.json is in the same folder as index.html.",
      "bot"
    );
  });
})();
