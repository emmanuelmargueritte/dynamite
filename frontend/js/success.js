(async () => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const contentEl = document.getElementById('content');

  if (!sessionId) {
    contentEl.innerHTML = '<p class="error">Session de paiement manquante.</p>';
    return;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 🔒 CONFIRMATION STRIPE (ÉTAPE MANQUANTE)
   * On confirme le paiement côté serveur AVANT d'afficher la commande
   */
  async function confirmPayment() {
    try {
      const res = await fetch(`/api/checkout/confirm?session_id=${sessionId}`, {
        credentials: 'include'
      });

      const data = await res.json();

      if (data.status !== 'ok') {
        console.error('Payment confirmation failed:', data);
      }
    } catch (err) {
      console.error('Error confirming payment:', err);
    }
  }

  /**
   * Récupération de la commande (avec retry)
   */
  async function fetchOrderWithRetry(retries = 6) {
    for (let i = 0; i < retries; i++) {
      const res = await fetch(`/api/orders/by-session/${sessionId}`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.status === 'ok' && data.order) {
        return data.order;
      }

      await wait(500);
    }
    throw new Error('Commande introuvable après attente');
  }

  try {
    contentEl.innerHTML = '<p>Finalisation de votre commande…</p>';

    // ✅ 1️⃣ confirmer le paiement Stripe
    await confirmPayment();

    // ✅ 2️⃣ récupérer la commande maintenant qu’elle peut être "paid"
    const order = await fetchOrderWithRetry();

    const itemsHtml = order.items.map(item => {
      const variant = item.variant_label ? ` <em>(${item.variant_label})</em>` : '';
      return `
        <div class="row">
          <span class="label">
            ${item.product_name}${variant} × ${item.quantity}
          </span>
          <span class="value">
            ${item.unit_price_xpf} XPF × ${item.quantity}
            = <strong>${item.total_xpf} XPF</strong>
          </span>
        </div>
      `;
    }).join('');

    contentEl.innerHTML = `
      <div class="summary">
        <h2>Récapitulatif de votre commande</h2>
        ${itemsHtml}
        <hr />
        <div class="row">
          <span class="label">Total payé</span>
          <span class="value">
            <strong>${order.amount_xpf} XPF</strong>
          </span>
        </div>
      </div>
    `;

    // 🧹 3️⃣ vider le panier après succès confirmé
    await fetch('/api/cart/clear', {
      method: 'POST',
      credentials: 'include'
    });

  } catch (err) {
    console.error('Success page error:', err);
    contentEl.innerHTML =
      '<p class="error">Impossible de charger le récapitulatif de votre commande.</p>';
  }
})();
