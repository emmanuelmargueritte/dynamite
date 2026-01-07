(async () => {
  const itemsEl = document.getElementById("items");
  const totalEl = document.getElementById("total");
  const checkoutBtn = document.getElementById("checkout");
  const clearBtn = document.getElementById("clear");
  const deliverySelect = document.getElementById("delivery-method");

  // =========================
  // ✅ UI premium errors (inline banner)
  // =========================
  const ui = {
    errorBox: null,

    ensureErrorBox() {
      if (this.errorBox) return this.errorBox;

      const box = document.createElement("div");
      box.id = "checkout-error-box";
      box.setAttribute("role", "alert");
      box.setAttribute("aria-live", "polite");
      box.style.display = "none";
      box.style.margin = "12px 0";
      box.style.padding = "12px 12px";
      box.style.borderRadius = "14px";
      box.style.border = "1px solid rgba(198, 40, 40, .25)";
      box.style.background = "rgba(198, 40, 40, .06)";
      box.style.color = "#7f1d1d";
      box.style.boxShadow = "0 10px 24px rgba(16,18,35,.06)";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      row.style.gap = "10px";

      const icon = document.createElement("div");
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      `;
      icon.style.marginTop = "2px";
      icon.style.opacity = ".9";

      const content = document.createElement("div");
      content.style.flex = "1";

      const title = document.createElement("div");
      title.textContent = "Paiement impossible";
      title.style.fontWeight = "900";
      title.style.marginBottom = "2px";

      const msg = document.createElement("div");
      msg.id = "checkout-error-msg";
      msg.style.fontSize = "13px";
      msg.style.opacity = ".95";

      content.append(title, msg);

      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Fermer";
      close.className = "btn secondary";
      close.style.whiteSpace = "nowrap";
      close.addEventListener("click", () => this.hideError());

      row.append(icon, content, close);
      box.appendChild(row);

      // Insert: au-dessus de la liste items, sinon avant total
      if (itemsEl?.parentNode) {
        itemsEl.parentNode.insertBefore(box, itemsEl);
      } else if (totalEl?.parentNode) {
        totalEl.parentNode.insertBefore(box, totalEl);
      } else {
        document.body.insertBefore(box, document.body.firstChild);
      }

      this.errorBox = box;
      return box;
    },

    showError(message) {
      const box = this.ensureErrorBox();
      const msgEl = box.querySelector("#checkout-error-msg");
      if (msgEl) msgEl.textContent = message || "Une erreur est survenue.";
      box.style.display = "";
      // Scroll doux vers l'erreur si l’utilisateur est plus bas
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },

    hideError() {
      if (!this.errorBox) return;
      this.errorBox.style.display = "none";
    }
  };

  // =========================
  // API
  // =========================
  async function fetchCart() {
    const res = await fetch("/api/cart");
    return res.json();
  }

  async function updateQuantity(variantId, quantity) {
    await fetch("/api/cart/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_id: variantId, quantity })
    });
  }

  async function removeItem(variantId) {
    await fetch("/api/cart/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_id: variantId })
    });
  }

  async function clearCart() {
    await fetch("/api/cart/clear", { method: "POST" });
  }

  async function goCheckout() {
    const res = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.url) {
      // backend renvoie généralement { status, code, message }
      const msg =
        data?.message ||
        data?.error ||
        "Impossible de lancer le paiement. Réessaie dans un instant.";
      const code = data?.code ? ` (${data.code})` : "";
      throw new Error(`${msg}${code}`);
    }

    window.location.href = data.url;
  }

  // =========================
  // UI
  // =========================
  function renderCart(cart) {
    itemsEl.innerHTML = "";
    totalEl.textContent = "";

    if (!cart.items || cart.items.length === 0) {
      itemsEl.textContent = "Votre panier est vide.";
      checkoutBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }

    checkoutBtn.disabled = false;
    clearBtn.disabled = false;

    cart.items.forEach(item => {
      const row = document.createElement("div");
      row.className = "cartLine";

      // ✅ Miniature (URL déjà transformée côté backend en 140x140)
      const thumbSrc = item.image_url || "/assets/logo.svg";

      const thumb = document.createElement("img");
      thumb.src = thumbSrc;
      thumb.alt = item.name;
      thumb.className = "cart-thumb";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "10px";

      const name = document.createElement("div");
      const label = item.variant_label ? ` (${item.variant_label})` : "";
      name.textContent = `${item.name}${label}`;
      name.className = "cart-name";

      left.append(thumb, name);

      const right = document.createElement("div");
      right.className = "right";

      const qty = document.createElement("input");
      qty.type = "number";
      qty.min = "1";
      qty.value = item.quantity;

      qty.addEventListener("change", async () => {
        const q = Number(qty.value);
        if (!Number.isInteger(q) || q <= 0) return;
        ui.hideError();
        await updateQuantity(item.variant_id, q);
        await load();
      });

      const price = document.createElement("div");
      price.textContent = `${item.price_xpf * item.quantity} XPF`;

      const remove = document.createElement("button");
      remove.textContent = "Supprimer";
      remove.className = "btn secondary";

      remove.addEventListener("click", async () => {
        ui.hideError();
        await removeItem(item.variant_id);
        await load();
      });

      right.append(qty, price, remove);
      row.append(left, right);
      itemsEl.appendChild(row);
    });

    totalEl.textContent = `Total : ${cart.total_xpf} XPF`;
  }

  async function load() {
    const cart = await fetchCart();
    renderCart(cart);
window.dispatchEvent(new Event("cart:updated"));
  }

  // 🚚 Livraison (UI only)
  if (deliverySelect) {
    deliverySelect.addEventListener("change", () => {
      console.log("Delivery method:", deliverySelect.value);
    });
  }

  // 🧹 Clear
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      ui.hideError();
      await clearCart();
      await load();
    });
  }

  // 💳 Checkout
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", async () => {
      try {
        ui.hideError();

        checkoutBtn.disabled = true;
        const oldText = checkoutBtn.textContent;
        checkoutBtn.textContent = "Redirection vers le paiement…";

        const cart = await fetchCart();
        if (!cart.items || cart.items.length === 0) {
          throw new Error("Panier vide");
        }

        await goCheckout();
      } catch (err) {
        console.error("Erreur checkout", err);

        // ✅ UX premium: message inline au lieu d'un alert
        ui.showError(err?.message || "Impossible de lancer le paiement.");

        checkoutBtn.disabled = false;
        checkoutBtn.textContent = "Passer au paiement";
      }
    });
  }

  load();
})();
