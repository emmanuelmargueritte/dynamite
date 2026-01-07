/* frontend/admin/js/products.js
   ✅ Admin Produits + Catégories (multi)
   - Liste produits + search + tri + pagination
   - Toggle active / delete
   - Edit panel (SEO + catégories + image optionnelle + featured)
   - Create product (SEO + catégories + variants bulk optionnel + featured)
   - Gestion catégories: créer (via UI HTML existante) + supprimer (liste injectée, optionnelle)

   ✅ UX: Bouton "Afficher archivés" (appelle /api/admin/products?all=1)
*/

(() => {
  const form = document.getElementById('product-form');
  const tbody = document.getElementById('products');
  if (!form || !tbody) return;

  let csrfToken = null;

  const PAGE_SIZE = 10;

  const viewState = {
    products: [],
    page: 1,
    search: '',
    sortKey: 'created_at',
    sortDir: 'desc',
    showArchived: false // ✅ NEW
  };

  // =========================
  // Helpers
  // =========================
  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeNumber(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : NaN;
  }

  function uuidLooksOk(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
  }

  function splitCommaList(str) {
    return String(str || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  function bulletsToArrayFromTextarea(value) {
    const raw = String(value || '');
    return raw.split('\n').map(s => s.trim()).filter(Boolean);
  }

  function bulletsToMultiline(bp) {
    if (bp === null || bp === undefined) return '';
    if (Array.isArray(bp)) return bp.map(x => String(x).trim()).filter(Boolean).join('\n');
    if (typeof bp === 'string') {
      try {
        const parsed = JSON.parse(bp);
        if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean).join('\n');
      } catch (_) {}
      return bp;
    }
    return '';
  }

  function compareProducts(a, b, key) {
    const av = a?.[key];
    const bv = b?.[key];

    if (key === 'created_at') {
      const ad = av ? new Date(av).getTime() : 0;
      const bd = bv ? new Date(bv).getTime() : 0;
      return ad - bd;
    }

    if (key === 'price_xpf') return Number(av || 0) - Number(bv || 0);

    if (key === 'active') return (a.active === b.active) ? 0 : (a.active ? 1 : -1);

    return String(av || '').localeCompare(String(bv || ''), 'fr', { sensitivity: 'base' });
  }

  function slugify(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  // =========================
  // CSRF
  // =========================
  async function initCsrf() {
    const res = await fetch('/api/admin/auth/csrf-token', { credentials: 'include' });
    const data = await res.json();
    csrfToken = data.csrfToken;
  }

  // =========================
  // ✅ CATEGORIES (admin)
  // Endpoint: /api/admin/products/categories
  // =========================
  const catState = {
    categories: [],
    loaded: false,
    loadError: null
  };

  function sortCats(a, b) {
    const ao = Number(a.sort_order ?? 0);
    const bo = Number(b.sort_order ?? 0);
    if (ao !== bo) return ao - bo;
    return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' });
  }

  async function loadCategories() {
    try {
      const res = await fetch('/api/admin/products/categories', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      const cats = Array.isArray(data?.categories) ? data.categories : [];
      catState.categories = cats.slice().sort(sortCats);
      catState.loaded = true;
      catState.loadError = null;
    } catch (e) {
      catState.categories = [];
      catState.loaded = true;
      catState.loadError = e?.message || 'loadCategories failed';
    }
  }

  async function createCategory({ name, slug, sort_order = 0, active = true }) {
    const res = await fetch('/api/admin/products/categories', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ name, slug, sort_order, active })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Erreur création catégorie');
    return data?.category;
  }

  async function deleteCategory(id, { force = false } = {}) {
    const url = force
      ? `/api/admin/products/categories/${encodeURIComponent(id)}?force=1`
      : `/api/admin/products/categories/${encodeURIComponent(id)}`;

    const res = await fetch(url, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken }
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function renderCategoryOptions(selectEl, selectedIds = []) {
    if (!selectEl) return;
    const selectedSet = new Set((selectedIds || []).map(String));

    if (!catState.categories.length) {
      selectEl.innerHTML = `<option value="" disabled>(Aucune catégorie)</option>`;
      return;
    }

    selectEl.innerHTML = catState.categories.map(c => {
      const sel = selectedSet.has(String(c.id)) ? 'selected' : '';
      return `<option value="${escapeHtml(c.id)}" ${sel}>${escapeHtml(c.name)}</option>`;
    }).join('');
  }

  function getSelectedCategoryIdsFromSelect(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || [])
      .map(o => String(o.value).trim())
      .filter(uuidLooksOk);
  }

  function setSelectedCategoryIdsOnSelect(selectEl, ids = []) {
    if (!selectEl) return;
    const set = new Set((ids || []).map(String));
    Array.from(selectEl.options).forEach(opt => {
      opt.selected = set.has(String(opt.value));
    });
  }

  function renderCategoryChips(hostEl, selectEl) {
    if (!hostEl || !selectEl) return;

    const selected = getSelectedCategoryIdsFromSelect(selectEl);
    if (!selected.length) {
      hostEl.innerHTML = `<span class="muted">Aucune catégorie</span>`;
      return;
    }

    const map = new Map(catState.categories.map(c => [String(c.id), c]));
    hostEl.innerHTML = selected.map(id => {
      const c = map.get(String(id));
      const name = c ? c.name : id;
      return `
        <button type="button" class="cat-chip is-active" data-cid="${escapeHtml(id)}" title="Retirer">
          ${escapeHtml(name)} ✕
        </button>
      `;
    }).join('');

    hostEl.querySelectorAll('[data-cid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-cid');
        const next = selected.filter(x => String(x) !== String(cid));
        setSelectedCategoryIdsOnSelect(selectEl, next);
        renderCategoryChips(hostEl, selectEl);
      });
    });
  }

  function ensureCatChipStylesOnce() {
    if (document.getElementById('cat-chip-style')) return;
    const st = document.createElement('style');
    st.id = 'cat-chip-style';
    st.textContent = `
      .cat-row { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
      .cat-row select { min-width: 320px; }
      .cat-chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      .cat-chip{
        appearance:none;border:1px solid #ddd;background:#fff;border-radius:999px;
        padding:7px 10px;font-weight:700;cursor:pointer;font-size:12px;
      }
      .cat-chip.is-active{ border-color: rgba(255,45,85,.35); box-shadow: 0 8px 16px rgba(255,45,85,.10); }
      .cat-admin{
        max-width: 980px;
        background:#fff;
        border:1px solid #e6e8f0;
        border-radius:14px;
        padding:12px;
        margin: 12px 0 18px;
        box-shadow: 0 6px 18px rgba(0,0,0,.06);
      }
      .cat-admin h3{ margin:0 0 10px; }
      .cat-admin .list{ margin-top: 12px; display:flex; flex-wrap:wrap; gap:8px; }
      .cat-pill{
        display:inline-flex; align-items:center; gap:8px;
        border:1px solid #ddd; background:#fafafa; border-radius:999px;
        padding:7px 10px; font-weight:700; font-size:12px;
      }
      .cat-pill button{
        background:transparent;border:1px solid rgba(217,45,32,.25);
        color:#d92d20;border-radius:999px;padding:4px 8px;font-weight:800;
        cursor:pointer;
      }
      @media(max-width:860px){
        .cat-row select{ min-width: 240px; }
      }
    `;
    document.head.appendChild(st);
  }

  function refreshAllCategorySelects() {
    // create form
    const createSelect = document.getElementById('category_ids');
    const createChips = document.getElementById('category-chips');
    if (createSelect) {
      const selected = getSelectedCategoryIdsFromSelect(createSelect);
      const existing = new Set(catState.categories.map(c => String(c.id)));
      const nextSelected = selected.filter(id => existing.has(String(id)));

      renderCategoryOptions(createSelect, nextSelected);
      setSelectedCategoryIdsOnSelect(createSelect, nextSelected);
      if (createChips) renderCategoryChips(createChips, createSelect);
    }

    // edit panels opened
    document.querySelectorAll('select[data-role="edit-category-select"]').forEach(sel => {
      const selected = getSelectedCategoryIdsFromSelect(sel);
      const existing = new Set(catState.categories.map(c => String(c.id)));
      const nextSelected = selected.filter(id => existing.has(String(id)));

      renderCategoryOptions(sel, nextSelected);
      setSelectedCategoryIdsOnSelect(sel, nextSelected);

      const chipsId = sel.getAttribute('data-chips');
      const chipsEl = chipsId ? document.getElementById(chipsId) : null;
      if (chipsEl) renderCategoryChips(chipsEl, sel);
    });
  }

  // ✅ BIND sur TON UI HTML (btn-cat-toggle / btn-cat-create / ...)
  function bindCategoryCreatePanelFromHtml() {
    const toggleBtn = document.getElementById('btn-cat-toggle');
    const panel = document.getElementById('cat-create'); // div existante dans ton HTML
    const btnCreate = document.getElementById('btn-cat-create');
    const btnCancel = document.getElementById('btn-cat-cancel');
    const msg = document.getElementById('cat-create-msg');

    const nameEl = document.getElementById('cat_name');
    const slugEl = document.getElementById('cat_slug');
    const sortEl = document.getElementById('cat_sort');
    const activeEl = document.getElementById('cat_active');

    if (!toggleBtn || !panel || !btnCreate || !btnCancel || !nameEl || !slugEl) return;

    const setMsg = (t) => { if (msg) msg.textContent = t || ''; };

    // toggle open/close
    toggleBtn.addEventListener('click', () => {
      const isHidden = panel.style.display === 'none' || getComputedStyle(panel).display === 'none';
      panel.style.display = isHidden ? 'block' : 'none';
      setMsg('');
    });

    btnCancel.addEventListener('click', () => {
      panel.style.display = 'none';
      setMsg('');
    });

    // auto-slug (si slug vide)
    nameEl.addEventListener('input', () => {
      if (!slugEl) return;
      if (String(slugEl.value || '').trim() !== '') return;
      slugEl.value = slugify(nameEl.value);
    });

    btnCreate.addEventListener('click', async () => {
      const name = String(nameEl.value || '').trim();
      let slug = String(slugEl.value || '').trim();

      const sort_order_raw = safeNumber(sortEl?.value);
      const sort_order = Number.isFinite(sort_order_raw) ? sort_order_raw : 0;

      const active = String(activeEl?.value || 'true') === 'true';

      if (!name) { setMsg('Nom requis'); return; }
      if (!slug) slug = slugify(name);
      if (!slug) { setMsg('Slug requis'); return; }

      btnCreate.disabled = true;
      try {
        setMsg('Création…');

        await createCategory({ name, slug, sort_order, active });

        // reset champs
        nameEl.value = '';
        slugEl.value = '';
        if (sortEl) sortEl.value = '0';
        if (activeEl) activeEl.value = 'true';

        await loadCategories();
        refreshAllCategorySelects();
        renderCategoryAdminList();

        setMsg('OK ✓');
        setTimeout(() => setMsg(''), 1200);
      } catch (e) {
        console.error(e);
        setMsg(e?.message || 'Erreur');
      } finally {
        btnCreate.disabled = false;
      }
    });
  }

  // ✅ Petite liste admin (delete/force) injectée sous le form
  // (On évite les collisions d’ID avec ton HTML existant)
  function injectCategoryAdminListSection() {
    ensureCatChipStylesOnce();

    if (document.getElementById('cat-admin')) return;

    const box = document.createElement('div');
    box.id = 'cat-admin';
    box.className = 'cat-admin';
    box.innerHTML = `
      <h3>🏷️ Catégories (gestion)</h3>
      <div id="cat-admin-status" class="muted" style="margin-bottom:10px;"></div>
      <div id="cat-admin-list" class="list"></div>
      <small class="muted">⚠️ Supprimer : si utilisée, on propose “forcer” (retire les liens produit↔catégorie).</small>
    `;

    form.insertAdjacentElement('afterend', box);
  }

  function renderCategoryAdminList() {
    const host = document.getElementById('cat-admin-list');
    if (!host) return;

    if (!catState.categories.length) {
      host.innerHTML = `<span class="muted">Aucune catégorie</span>`;
      return;
    }

    host.innerHTML = catState.categories.map(c => `
      <span class="cat-pill">
        ${escapeHtml(c.name)}
        <button type="button" data-del="${escapeHtml(c.id)}" title="Supprimer">✕</button>
      </span>
    `).join('');

    host.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del');
        const cat = catState.categories.find(x => String(x.id) === String(id));
        const label = cat ? cat.name : id;

        if (!confirm(`Supprimer la catégorie "${label}" ?`)) return;

        const status = document.getElementById('cat-admin-status');
        try {
          if (status) status.textContent = 'Suppression…';

          let { res, data } = await deleteCategory(id, { force: false });

          if (res.status === 409) {
            const n = Number(data?.used_by_products ?? 0);
            const ok = confirm(`Catégorie utilisée par ${n} produit(s).\nForcer la suppression ? (retire les liens produit↔catégorie)`);
            if (!ok) { if (status) status.textContent = ''; return; }

            ({ res, data } = await deleteCategory(id, { force: true }));
          }

          if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

          catState.categories = catState.categories.filter(c => String(c.id) !== String(id));

          refreshAllCategorySelects();
          renderCategoryAdminList();
          await loadProducts();

          if (status) status.textContent = 'OK ✓';
          setTimeout(() => { if (status) status.textContent = ''; }, 1200);
        } catch (e) {
          console.error(e);
          if (status) status.textContent = e.message || 'Erreur';
        }
      });
    });
  }

  // =========================
  // Sorting + Search + Pager
  // =========================
  function getSortedProducts() {
    const q = String(viewState.search || '').trim().toLowerCase();

    const filtered = q
      ? viewState.products.filter(p => {
          const hay = `${p.name || ''} ${p.description || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : [...viewState.products];

    filtered.sort((a, b) => {
      const c = compareProducts(a, b, viewState.sortKey);
      return viewState.sortDir === 'asc' ? c : -c;
    });

    return filtered;
  }

  function initSorting() {
    document.querySelectorAll('th.th-sort').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (!key) return;

        if (viewState.sortKey === key) {
          viewState.sortDir = viewState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          viewState.sortKey = key;
          viewState.sortDir = (key === 'name' || key === 'price_xpf') ? 'asc' : 'desc';
        }

        viewState.page = 1;
        renderProducts();
      });
    });
  }

  function updateSortIndicators() {
    document.querySelectorAll('th.th-sort').forEach(th => {
      const key = th.getAttribute('data-sort');
      const ind = th.querySelector('.sort-ind');
      if (!ind) return;

      if (key === viewState.sortKey) {
        ind.textContent = viewState.sortDir === 'asc' ? '▲' : '▼';
        ind.style.opacity = '1';
      } else {
        ind.textContent = '';
        ind.style.opacity = '0.6';
      }
    });
  }

  function renderPager(totalPages) {
    const host = document.getElementById('products-pager');
    if (!host) return;

    host.innerHTML = `
      <div class="pager-inner">
        <button type="button" class="admin-link" data-page="prev" ${viewState.page <= 1 ? 'disabled' : ''}>←</button>
        <span class="muted">Page <strong>${viewState.page}</strong> / ${totalPages}</span>
        <button type="button" class="admin-link" data-page="next" ${viewState.page >= totalPages ? 'disabled' : ''}>→</button>
      </div>
    `;

    host.querySelector('[data-page="prev"]')?.addEventListener('click', () => {
      if (viewState.page > 1) {
        viewState.page--;
        renderProducts();
      }
    });

    host.querySelector('[data-page="next"]')?.addEventListener('click', () => {
      if (viewState.page < totalPages) {
        viewState.page++;
        renderProducts();
      }
    });
  }

  // =========================
  // Panels (inline rows)
  // =========================
  function ensurePanelRow(afterTr, panelClass, colSpan = 6) {
    const next = afterTr.nextElementSibling;
    if (next && next.classList.contains(panelClass)) return next;

    const panelTr = document.createElement('tr');
    panelTr.className = panelClass;

    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.innerHTML = `
      <div class="panel-box" style="background:#fff;border:1px solid #e6e8f0;border-radius:14px;padding:12px;margin:6px 0;">
        <div class="muted">Chargement…</div>
      </div>
    `;

    panelTr.appendChild(td);
    afterTr.insertAdjacentElement('afterend', panelTr);
    return panelTr;
  }

  function removePanelRow(afterTr, panelClass) {
    const next = afterTr.nextElementSibling;
    if (next && next.classList.contains(panelClass)) next.remove();
  }

  // =========================
  // API: produits
  // =========================
  async function loadProducts({ resetPage = false } = {}) {
    // ✅ NEW: toggle archived
    const url = viewState.showArchived
      ? '/api/admin/products?all=1'
      : '/api/admin/products';

    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json().catch(() => ([]));

    const products = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : []);
    viewState.products = products;

    if (resetPage) viewState.page = 1;

    const totalPages = Math.max(1, Math.ceil(getSortedProducts().length / PAGE_SIZE));
    if (viewState.page > totalPages) viewState.page = totalPages;

    renderProducts();
  }

  async function toggleActive(productId) {
    const res = await fetch(`/api/admin/products/${productId}/toggle`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Erreur toggle');
    return data;
  }

  async function deleteProduct(productId) {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ delete_cloudinary: false })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Erreur suppression produit');
    return data;
  }

  async function patchProduct(productId, payload) {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Erreur update produit');
    return data;
  }

  // =========================
  // Edit Panel
  // =========================
  function renderEditPanel(panelTr, p) {
    const panel = panelTr.querySelector('.panel-box');
    if (!panel) return;

    const panelId = `edit-${String(p.id).slice(0, 8)}-${Math.random().toString(16).slice(2)}`;
    const chipsId = `${panelId}-chips`;

    const selectedCats = Array.isArray(p.categories) ? p.categories.map(c => c.id) : [];

    const pIsFeatured = Boolean(p.is_featured);
    const pRank = (p.featured_rank === null || p.featured_rank === undefined) ? '' : String(p.featured_rank);

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;font-size:16px;">✏️ Modifier — ${escapeHtml(p.name)}</div>
          <div class="muted">Mise à jour sans toucher aux variantes.</div>
        </div>
        <div class="muted" id="${panelId}-status"></div>
      </div>

      <div style="margin-top:10px; display:grid; grid-template-columns: 160px 1fr; gap:10px 12px; align-items:center;">
        <label class="muted">Nom</label>
        <input id="${panelId}-name" value="${escapeHtml(p.name || '')}" />

        <label class="muted">Description courte</label>
        <input id="${panelId}-description" value="${escapeHtml(p.description || '')}" />

        <label class="muted">Prix XPF</label>
        <input id="${panelId}-price" type="number" value="${escapeHtml(p.price_xpf ?? '')}" />

        <label class="muted">Stripe price_id</label>
        <input id="${panelId}-stripe" value="${escapeHtml(p.stripe_price_id || '')}" />

        <label class="muted">Sélection du moment (Home)</label>
        <label class="stock-toggle">
          <input type="checkbox" id="${panelId}-featured" ${pIsFeatured ? 'checked' : ''} />
          Mettre en avant sur la page d’accueil
        </label>

        <label class="muted">Ordre Home</label>
        <input id="${panelId}-rank" type="number" min="1" placeholder="1 = tout en haut" value="${escapeHtml(pRank)}" />

        <label class="muted">SEO title</label>
        <input id="${panelId}-seo-title" value="${escapeHtml(p.seo_title || '')}" placeholder="optionnel" />

        <label class="muted">Meta description</label>
        <textarea id="${panelId}-seo-desc" rows="3" placeholder="optionnel">${escapeHtml(p.seo_description || '')}</textarea>

        <label class="muted">Description longue</label>
        <textarea id="${panelId}-long" rows="6" placeholder="optionnel">${escapeHtml(p.long_description || '')}</textarea>

        <label class="muted">Bullet points</label>
        <textarea id="${panelId}-bullets" rows="6" placeholder="1 ligne = 1 bullet">${escapeHtml(bulletsToMultiline(p.bullet_points))}</textarea>

        <label class="muted">Catégories</label>
        <div>
          <div class="cat-row">
            <select data-role="edit-category-select" data-chips="${chipsId}" id="${panelId}-cats" multiple size="6" style="width:100%;"></select>
            <div class="muted" style="max-width:260px;">Ctrl/Cmd pour multi-sélection.</div>
          </div>
          <div id="${chipsId}" class="cat-chips"></div>
        </div>

        <label class="muted">Image (optionnel)</label>
        <div>
          <input id="${panelId}-image" type="file" accept="image/*" />
          <div class="muted">Si tu ne mets rien → l’image actuelle reste.</div>
        </div>

        <div></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="admin-link" id="${panelId}-save">Enregistrer</button>
          <button type="button" class="admin-link danger" id="${panelId}-close">Fermer</button>
        </div>
      </div>
    `;

    const catsSelect = panel.querySelector(`#${panelId}-cats`);
    const chipsEl = panel.querySelector(`#${chipsId}`);
    renderCategoryOptions(catsSelect, selectedCats);
    setSelectedCategoryIdsOnSelect(catsSelect, selectedCats);
    renderCategoryChips(chipsEl, catsSelect);
    catsSelect.addEventListener('change', () => renderCategoryChips(chipsEl, catsSelect));

    // featured enable/disable rank
    const featuredEl = panel.querySelector(`#${panelId}-featured`);
    const rankEl = panel.querySelector(`#${panelId}-rank`);
    const syncRankEnabled = () => {
      if (!featuredEl || !rankEl) return;
      rankEl.disabled = !featuredEl.checked;
      if (!featuredEl.checked) rankEl.value = '';
    };
    syncRankEnabled();
    featuredEl?.addEventListener('change', syncRankEnabled);

    panel.querySelector(`#${panelId}-close`)?.addEventListener('click', () => {
      const tr = panelTr.previousElementSibling;
      if (tr) removePanelRow(tr, 'edit-panel-row');
    });

    panel.querySelector(`#${panelId}-save`)?.addEventListener('click', async () => {
      const statusEl = panel.querySelector(`#${panelId}-status`);
      const btnSave = panel.querySelector(`#${panelId}-save`);
      btnSave.disabled = true;

      try {
        if (statusEl) statusEl.textContent = 'PATCH…';

        // featured
        const is_featured = Boolean(featuredEl?.checked);
        const rankRaw = safeNumber(rankEl?.value);
        const featured_rank = (is_featured && Number.isFinite(rankRaw) && rankRaw > 0) ? Math.floor(rankRaw) : null;

        const payload = {
          name: String(panel.querySelector(`#${panelId}-name`)?.value || '').trim(),
          description: String(panel.querySelector(`#${panelId}-description`)?.value || '').trim(),
          price_xpf: safeNumber(panel.querySelector(`#${panelId}-price`)?.value),
          stripe_price_id: String(panel.querySelector(`#${panelId}-stripe`)?.value || '').trim(),

          is_featured,
          featured_rank,

          seo_title: String(panel.querySelector(`#${panelId}-seo-title`)?.value || '').trim(),
          seo_description: String(panel.querySelector(`#${panelId}-seo-desc`)?.value || ''),
          long_description: String(panel.querySelector(`#${panelId}-long`)?.value || ''),
          bullet_points: bulletsToArrayFromTextarea(panel.querySelector(`#${panelId}-bullets`)?.value),
          category_ids: getSelectedCategoryIdsFromSelect(catsSelect)
        };

        if (!payload.name) throw new Error('Nom requis');
        if (!Number.isFinite(payload.price_xpf) || payload.price_xpf <= 0) throw new Error('Prix invalide');
        if (!payload.stripe_price_id) throw new Error('stripe_price_id requis');

        const file = panel.querySelector(`#${panelId}-image`)?.files?.[0];
        if (file) {
          if (statusEl) statusEl.textContent = 'Upload image…';
          if (typeof CloudinaryUpload !== 'function') throw new Error('CloudinaryUpload manquant (cloudinary.js)');
          const image_url = await CloudinaryUpload(file);
          payload.image_url = image_url;
        }

        await patchProduct(p.id, payload);

        if (statusEl) statusEl.textContent = 'OK ✓';
        await loadProducts();

        const tr = panelTr.previousElementSibling;
        if (tr) removePanelRow(tr, 'edit-panel-row');
      } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = e.message || 'Erreur';
      } finally {
        btnSave.disabled = false;
      }
    });
  }

  function toggleEditPanel(productTr, p) {
    const next = productTr.nextElementSibling;
    const isOpen = next && next.classList.contains('edit-panel-row');
    if (isOpen) {
      removePanelRow(productTr, 'edit-panel-row');
      return;
    }
    const panelTr = ensurePanelRow(productTr, 'edit-panel-row');
    renderEditPanel(panelTr, p);
  }

  // =========================
  // Render table
  // =========================
  function renderProducts() {
    updateSortIndicators();

    const sorted = getSortedProducts();
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (viewState.page > totalPages) viewState.page = totalPages;

    const start = (viewState.page - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = '';

    pageItems.forEach(p => {
      const tr = document.createElement('tr');

      const tdImg = document.createElement('td');
      const imgSrc = p.image_url || '/assets/logo.svg';
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = p.name || 'Produit';
      img.className = 'preview-thumb';
      tdImg.appendChild(img);

      const tdName = document.createElement('td');
      tdName.textContent = p.name || '';

      const tdPrice = document.createElement('td');
      tdPrice.textContent = `${p.price_xpf ?? ''} XPF`;

      const tdStatus = document.createElement('td');
      tdStatus.className = p.active ? 'status-active' : 'status-inactive';
      tdStatus.textContent = p.active ? 'ACTIF' : 'INACTIF';

      const tdDate = document.createElement('td');
      tdDate.className = 'muted';
      tdDate.textContent = p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '';

      const tdAction = document.createElement('td');

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'admin-link';
      btnEdit.textContent = 'Modifier';

      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.className = 'admin-link';
      btnToggle.textContent = p.active ? 'Désactiver' : 'Activer';

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'admin-link danger';
      btnDelete.textContent = 'Supprimer';

      btnEdit.addEventListener('click', () => toggleEditPanel(tr, p));

      btnToggle.addEventListener('click', async () => {
        btnToggle.disabled = true;
        try {
          await toggleActive(p.id);
          await loadProducts();
        } catch (e) {
          console.error(e);
          alert(e.message || 'Erreur toggle');
        } finally {
          btnToggle.disabled = false;
        }
      });

      btnDelete.addEventListener('click', async () => {
        if (!confirm(`Supprimer "${p.name}" ?`)) return;
        btnDelete.disabled = true;
        try {
          await deleteProduct(p.id);
          await loadProducts({ resetPage: true });
        } catch (e) {
          console.error(e);
          alert(e.message || 'Erreur suppression');
        } finally {
          btnDelete.disabled = false;
        }
      });

      tdAction.appendChild(btnEdit);
      tdAction.appendChild(document.createTextNode(' '));
      tdAction.appendChild(btnToggle);
      tdAction.appendChild(document.createTextNode(' '));
      tdAction.appendChild(btnDelete);

      tr.appendChild(tdImg);
      tr.appendChild(tdName);
      tr.appendChild(tdPrice);
      tr.appendChild(tdStatus);
      tr.appendChild(tdDate);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });

    renderPager(totalPages);
  }

  // =========================
  // Create product
  // =========================
  function getSelectedSizesFromCheckboxes() {
    const boxes = Array.from(document.querySelectorAll('input.size[type="checkbox"]'));
    return boxes.filter(b => b.checked).map(b => String(b.value).trim()).filter(Boolean);
  }

  async function createProduct(body) {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Erreur création produit');
    return data;
  }

  function bindFeaturedCreateFormUX() {
    const featuredEl = document.getElementById('is_featured');
    const rankEl = document.getElementById('featured_rank');
    if (!featuredEl || !rankEl) return;

    const sync = () => {
      rankEl.disabled = !featuredEl.checked;
      if (!featuredEl.checked) rankEl.value = '';
    };

    featuredEl.addEventListener('change', sync);
    sync();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const name = String(document.getElementById('name')?.value || '').trim();
      const description = String(document.getElementById('description')?.value || '').trim();
      const price_xpf = safeNumber(document.getElementById('price_xpf')?.value);
      const stripe_price_id = String(document.getElementById('stripe_price_id')?.value || '').trim();

      const seo_title = String(document.getElementById('seo_title')?.value || '').trim();
      const seo_description = String(document.getElementById('seo_description')?.value || '');
      const long_description = String(document.getElementById('long_description')?.value || '');
      const bullet_points = bulletsToArrayFromTextarea(document.getElementById('bullet_points')?.value);

      const colors = splitCommaList(document.getElementById('colors')?.value || '');
      const gender = String(document.getElementById('gender')?.value || 'UNISEXE').trim();
      const sizes = getSelectedSizesFromCheckboxes();

      const trackStock = Boolean(document.getElementById('track_stock')?.checked);
      const stockTotal = safeNumber(document.getElementById('stock_total')?.value);

      const categorySelect = document.getElementById('category_ids');
      const category_ids = categorySelect ? getSelectedCategoryIdsFromSelect(categorySelect) : [];

      // featured (create form)
      const isFeaturedEl = document.getElementById('is_featured');
      const rankEl = document.getElementById('featured_rank');
      let is_featured = Boolean(isFeaturedEl?.checked);
      const rankRaw = safeNumber(rankEl?.value);
      let featured_rank = (is_featured && Number.isFinite(rankRaw) && rankRaw > 0) ? Math.floor(rankRaw) : null;

      // si l’utilisateur remplit un rank, on force featured
      if (Number.isFinite(rankRaw) && rankRaw > 0) {
        is_featured = true;
        featured_rank = Math.floor(rankRaw);
      }

      if (!name) throw new Error('Nom requis');
      if (!Number.isFinite(price_xpf) || price_xpf <= 0) throw new Error('Prix invalide');
      if (!stripe_price_id) throw new Error('stripe_price_id requis');

      let image_url = null;
      const file = document.getElementById('image')?.files?.[0];
      if (file) {
        if (typeof CloudinaryUpload !== 'function') throw new Error('CloudinaryUpload manquant (cloudinary.js)');
        image_url = await CloudinaryUpload(file);
      }

      const body = {
        name,
        description,
        price_xpf,
        stripe_price_id,
        image_url,

        is_featured,
        featured_rank,

        seo_title,
        seo_description,
        long_description,
        bullet_points,
        category_ids,
        variants: {
          gender,
          colors,
          sizes,
          track_stock: trackStock,
          stock_total: Number.isFinite(stockTotal) && stockTotal >= 0 ? Math.floor(stockTotal) : null
        }
      };

      await createProduct(body);

      e.target.reset();
      const stockBox = document.getElementById('stock-box');
      if (stockBox) stockBox.style.display = 'none';

      if (categorySelect) {
        setSelectedCategoryIdsOnSelect(categorySelect, []);
        const chips = document.getElementById('category-chips');
        if (chips) renderCategoryChips(chips, categorySelect);
      }

      // reset featured UX
      bindFeaturedCreateFormUX();

      await loadProducts({ resetPage: true });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Erreur création produit');
    }
  });

  // =========================
  // Boot
  // =========================
  (async function boot() {
    await initCsrf();

    await loadCategories();

    // ton HTML a déjà category_ids + chips => on refresh juste
    ensureCatChipStylesOnce();
    refreshAllCategorySelects();

    // ✅ bind sur TON UI HTML de création catégorie (corrige ton problème)
    bindCategoryCreatePanelFromHtml();

    // ✅ petite liste de suppression (pratique)
    injectCategoryAdminListSection();
    renderCategoryAdminList();

    // ✅ NEW: toggle archived button (si présent dans le HTML)
    const btnArchived = document.getElementById('toggle-archived');
    const syncArchivedBtn = () => {
      if (!btnArchived) return;
      btnArchived.textContent = viewState.showArchived ? 'Masquer archivés' : 'Afficher archivés';
    };
    syncArchivedBtn();
    btnArchived?.addEventListener('click', async () => {
      viewState.showArchived = !viewState.showArchived;
      viewState.page = 1;
      syncArchivedBtn();
      await loadProducts({ resetPage: true });
    });

    await loadProducts({ resetPage: true });

    initSorting();

    const searchEl = document.getElementById('product-search');
    searchEl?.addEventListener('input', () => {
      viewState.search = searchEl.value;
      viewState.page = 1;
      renderProducts();
    });

    const trackStockInput = document.getElementById('track_stock');
    const stockBox = document.getElementById('stock-box');
    if (trackStockInput && stockBox) {
      trackStockInput.addEventListener('change', () => {
        stockBox.style.display = trackStockInput.checked ? 'block' : 'none';
      });
    }

    // ✅ UX featured create form
    bindFeaturedCreateFormUX();

    // ✅ chips create form (si ton select existe)
    const createSelect = document.getElementById('category_ids');
    const createChips = document.getElementById('category-chips');
    if (createSelect && createChips) {
      renderCategoryChips(createChips, createSelect);
      createSelect.addEventListener('change', () => renderCategoryChips(createChips, createSelect));
    }
  })();
})();
