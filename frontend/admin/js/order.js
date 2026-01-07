(async () => {
  const itemsTbody = document.getElementById('orderItems');
  const meta = document.getElementById('orderMeta');
  const bar = document.getElementById('orderCopyBar');

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  const fallbackImg = '/assets/logo.svg';

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function ensureToast() {
    let el = document.getElementById('toast');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'toast';
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.bottom = '24px';
    el.style.transform = 'translateX(-50%)';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(0,0,0,0.85)';
    el.style.color = '#fff';
    el.style.fontSize = '13px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.transition = 'opacity 160ms ease';
    el.style.zIndex = '9999';
    document.body.appendChild(el);
    return el;
  }

  function toast(msg) {
    const el = ensureToast();
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.style.opacity = '0'), 900);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copié ✅');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Copié ✅');
    }
  }

  if (!id) {
    meta.textContent = 'ID commande manquant.';
    itemsTbody.innerHTML = `<tr><td colspan="5" class="error">Commande introuvable</td></tr>`;
    return;
  }

  try {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Erreur chargement commande');

    const data = await res.json();
    const order = data.order;
    const items = data.items || [];

    meta.textContent =
      `Commande #${order.id} — ${order.amount_xpf} XPF — ${(order.status || '').toUpperCase()} — ` +
      `${new Date(order.created_at).toLocaleString('fr-FR')}`;

    // barre copy
    if (bar) {
      bar.innerHTML = `
        <button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.id)}">Copier Order ID</button>
        ${order.session_id ? `<button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.session_id)}">Copier Session ID</button>` : ''}
        ${order.stripe_session_id ? `<button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.stripe_session_id)}">Copier Stripe Session</button>` : ''}
        ${order.stripe_payment_intent_id ? `<button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.stripe_payment_intent_id)}">Copier Payment Intent</button>` : ''}
      `;

      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-copy]');
        if (!btn) return;
        copyText(String(btn.getAttribute('data-copy')));
      });
    }

    itemsTbody.innerHTML = '';

    if (!items.length) {
      itemsTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucun article</td></tr>`;
      return;
    }

    for (const it of items) {
      const tr = document.createElement('tr');
      const imgSrc = it.image_url || fallbackImg;

      tr.innerHTML = `
        <td>
          <img
            src="${escapeHtml(imgSrc)}"
            alt="${escapeHtml(it.product_name || 'Produit')}"
            style="width:50px;height:50px;object-fit:cover;border-radius:8px;"
            onerror="this.src='${fallbackImg}'"
          />
        </td>
        <td>${escapeHtml(it.product_name || '—')}</td>
        <td>${escapeHtml(it.quantity)}</td>
        <td>${escapeHtml(it.unit_price_xpf)} XPF</td>
        <td>${escapeHtml(it.total_xpf)} XPF</td>
      `;

      itemsTbody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    meta.textContent = 'Erreur lors du chargement.';
    itemsTbody.innerHTML = `<tr><td colspan="5" class="error">Erreur chargement commande</td></tr>`;
  }
})();
