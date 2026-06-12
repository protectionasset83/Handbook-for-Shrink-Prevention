(() => {
  const state = {
    knowledge: {
      rules: [],
      reasonCodes: [],
      lossCodes: []
    }
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
      .replace(/[^a-z0-9\s./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function addMessage(text, sender) {
    const div = document.createElement("div");
    div.className = `chat-msg ${sender}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function loadKnowledge() {
    const res = await fetch("./rules.json", { cache: "no-store" });
    const data = await res.json();

    state.knowledge.rules = Array.isArray(data.rules) ? data.rules : [];
    state.knowledge.reasonCodes = Array.isArray(data.reasonCodes) ? data.reasonCodes : [];
    state.knowledge.lossCodes = Array.isArray(data.lossCodes) ? data.lossCodes : [];
  }

  function findRuleIncludes(phrases) {
    const items = state.knowledge.rules || [];
    return items.filter(rule => {
      const text = normalize(rule);
      return phrases.some(p => text.includes(normalize(p)));
    });
  }

  function findReasonIncludes(phrases) {
    const items = state.knowledge.reasonCodes || [];
    return items.filter(code => {
      const text = normalize(`${code.title}. ${code.definition}`);
      return phrases.some(p => text.includes(normalize(p)));
    });
  }

  function findLossIncludes(phrases) {
    const items = state.knowledge.lossCodes || [];
    return items.filter(code => {
      const text = normalize(`${code.title}. ${code.definition}`);
      return phrases.some(p => text.includes(normalize(p)));
    });
  }

  function hasAny(text, phrases) {
    const t = normalize(text);
    return phrases.some(p => t.includes(normalize(p)));
  }

  function answerBlueSticker() {
    return `A blue sticker usually means the item was already paid online, so this should not be treated as a loss.

What you should do:
- Confirm the blue sticker belongs to that exact item.
- Check the related pickup or online order record in 3.4.
- Review pickup-area or nearby camera footage if needed.
- Match the item details before making the final decision.

Best conclusion:
If the sticker and the transaction match the item, it is already paid and not a loss.`;
  }

  function answerCantFindIn34() {
    return `If you cannot find the item in 3.4, do not mark it as loss immediately.

What you should do:
- Search again using the item number.
- If the full item number is not visible, use the number on the packaging and complete any partial number before searching.
- Check nearby registers, terminals, prior transactions, next transactions, and separate purchases.
- Check whether it was an online pickup, special order, or paid at another location.
- Use pickup stickers, pickup-area cameras, and other camera angles to confirm what happened.

Best approach:
Only mark loss after you have ruled out prior payment, pickup, or a legitimate correction.`;
  }

  function answerMissedScanNotFoundIn34() {
    return `If one item was not scanned and you cannot find it in 3.4, do not assume loss right away.

What you should do:
- Confirm the exact item first by size, type, packaging, or item number.
- Search 3.4 again using the best item number available.
- Check nearby registers, prior transactions, next transactions, and separate purchases.
- Confirm whether the item was already paid at another terminal or through pickup.
- Review video to see whether the item was actually scanned, removed, returned, or left behind.

Best approach:
Treat it as possible loss only after you have ruled out prior payment, pickup, or a legitimate correction.`;
  }

  function answerPaidOtherTerminal() {
    return `This looks more like an already-paid situation than a confirmed loss.

What you should do:
- Check whether the item was paid online or at another terminal.
- Look for a related pickup record or separate transaction.
- Match the item carefully by description, size, SKU, or sticker.
- Review nearby transactions before deciding.

Best approach:
Confirm payment first. Do not treat it as loss just because it is missing from the current transaction.`;
  }

  function answerPersonalItem() {
    return `This may be a customer-brought-in or personal-item situation, so do not assume loss yet.

What you should do:
- Review entry cameras and earlier footage.
- Confirm whether the customer already had the item before checkout.
- Compare the item carefully with store merchandise.
- Use other camera angles if the checkout view is unclear.

Best approach:
Only treat it as store loss if both the video and the transaction support that conclusion.`;
  }

  function answerBarcodeSwitch() {
    return `This could be barcode switching, but it should be confirmed carefully.

What you should do:
- Compare the scanned description with the item actually in hand.
- Check the size, type, model, and packaging.
- Confirm the barcode came from the actual sellable item.
- Review related transactions if needed.

Best approach:
Only treat it as barcode switching when the scanned item clearly does not match the actual item.`;
  }

  function answerScanIssue() {
    return `This looks like a scan issue that needs review before you decide whether there is loss.

What you should do:
- Check whether the customer tried to scan the item.
- Confirm whether the item was later added, removed, or paid in another step.
- Match the item movement in video with the transaction activity.
- Review nearby transactions if the item does not appear in the current one.

Best approach:
Confirm what happened to the item before deciding whether it is unpaid.`;
  }

  function answerGeneric() {
    return `I would not make a loss decision immediately.

What you should do:
- Confirm the exact item identity.
- Check 3.4 carefully for the current, nearby, prior, or separate transaction.
- Review camera angles to confirm whether the item was brought in, paid, picked up, removed, or left behind.
- Rule out pickup, prior payment, or legitimate correction before marking loss.

Best approach:
Use the transaction details and video together, then decide.`;
  }

  function makeAnswer(question) {
    const q = normalize(question);

    const mentionsBlueSticker = hasAny(q, ["blue sticker"]);
    const mentions34 = hasAny(q, ["3.4", "genesis 3.4"]);
    const mentionsCantFind = hasAny(q, ["can't find", "cant find", "cannot find", "not found", "nothing in 3.4", "unable to find"]);
    const mentionsMissedScan = hasAny(q, ["didn't scan", "didnt scan", "did not scan", "not scanned", "missed scan", "scan not registered"]);
    const mentionsPaid = hasAny(q, ["already paid", "prepaid", "pre paid", "paid online", "paid at another terminal", "other terminal", "pickup"]);
    const mentionsPersonal = hasAny(q, ["personal item", "brought in", "customer brought in"]);
    const mentionsBarcode = hasAny(q, ["barcode", "ticket switching", "wrong barcode"]);
    const mentionsScanIssue = hasAny(q, ["failed to scan", "scan issue", "didn't scan", "did not scan", "not scanned"]);

    if (mentionsBlueSticker) {
      return answerBlueSticker();
    }

    if (mentions34 && mentionsCantFind && mentionsMissedScan) {
      return answerMissedScanNotFoundIn34();
    }

    if (mentions34 && mentionsCantFind) {
      return answerCantFindIn34();
    }

    if (mentionsPaid) {
      return answerPaidOtherTerminal();
    }

    if (mentionsPersonal) {
      return answerPersonalItem();
    }

    if (mentionsBarcode) {
      return answerBarcodeSwitch();
    }

    if (mentionsScanIssue) {
      return answerScanIssue();
    }

    const paidRules = findRuleIncludes(["already paid", "paid at a different register", "paid at another terminal", "completed online", "pickup"]);
    if (paidRules.length) {
      return answerPaidOtherTerminal();
    }

    const personalRules = findRuleIncludes(["brought into the store", "personal item", "brought in"]);
    if (personalRules.length) {
      return answerPersonalItem();
    }

    return answerGeneric();
  }

  async function handleAsk(question) {
    addMessage(question, "user");
    const answer = makeAnswer(question);
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
