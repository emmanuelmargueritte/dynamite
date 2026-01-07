// frontend/js/cart-premium.js
(() => {
  function $(sel) { return document.querySelector(sel); }

  const itemsEl = $("#items");
  const totalEl = $("#total");
  const deliverySel = $("#delivery-method");
  const checkoutBtn = $("#checkout");

  if (!totalEl || !deliverySel || !checkoutBtn) return;

  // ---------
  // Résumé livraison (dans la page)
  // ---------
  const summary = document.createElement("div");
  summary.className = "cart-summary";
  summary.id = "cart-summary";

  // On l'insère après le select livraison (c'est l'endroit le plus logique)
  deliverySel.insertAdjacentElement("afterend", summary);

  // ---------
  // Sticky bar (mobile)
  // ---------
  const sticky = document.createElement("div");
  sticky.className = "cart-sticky";
  sticky.innerHTML = `
    <div class="cart-sticky-inner">
      <div class="cart-sticky-left">
        <div class="cart-sticky-total" data-sticky-total>—</div>
        <div class="cart-sticky-sub" data-sticky-sub>Mode : —</div>
      </div>
      <button type="button" class="btn cart-sticky-btn" data-sticky-checkout>Passer au paiement</button>
    </div>
  `;
  document.body.appendChild(sticky);

  const stickyTotal = sticky.querySelector("[data-sticky-total]");
  const stickySub = sticky.querySelector("[data-sticky-sub]");
  const stickyCheckout = sticky.querySelector("[data-sticky-checkout]");

  stickyCheckout.addEventListener("click", () => {
    // déclenche le checkout existant (cart.js)
    checkoutBtn.click();
  });

  function getDeliveryLabel() {
    const opt = deliverySel.options[deliverySel.selectedIndex];
    return (opt && opt.textContent) ? opt.textContent.trim() : "—";
  }

  function getTotalText() {
    const t = (totalEl.textContent || "").trim();
    return t || "Total : —";
  }

  function cartSeemsEmpty() {
    // Si #items est vide ou contient juste un message
    if (!itemsEl) return false;
    const hasLines = itemsEl.querySelector?.(".cartLine");
    if (hasLines) return false;
    const txt = (itemsEl.textContent || "").toLowerCase();
    return txt.includes("vide") || txt.trim().length === 0;
  }

  function renderSummary() {
    const delivery = getDeliveryLabel();
    const totalText = getTotalText();

    // petit wording pro
    const deliveryNote = deliverySel.value === "CLICK_COLLECT"
      ? "Retrait gratuit — prêt après confirmation."
      : "Tarif selon zone — confirmé au paiement.";

    summary.innerHTML = `
      <div class="cart-summary-grid">
        <div class="label">Mode de livraison</div>
        <div class="value">${escapeHtml(delivery)}</div>

        <div class="label">Total</div>
        <div class="value">${escapeHtml(totalText.replace(/^Total\s*:\s*/i, ""))}</div>

        <div class="muted">${escapeHtml(deliveryNote)}</div>
      </div>
    `;

    // Sticky
    stickyTotal.textContent = totalText;
    stickySub.textContent = `Mode : ${delivery}`;

    // Si panier vide → on masque le sticky (plus clean)
    const empty = cartSeemsEmpty() || !totalEl.textContent.trim();
    sticky.style.display = empty ? "none" : "";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Update on delivery change
  deliverySel.addEventListener("change", renderSummary);

  // Update when cart.js updates #total
  const obs = new MutationObserver(renderSummary);
  obs.observe(totalEl, { childList: true, subtree: true, characterData: true });

  // Also observe items (optional)
  if (itemsEl) {
    const obs2 = new MutationObserver(renderSummary);
    obs2.observe(itemsEl, { childList: true, subtree: true });
  }

  // Initial
  renderSummary();
})();
