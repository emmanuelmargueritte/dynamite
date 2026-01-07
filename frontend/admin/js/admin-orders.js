(() => {
  const tbody = document.getElementById('orders');
  const statusFilter = document.getElementById('statusFilter');
  const qInput = document.getElementById('q');
  const suggestList = document.getElementById('qSuggestions');

  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  const exportBtn = document.getElementById('exportCsv');

  const sortDateInd = document.getElementById('sortDate');
  const sortAmountInd = document.getElementById('sortAmount');

  // Preview modal elements
  const previewOverlay = document.getElementById('previewOverlay');
  const previewPanel = document.getElementById('previewPanel');
  const previewClose = document.getElementById('previewClose');
  const previewMeta = document.getElementById('previewMeta');
  const previewItems = document.getElementById('previewItems');
  const previewActions = document.getElementById('previewActions');

  if (!tbody) return;

  const LIMIT = 50;
  const fallbackImg = '/assets/logo.svg';

  // State
  let offset = 0;
  let sort = 'created_at';
  let dir = 'desc';
  let q = '';
  let status = '';

  // timers
  let searchTimer = null;
  let suggestTimer = null;

  // cache preview details
  const detailCache = new Map(); // orderId -> {order, items}

  // ---------- utils ----------
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

  function setLoading() {
    tbody.innerHTML = `<tr><td colspan="6">Chargement…</td></tr>`;
  }

  function renderEmpty() {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Aucune commande trouvée.</td></tr>`;
  }

  function renderError() {
    tbody.innerHTML = `<tr><td colspan="6" class="error">Erreur lors du chargement des commandes.</td></tr>`;
  }

  // ---------- URL sync ----------
  function readFromUrl() {
    const u = new URL(window.location.href);
    offset = Math.max(parseInt(u.searchParams.get('offset') || '0', 10), 0);
    sort = u.searchParams.get('sort') || 'created_at';
    dir = (u.searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    q = u.searchParams.get('q') || '';
    status = u.searchParams.get('status') || '';
  }

  function writeToUrl() {
    const u = new URL(window.location.href);
    u.searchParams.set('limit', String(LIMIT));
    u.searchParams.set('offset', String(offset));
    u.searchParams.set('sort', sort);
    u.searchParams.set('dir', dir);

    if (q) u.searchParams.set('q', q);
    else u.searchParams.delete('q');

    if (status) u.searchParams.set('status', status);
    else u.searchParams.delete('status');

    history.replaceState({}, '', u.toString());
  }

  function syncControls() {
    if (qInput) qInput.value = q;
    if (statusFilter) statusFilter.value = status;

    const reset = (el) => { if (el) el.textContent = '↕'; };
    reset(sortDateInd);
    reset(sortAmountInd);

    const arrow = dir === 'asc' ? '↑' : '↓';
    if (sort === 'created_at' && sortDateInd) sortDateInd.textContent = arrow;
    if (sort === 'amount_xpf' && sortAmountInd) sortAmountInd.textContent = arrow;
  }

  // ---------- recent searches ----------
  function getRecentSearches() {
    try {
      return JSON.parse(localStorage.getItem('admin_orders_recent_q') || '[]');
    } catch {
      return [];
    }
  }

  function saveRecentSearch(term) {
    if (!term) return;
    const list = getRecentSearches().filter(x => x !== term);
    list.unshift(term);
    localStorage.setItem('admin_orders_recent_q', JSON.stringify(list.slice(0, 8)));
  }

  function renderSuggestions(items) {
    if (!suggestList) return;
    suggestList.innerHTML = '';
    items.slice(0, 8).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      suggestList.appendChild(opt);
    });
  }

  async function fetchSuggestions(term) {
    if (!suggestList) return;

    const recent = getRecentSearches().filter(x =>
      x.toLowerCase().includes((term || '').toLowerCase())
    );
    renderSuggestions(recent);

    if (!term || term.length < 2) return;

    try {
      const res = await fetch(`/api/admin/orders/suggest?q=${encodeURIComponent(term)}`, {
        credentials: 'include'
      });
      if (!res.ok) return;

      const data = await res.json();
      const api = Array.isArray(data.suggestions) ? data.suggestions : [];

      const merged = [...recent, ...api].filter((v, i, a) => a.indexOf(v) === i);
      renderSuggestions(merged);
    } catch {
      // ignore
    }
  }

  // ---------- preview modal ----------
  function openPreview() {
    previewOverlay?.classList.remove('hidden');
    previewPanel?.classList.remove('hidden');
    previewOverlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closePreview() {
    previewOverlay?.classList.add('hidden');
    previewPanel?.classList.add('hidden');
    previewOverlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function loadOrderDetail(orderId) {
    const id = String(orderId);

    if (detailCache.has(id)) return detailCache.get(id);

    const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Erreur chargement détail');

    const data = await res.json();
    detailCache.set(id, data);
    return data;
  }

  async function showPreview(orderId) {
    openPreview();

    if (previewMeta) previewMeta.textContent = 'Chargement…';
    if (previewItems) previewItems.innerHTML = `<tr><td colspan="5">Chargement…</td></tr>`;
    if (previewActions) previewActions.innerHTML = '';

    try {
      const data = await loadOrderDetail(orderId);
      const order = data.order;
      const items = data.items || [];

      if (previewMeta) {
        previewMeta.textContent =
          `Commande #${order.id} — ${order.amount_xpf} XPF — ${(order.status || '').toUpperCase()} — ` +
          `${new Date(order.created_at).toLocaleString('fr-FR')}`;
      }

      if (previewActions) {
        previewActions.innerHTML = `
          <button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.id)}">Copier Order ID</button>
          ${order.session_id ? `<button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.session_id)}">Copier Session ID</button>` : ''}
          ${order.stripe_session_id ? `<button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.stripe_session_id)}">Copier Stripe Session</button>` : ''}
          ${order.stripe_payment_intent_id ? `<button type="button" class="admin-link btn-link" data-copy="${escapeHtml(order.stripe_payment_intent_id)}">Copier Payment Intent</button>` : ''}
          <a class="admin-link" href="/admin/order.html?id=${encodeURIComponent(order.id)}">Ouvrir la page</a>
        `;
      }

      if (!items.length) {
        previewItems.innerHTML = `<tr><td colspan="5" class="muted">Aucun article</td></tr>`;
        return;
      }

      previewItems.innerHTML = '';
      for (const it of items) {
        const imgSrc = it.image_url || fallbackImg;

        const tr = document.createElement('tr');
        tr.innerHTML = `
  <td>
    <img
      src="${escapeHtml(imgSrc)}"
      alt="${escapeHtml(it.product_name || 'Produit')}"
      class="preview-thumb"
    />
  </td>
  <td>${escapeHtml(it.product_name || '—')}</td>
  <td>${escapeHtml(it.quantity)}</td>
  <td>${escapeHtml(it.unit_price_xpf)} XPF</td>
  <td>${escapeHtml(it.total_xpf)} XPF</td>
`;

const imgEl = tr.querySelector('img.preview-thumb');
if (imgEl) {
  imgEl.addEventListener('error', () => {
    imgEl.src = fallbackImg;
  }, { once: true });
}

previewItems.appendChild(tr);

      }
    } catch (e) {
      console.error(e);
      if (previewMeta) previewMeta.textContent = 'Erreur chargement aperçu.';
      if (previewItems) previewItems.innerHTML = `<tr><td colspan="5" class="error">Erreur chargement</td></tr>`;
    }
  }

  // close handlers
  previewClose?.addEventListener('click', closePreview);
  previewOverlay?.addEventListener('click', closePreview);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !previewPanel?.classList.contains('hidden')) {
      closePreview();
    }
  });

  // copy inside preview
  previewPanel?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    copyText(String(btn.getAttribute('data-copy')));
  });

  // ---------- main load ----------
  async function load() {
    try {
      setLoading();

      const qs = new URLSearchParams();
      qs.set('limit', String(LIMIT));
      qs.set('offset', String(offset));
      qs.set('sort', sort);
      qs.set('dir', dir);
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);

      writeToUrl();
      syncControls();

      const res = await fetch(`/api/admin/orders?${qs.toString()}`, {
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Load orders failed');

      const data = await res.json();
      const orders = data.orders || [];
      const meta = data.meta || {};
      const hasMore = !!meta.has_more;

      saveRecentSearch(q);

      tbody.innerHTML = '';

      const page = Math.floor(offset / LIMIT) + 1;
      if (pageInfo) pageInfo.textContent = `Page ${page}`;
      if (prevBtn) prevBtn.disabled = offset === 0;
      if (nextBtn) nextBtn.disabled = !hasMore;

      if (!orders.length) {
        renderEmpty();
        return;
      }

      orders.forEach(o => {
        const tr = document.createElement('tr');

        tr.className = 'row-preview';
        tr.setAttribute('data-row-preview', String(o.id));

        const date = new Date(o.created_at).toLocaleDateString('fr-FR');
        const itemsCount = o.items_count ?? 0;
        const totalQty = o.total_qty ?? 0;

        tr.innerHTML = `
          <td class="muted">${escapeHtml(date)}</td>
          <td>${escapeHtml(itemsCount)}</td>
          <td>${escapeHtml(totalQty)}</td>
          <td>${escapeHtml(o.amount_xpf)} XPF</td>
          <td class="${o.status === 'paid' ? 'status-active' : 'status-inactive'}">
            ${escapeHtml((o.status || '').toUpperCase())}
          </td>
          <td style="display:flex; gap:8px; justify-content:flex-end; align-items:center;">
            <button type="button" class="admin-link btn-link" data-copy="${escapeHtml(o.id)}">Copier ID</button>
            <button type="button" class="admin-link btn-link" data-preview="${escapeHtml(o.id)}">Aperçu</button>
            <a class="admin-link" href="/admin/order.html?id=${encodeURIComponent(o.id)}">Voir</a>
          </td>
        `;

        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      renderError();
    }
  }

  // ---------- events ----------
  // click tri (Date / Montant)
  document.querySelectorAll('.th-sort').forEach(th => {
    th.addEventListener('click', () => {
      const nextSort = th.getAttribute('data-sort');
      if (!nextSort) return;

      if (sort === nextSort) dir = dir === 'asc' ? 'desc' : 'asc';
      else { sort = nextSort; dir = 'desc'; }

      offset = 0;
      load();
    });
  });

  // filtre statut
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      status = statusFilter.value;
      offset = 0;
      load();
    });
  }

  // recherche (debounce) + suggestions
  if (qInput) {
    qInput.addEventListener('input', () => {
      clearTimeout(suggestTimer);
      const term = qInput.value.trim();
      suggestTimer = setTimeout(() => fetchSuggestions(term), 200);

      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        q = qInput.value.trim();
        offset = 0;
        load();
      }, 300);
    });
  }

  // pagination
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      offset = Math.max(offset - LIMIT, 0);
      load();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      offset = offset + LIMIT;
      load();
    });
  }

  // export csv
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      window.location.href = `/api/admin/orders/export.csv?${qs.toString()}`;
    });
  }

  // copier ID + preview + clic sur ligne (event delegation)
  tbody.addEventListener('click', (e) => {
    // 1) boutons explicites
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      copyText(String(copyBtn.getAttribute('data-copy')));
      return;
    }

    const previewBtn = e.target.closest('[data-preview]');
    if (previewBtn) {
      showPreview(String(previewBtn.getAttribute('data-preview')));
      return;
    }

    // 2) clic sur lien "Voir" -> laisser naviguer
    if (e.target.closest('a')) return;

    // 3) sinon clic sur la ligne -> preview
    const row = e.target.closest('tr[data-row-preview]');
    if (row) {
      showPreview(String(row.getAttribute('data-row-preview')));
    }
  });

  // raccourcis clavier
  function installShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!previewPanel?.classList.contains('hidden')) return;

      const isTyping =
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

      // "/" focus recherche
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (qInput) qInput.focus();
        return;
      }

      // ESC -> clear si focus recherche
      if (e.key === 'Escape') {
        if (document.activeElement === qInput) {
          qInput.value = '';
          q = '';
          offset = 0;
          load();
        }
        return;
      }

      // Enter -> recherche immédiate si focus recherche
      if (e.key === 'Enter' && document.activeElement === qInput) {
        e.preventDefault();
        q = qInput.value.trim();
        offset = 0;
        load();
        return;
      }

      // Alt+←/→ pagination
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') offset = Math.max(offset - LIMIT, 0);
        else offset = offset + LIMIT;
        load();
        return;
      }

      // tri rapide : d (date) / m (montant)
      if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === 'd') {
          if (sort === 'created_at') dir = (dir === 'asc' ? 'desc' : 'asc');
          else { sort = 'created_at'; dir = 'desc'; }
          offset = 0;
          load();
        }
        if (e.key.toLowerCase() === 'm') {
          if (sort === 'amount_xpf') dir = (dir === 'asc' ? 'desc' : 'asc');
          else { sort = 'amount_xpf'; dir = 'desc'; }
          offset = 0;
          load();
        }
      }
    });
  }

  // ---------- boot ----------
  readFromUrl();
  syncControls();
  installShortcuts();
  renderSuggestions(getRecentSearches());
  load();
})();
