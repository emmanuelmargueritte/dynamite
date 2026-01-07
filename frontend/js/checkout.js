(async () => {
  const btn = document.getElementById("checkout-btn");
  const cartHost = document.getElementById("cart-items");
  const deliverySelect = document.getElementById("delivery-method");

  if (!btn || !cartHost || !deliverySelect) return;

  const render = () => {
    cartHost.innerHTML = "";
    const cart = Cart.get();

    if (!cart.items.length) {
      cartHost.appendChild(Ui.notice("warn", "Ton panier est vide."));
      btn.disabled = true;
      return;
    }

    btn.disabled = false;

    for (const it of cart.items) {
      const line = Ui.el("div", { class: "cartLine" }, [
        Ui.el("div", {}, [
          Ui.el("div", { class: "title" }, [it.name]),
          Ui.el("div", { class: "meta" }, [`${it.size} • ${it.color}`]),
          Ui.el("div", { class: "meta" }, [`Prix unitaire : ${Ui.xpf(it.price_xpf)}`])
        ]),
        Ui.el("div", { class: "right" }, [
          Ui.el("div", { class: "qtyRow" }, [
            Ui.el("button", { class: "qtyBtn secondary", type: "button", "aria-label": "Diminuer" }, ["−"]),
            Ui.el("span", {}, [String(it.quantity)]),
            Ui.el("button", { class: "qtyBtn secondary", type: "button", "aria-label": "Augmenter" }, ["+"])
          ]),
          Ui.el("div", { class: "price" }, [Ui.xpf(Number(it.price_xpf) * Number(it.quantity))]),
          Ui.el("button", { class: "danger", type: "button" }, ["Retirer"])
        ])
      ]);

      const decBtn = line.querySelectorAll("button")[0];
      const incBtn = line.querySelectorAll("button")[1];
      const rmBtn = line.querySelectorAll("button")[2];

      decBtn.addEventListener("click", () => { Cart.dec(it.variant_id); render(); });
      incBtn.addEventListener("click", () => { Cart.inc(it.variant_id); render(); });
      rmBtn.addEventListener("click", () => { Cart.removeItem(it.variant_id); render(); });

      cartHost.appendChild(line);
    }

    cartHost.appendChild(Ui.el("hr"));

    const subtotal = Cart.subtotalXpf();
    const method = Cart.get().delivery_method;

    cartHost.appendChild(Ui.el("div", { class: "notice ok" }, [
      `Sous-total panier : ${Ui.xpf(subtotal)}`
    ]));

    if (method === "DELIVERY") {
      cartHost.appendChild(Ui.el("div", { class: "notice warn" }, [
        "Livraison : 1 500 XPF (gratuite dès 10 000 XPF). Zone : Nouméa + Grand Nouméa."
      ]));
    } else {
      cartHost.appendChild(Ui.el("div", { class: "notice warn" }, [
        "Click & Collect : gratuit — 42 Rue Georges CLEMENCEAU. 98800"
      ]));
    }
  };

  deliverySelect.value = Cart.get().delivery_method;
  deliverySelect.addEventListener("change", () => {
    Cart.setDeliveryMethod(deliverySelect.value);
    render();
  });

  render();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Création du paiement…";

    try {
      const cart = Cart.get();
      if (!cart.items.length) throw new Error("Panier vide.");

      const payload = {
        delivery_method: cart.delivery_method,
        items: cart.items.map(i => ({ variant_id: i.variant_id, quantity: i.quantity }))
      };

      const data = await Api.request("/api/orders/checkout-session", {
        method: "POST",
        body: payload,
        csrf: true
      });

      if (!data.checkoutUrl) throw new Error("URL Stripe manquante.");
      window.location.href = data.checkoutUrl;
    } catch (e) {
      alert(e.message || "Erreur checkout.");
      btn.disabled = false;
      btn.textContent = "Passer au paiement";
    }
  });
})();
