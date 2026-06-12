(() => {
  const state = {
    knowledge: []
  };

  const STOP_WORDS = new Set([
    "the", "a", "an", "is", "it", "to", "of", "on", "in", "for", "and",
    "or", "are", "was", "were", "be", "by", "with", "this", "that", "there",
    "what", "which", "when", "where", "how", "do", "does", "did", "can",
    "could", "should", "would", "i", "me", "my", "you", "your", "we", "our",
    "customer", "product", "item"
  ]);

  const chatToggle = document.getElementById("chatToggle");
  const chatPanel = document.getElementById("chatPanel");
  const chatClose = document.getElementById("chatClose");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s/-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text)
      .split(" ")
      .filter(Boolean)
      .filter(token => !STOP_WORDS.has(token));
  }

  function addMessage(text, sender) {
    const div = document.createElement("div");
    div.className = `chat-msg ${sender}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function buildKnowledge(data) {
    const rules = (data.rules || []).map((text, index) => ({
      type: "rule",
      id: `rule-${index + 1}`,
      text
    }));

    const reasonCodes = (data.reasonCodes || []).map(code => ({
      type: "reason",
      id: `reason-${code.number}`,
      text: `${code.title}. ${code.definition}`
    }));

    const lossCodes = (data.lossCodes || []).map(code => ({
      type: "loss",
      id: `loss-${code.number}`,
      text: `${code.title}. ${code.definition}`
    }));

    return [...rules, ...reasonCodes, ...lossCodes];
  }

  async function loadKnowledge() {
    const res = await fetch("./rules.json", { cache: "no-store" });
    const data = await res.json();
    state.knowledge = buildKnowledge(data);
  }

  function getQueryConcepts(query) {
    const q = normalize(query);

    return {
      hasBlueSticker: q.includes("blue sticker"),
      hasSticker: q.includes("sticker") || q.includes("label"),
      cantFindIn34:
        q.includes("3.4") &&
        (
          q.includes("cant find") ||
          q.includes("can't find") ||
          q.includes("cannot find") ||
          q.includes("not find") ||
          q.includes("not able to find") ||
          q.includes("unable to find")
        ),
      asksPaid:
        q.includes("paid") ||
        q.includes("pre paid") ||
        q.includes("prepaid") ||
        q.includes("already paid"),
      asksLoss:
        q.includes("loss") ||
        q.includes("without paying") ||
        q.includes("unpaid") ||
        q.includes("taking the product"),
      asksPersonalItem:
        q.includes("brought in") ||
        q.includes("personal item") ||
        q.includes("customer brought"),
      asksPickup:
        q.includes("pickup") ||
        q.includes("online order") ||
        q.includes("online pickup"),
      asksBarcodeSwitch:
        q.includes("barcode") ||
        q.includes("ticket switching") ||
        q.includes("wrong barcode"),
      asksScanFailure:
        q.includes("failed to scan") ||
        q.includes("not scanned") ||
        q.includes("scan did not register") ||
        q.includes("didn't scan") ||
        q.includes("did not scan")
    };
  }

  function scoreItem(query, item) {
    const q = normalize(query);
    const text = normalize(item.text);
    const tokens = tokenize(query);

    let score = 0;

    for (const token of tokens) {
      if (text.includes(token)) score += 2;
    }

    if (q.includes("3.4") && text.includes("3.4")) score += 8;
    if (q.includes("blue sticker") && text.includes("blue sticker")) score += 20;
    if (q.includes("pickup") && text.includes("pickup")) score += 8;
    if (q.includes("online") && text.includes("online")) score += 8;
    if ((q.includes("paid") || q.includes("already paid")) && text.includes("paid")) score += 8;
    if (q.includes("brought in") && text.includes("brought in")) score += 8;
    if (q.includes("personal item") && text.includes("personal item")) score += 8;
    if (q.includes("barcode") && text.includes("barcode")) score += 8;
    if (q.includes("scan") && text.includes("scan")) score += 5;
    if (q.includes("loss") && text.includes("loss")) score += 4;

    return score;
  }

  function findMatches(query, limit = 6) {
    return state.knowledge
      .map(item => ({ ...item, score: scoreItem(query, item) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function answerBlueSticker() {
    return `A blue sticker usually means the item was already paid online, so it should not be treated as a loss.

What you should do:
- Confirm the sticker belongs to that exact item.
- Check the pickup or online order record in 3.4.
- Review pickup-area or nearby camera footage if needed.
- Match the item details before making a final decision.

Best conclusion:
If the blue sticker and transaction match the item, it is already paid and not a loss.`;
  }

  function answerCantFindIn34() {
    return `If you cannot find the product in 3.4, do not mark it as loss immediately.

Try these steps:
- Search again using the correct item number.
- If the full number is not visible, use the number on the packaging and complete any partial number before searching.
- Check nearby registers, terminals, specialty desks, and separate purchases.
- Review prior and next transactions in case it was paid in a different transaction.
- Check whether it was an online pickup, special order, or fulfillment-assisted pickup.
- Use pickup stickers, pickup-area cameras, and other camera angles to confirm what happened.

Best approach:
Only mark loss after you have ruled out prior payment, pickup, or a legitimate correction.`;
  }

  function answerPaidScenario() {
    return `This looks more like an already-paid situation than a confirmed loss.

What to check:
- Whether the item was paid online or at another terminal.
- Whether there is a related pickup record or separate transaction.
- Whether the item description, size, SKU, or sticker matches the item in hand.
- Whether nearby transactions explain the item.

Best approach:
Confirm payment first, then decide. Do not assume loss just because the item is not obvious in the current transaction.`;
  }

  function answerPersonalItemScenario() {
    return `This may be a customer-brought-in or personal-item situation, so do not assume loss yet.

What to check:
- Review entry cameras and earlier footage.
- Confirm whether the customer already had the item before checkout.
- Compare the item carefully to store merchandise.
- Use other camera angles if the checkout view is unclear.

Best approach:
Only treat it as store loss if the video and transaction both support that conclusion.`;
  }

  function answerBarcodeScenario() {
    return `This could be a barcode-switching situation, but it should be confirmed carefully.

What to check:
- Compare the scanned description with the item actually in hand.
- Check the size, type, model, and packaging.
- Confirm the barcode came from sellable merchandise and not from another label or card.
- Review related transactions if the same payment method appears elsewhere.

Best approach:
Only treat it as barcode switching when the scanned item clearly does not match the actual item.`;
  }

  function answerScanFailureScenario() {
    return `This looks like a possible scan issue rather than something you should label immediately as loss.

What to check:
- Whether the customer attempted to scan the item.
- Whether the register was in payment mode or showing a prompt.
- Whether the item was later added, removed, or paid through another step.
- Whether the scan behavior matches the item being handled at that moment.

Best approach:
Match the scan attempt to the register screen and transaction details before deciding what happened.`;
  }

  function answerGeneric(matches) {
    if (!matches.length) {
      return `I could not find a clear handbook match for that question.

Try asking with more detail such as:
- sticker color
- item type
- whether it may be already paid
- whether it may be a pickup
- whether there was a scan issue or barcode issue`;
    }

    const combined = matches.map(m => normalize(m.text)).join(" ");

    if (
      combined.includes("already paid") ||
      combined.includes("paid at another terminal") ||
      combined.includes("paid at a different register") ||
      combined.includes("online")
    ) {
      return answerPaidScenario();
    }

    if (
      combined.includes("brought in") ||
      combined.includes("personal item") ||
      combined.includes("non merchandise")
    ) {
      return answerPersonalItemScenario();
    }

    if (
      combined.includes("barcode") ||
      combined.includes("ticket switching") ||
      combined.includes("scan substitution")
    ) {
      return answerBarcodeScenario();
    }

    if (
      combined.includes("failed to scan") ||
      combined.includes("pay screen") ||
      combined.includes("invalid upc") ||
      combined.includes("prompt")
    ) {
      return answerScanFailureScenario();
    }

    return `Based on the handbook, the safest next step is to verify payment, item identity, and surrounding transactions before marking loss.

Focus on:
- matching the exact item
- checking nearby or prior transactions
- reviewing camera angles
- ruling out online pickup, prior payment, or legitimate correction`;
  }

  function makeAnswer(query, matches) {
    const concepts = getQueryConcepts(query);

    if (concepts.hasBlueSticker) return answerBlueSticker();
    if (concepts.cantFindIn34) return answerCantFindIn34();
    if (concepts.asksPersonalItem) return answerPersonalItemScenario();
    if (concepts.asksBarcodeSwitch) return answerBarcodeScenario();
    if (concepts.asksScanFailure) return answerScanFailureScenario();
    if (concepts.asksPaid || concepts.asksPickup || concepts.asksLoss) return answerPaidScenario();

    return answerGeneric(matches);
  }

  async function handleAsk(question) {
    addMessage(question, "user");

    const matches = findMatches(question, 6);
    const answer = makeAnswer(question, matches);

    addMessage(answer, "bot");
  }

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

  loadKnowledge().catch(() => {
    addMessage(
      "I could not load the handbook rules. Please make sure rules.json is in the same folder as index.html.",
      "bot"
    );
  });
})();
