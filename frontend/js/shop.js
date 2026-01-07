// frontend/js/shop.js
(async () => {
  const container = document.getElementById('products');
  const loadingEl = document.getElementById('shop-loading');
  const errorEl = document.getElementById('shop-error');

  // Cat UI
  const catsWrap = document.querySelector('#shop-categories .shop-cats-row');
  const catCurrentEl = document.getElementById('shop-cat-current');
  let catNoteEl = document.getElementById('shop-cat-note');
  const chipsEl = document.getElementById('shop-active-chips');

  // ✅ Cat hint (Swipe) — element exists in HTML
  const catHintEl = document.querySelector('#shop-categories .cat-hint');
  const CAT_HINT_KEY = 'dynamite_shop_cat_hint_seen_v1';

  // Search + sort UI (desktop)
  const searchInput = document.getElementById('shop-search');
  const searchClearBtn = document.getElementById('shop-search-clear');
  const sortSelect = document.getElementById('shop-sort');
  const resultsCountEl = document.getElementById('shop-results-count');

  // ✅ Mobile quick bar (si présent dans ton HTML)
  const mobileSearchInput = document.getElementById('shop-search-mobile');
  const mobileClearBtn = document.getElementById('shop-mobile-clear');
  const mobileFiltersBtn = document.getElementById('shop-mobile-filters');

  // Drawer filtres
  const filtersOpenBtn = document.getElementById('shop-filters-open');
  const filtersOverlay = document.getElementById('shop-filters-overlay');
  const filtersBody = document.getElementById('shop-filters-body');
  const filtersCloseBtn = document.getElementById('shop-filters-close');
  const filtersResetBtn = document.getElementById('shop-filters-reset');
  const filtersApplyBtn = document.getElementById('shop-filters-apply');

  const toolsEl = document.querySelector('.shop-tools');
  const toolsParent = toolsEl?.parentElement || null;
  const toolsNextSibling = toolsEl?.nextSibling || null;

  const state = {
    categories: [],
    productsAll: [],
    activeCatSlug: 'all',
    q: '',
    sort: 'new'
  };

  // =========================
  // Micro UI helpers
  // =========================
  function ensureCatNoteEl() {
    if (catNoteEl) return catNoteEl;
    const hint = document.getElementById('shop-cat-hint');
    if (!hint) return null;

    const span = document.createElement('span');
    span.id = 'shop-cat-note';
    span.className = 'shop-result-chip';
    span.setAttribute('aria-live', 'polite');
    hint.appendChild(span);

    catNoteEl = span;
    return catNoteEl;
  }

  function setCatNote(text) {
    const el = ensureCatNoteEl();
    if (!el) return;
    el.textContent = text ? String(text) : '';
    el.style.display = text ? 'inline-flex' : 'none';
  }

  function setResultsCount(n) {
    if (!resultsCountEl) return;
    if (!Number.isFinite(n)) {
      resultsCountEl.textContent = '';
      resultsCountEl.style.display = 'none';
      return;
    }
    resultsCountEl.textContent = `${n} résultat${n > 1 ? 's' : ''}`;
    resultsCountEl.style.display = 'inline-flex';
  }

  function setLoading(isLoading) {
    if (loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none';
  }

  function setError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatXpf(n) {
    return `${Number(n || 0).toLocaleString('fr-FR')} XPF`;
  }

  function safeGetLocalStorage(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSetLocalStorage(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  // =========================
  // URL state
  // =========================
  function readUrlState() {
    const url = new URL(window.location.href);
    const cat = (url.searchParams.get('cat') || 'all').trim().toLowerCase();
    const q = (url.searchParams.get('q') || '').trim();
    const sort = (url.searchParams.get('sort') || 'new').trim().toLowerCase();

    state.activeCatSlug = cat || 'all';
    state.q = q;
    state.sort = ['new', 'price_asc', 'price_desc', 'name_asc'].includes(sort) ? sort : 'new';
  }

  function setUrlFromState({ replace = false } = {}) {
    const url = new URL(window.location.href);

    const cat = state.activeCatSlug || 'all';
    const q = (state.q || '').trim();
    const sort = state.sort || 'new';

    if (cat && cat !== 'all') url.searchParams.set('cat', cat);
    else url.searchParams.delete('cat');

    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');

    if (sort && sort !== 'new') url.searchParams.set('sort', sort);
    else url.searchParams.delete('sort');

    if (replace) window.history.replaceState({}, '', url.toString());
    else window.history.pushState({}, '', url.toString());
  }

  // =========================
  // SEO helpers (shop)
  // =========================
  function upsertMeta({ attr, key, content }) {
    const head = document.head;
    if (!head) return;

    let el = head.querySelector(`meta[${attr}="${CSS.escape(key)}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function upsertCanonical(hrefAbs) {
    const head = document.head;
    if (!head) return;

    let link = head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', hrefAbs);
  }

  function setJsonLd(id, obj) {
    const head = document.head;
    if (!head) return;

    let script = document.getElementById(id);
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = id;
      head.appendChild(script);
    }
    script.textContent = JSON.stringify(obj).replace(/</g, '\\u003c');
  }

  function getCatName(slug) {
    if (!slug || slug === 'all') return 'Tous';
    return state.categories.find(c => String(c.slug || '').trim().toLowerCase() === slug)?.name || slug;
  }

  function computeShopCanonical() {
    const origin = window.location.origin;
    const base = new URL('/shop.html', origin);

    const cat = state.activeCatSlug || 'all';
    const q = (state.q || '').trim();

    // Canonical indexable = cat only (sans q/sort)
    if (cat !== 'all' && !q) base.searchParams.set('cat', cat);

    return base.toString();
  }

  function buildProductUrl(p) {
    const id = encodeURIComponent(String(p?.id || ''));
    return `/product.html?id=${id}`;
  }

  function applyShopSeo(visibleProducts) {
    const catSlug = state.activeCatSlug || 'all';
    const catName = getCatName(catSlug);
    const q = (state.q || '').trim();
    const sort = state.sort || 'new';

    const isSearchPage = !!q;
    const isSortedPage = sort !== 'new';

    // robots
    const robots = (isSearchPage || isSortedPage) ? 'noindex,follow' : 'index,follow';
    upsertMeta({ attr: 'name', key: 'robots', content: robots });

    // canonical
    const canonicalAbs = computeShopCanonical();
    upsertCanonical(canonicalAbs);

    // title + description
    let title = 'Boutique — Dynamite';
    if (isSearchPage && catSlug !== 'all') title = `Recherche “${q}” — ${catName} | Dynamite`;
    else if (isSearchPage) title = `Recherche “${q}” | Boutique — Dynamite`;
    else if (catSlug !== 'all') title = `${catName} | Boutique — Dynamite`;

    document.title = title;

    let desc = 'Boutique Dynamite : nouveautés et essentiels. Livraison Nouméa + Grand Nouméa, paiement sécurisé.';
    if (isSearchPage && catSlug !== 'all') desc = `Résultats pour “${q}” dans ${catName}. Livraison Nouméa + Grand Nouméa, paiement sécurisé.`;
    else if (isSearchPage) desc = `Résultats pour “${q}” dans la boutique Dynamite. Livraison Nouméa + Grand Nouméa, paiement sécurisé.`;
    else if (catSlug !== 'all') desc = `Découvrez la catégorie ${catName} chez Dynamite. Livraison Nouméa + Grand Nouméa, paiement sécurisé.`;

    upsertMeta({ attr: 'name', key: 'description', content: desc });

    upsertMeta({ attr: 'property', key: 'og:type', content: 'website' });
    upsertMeta({ attr: 'property', key: 'og:site_name', content: 'Dynamite' });
    upsertMeta({ attr: 'property', key: 'og:title', content: title });
    upsertMeta({ attr: 'property', key: 'og:description', content: desc });
    upsertMeta({ attr: 'property', key: 'og:url', content: canonicalAbs });

    upsertMeta({ attr: 'name', key: 'twitter:card', content: 'summary' });
    upsertMeta({ attr: 'name', key: 'twitter:title', content: title });
    upsertMeta({ attr: 'name', key: 'twitter:description', content: desc });

    // JSON-LD (ItemList + Breadcrumb)
    const origin = window.location.origin;
    const crumbs = [
      { "@type": "ListItem", "position": 1, "name": "Accueil", "item": `${origin}/` },
      { "@type": "ListItem", "position": 2, "name": "Boutique", "item": `${origin}/shop.html` }
    ];
    if (catSlug !== 'all' && !isSearchPage) {
      crumbs.push({ "@type": "ListItem", "position": 3, "name": catName, "item": canonicalAbs });
    }

    const list = (visibleProducts || []).slice(0, 24).map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": `${origin}${buildProductUrl(p)}`
    }));

    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", "@id": canonicalAbs, "name": title, "description": desc, "url": canonicalAbs },
        { "@type": "BreadcrumbList", "itemListElement": crumbs },
        ...(list.length ? [{
          "@type": "ItemList",
          "name": (catSlug !== 'all' && !isSearchPage) ? `Produits — ${catName}` : "Produits — Boutique",
          "itemListElement": list
        }] : [])
      ]
    };

    setJsonLd('shop-jsonld', graph);
  }

  // =========================
  // Cat hint dismissal
  // =========================
  function showCatHintIfNeeded() {
    if (!catHintEl) return;
    const seen = safeGetLocalStorage(CAT_HINT_KEY);
    if (seen === '1') return;
    catHintEl.style.opacity = '1';
  }

  function bindCatHintDismissal() {
    if (!catHintEl) return;

    const dismiss = () => {
      safeSetLocalStorage(CAT_HINT_KEY, '1');
      try { catHintEl.style.display = 'none'; } catch (_) {}
      window.removeEventListener('scroll', dismiss, { passive: true });
      catHintEl.removeEventListener('click', dismiss);
    };

    catHintEl.addEventListener('click', dismiss);
    window.addEventListener('scroll', dismiss, { passive: true, once: true });
  }

  // =========================
  // API
  // =========================
  async function fetchCategories() {
    const res = await fetch('/api/public/categories', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'ok') throw new Error(data?.error || 'Impossible de charger les catégories');
    return Array.isArray(data.categories) ? data.categories : [];
  }

  async function fetchProducts() {
    const res = await fetch('/api/public/products', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'ok') throw new Error(data?.error || 'Impossible de charger les produits');
    return data.products || [];
  }

  // =========================
  // Products helpers
  // =========================
  function pickDefaultVariant(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) return null;

    if (product.default_variant_id) {
      const dv = variants.find(v => String(v.id) === String(product.default_variant_id));
      if (dv) return dv;
    }
    return variants.find(v => v.is_default) || variants[0] || null;
  }

  function priceOf(product) {
    const vars = Array.isArray(product?.variants) ? product.variants : [];
    const prices = vars.map(v => Number(v?.price_xpf ?? NaN)).filter(n => Number.isFinite(n));
    if (!prices.length) return Number(product?.price_xpf ?? 0);
    return Math.min(...prices);
  }

  function normalizeCatSlug(x) {
    return String(x || '').trim().toLowerCase();
  }

  function getVisibleProducts() {
    let list = Array.isArray(state.productsAll) ? [...state.productsAll] : [];

    // cat filter
    const cat = state.activeCatSlug || 'all';
    if (cat !== 'all') {
      list = list.filter(p => {
        const cats = Array.isArray(p.categories) ? p.categories : [];
        return cats.some(c => normalizeCatSlug(c?.slug) === cat);
      });
    }

    // search
    const q = (state.q || '').trim().toLowerCase();
    if (q) {
      list = list.filter(p => {
        const name = String(p?.name || '').toLowerCase();
        const desc = String(p?.seo_description || p?.description || '').toLowerCase();
        const longd = String(p?.long_description || '').toLowerCase();
        return name.includes(q) || desc.includes(q) || longd.includes(q);
      });
    }

    // sort
    const sort = state.sort || 'new';
    if (sort === 'price_asc') {
      list.sort((a, b) => priceOf(a) - priceOf(b));
    } else if (sort === 'price_desc') {
      list.sort((a, b) => priceOf(b) - priceOf(a));
    } else if (sort === 'name_asc') {
      list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'fr', { sensitivity: 'base' }));
    } else {
      // nouveautés: created_at desc
      list.sort((a, b) => {
        const ad = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bd - ad;
      });
    }

    return list;
  }

  // highlight helper
  function highlight(text, q) {
    const raw = String(text || '');
    const qq = String(q || '').trim();
    if (!qq) return escapeHtml(raw);

    const safe = escapeHtml(raw);
    const re = new RegExp(qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
    return safe.replace(re, m => `<span class="shop-hl">${m}</span>`);
  }

  // =========================
  // Render
  // =========================
  function render(products) {
    if (!container) return;

    if (!products.length) {
      container.innerHTML = `
        <div class="notice warn" style="grid-column: 1 / -1;">
          <div style="font-weight:900; margin-bottom:6px;">Aucun résultat</div>
          <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap;">
            <button type="button" class="btn secondary" id="shop-reset-filters">Réinitialiser</button>
            <span class="small">Astuce : change la catégorie ou le mot-clé.</span>
          </div>
        </div>
      `;
      document.getElementById('shop-reset-filters')?.addEventListener('click', resetAll);
      return;
    }

    const q = (state.q || '').trim();

    container.innerHTML = products.map(p => {
      const dv = pickDefaultVariant(p);
      const name = q ? highlight(p?.name || 'Produit', q) : escapeHtml(p?.name || 'Produit');
      const descRaw = (p?.seo_description || p?.description || '').trim();
      const desc = q ? highlight(descRaw, q) : escapeHtml(descRaw);
      const img = escapeHtml(dv?.image_url || p?.image_url || p?.product_image_url || '');
      const price = formatXpf(priceOf(p));
      const url = buildProductUrl(p);

      return `
        <article class="card">
          <a class="media" href="${url}" style="background:#f6f6f6;">
            ${img ? `<img class="product-image" src="${img}" alt="${escapeHtml(p?.name || 'Produit')}" loading="lazy" />` : ''}
          </a>
          <div class="content">
            <a class="title" href="${url}">${name}</a>
            <div class="meta">${desc ? desc.slice(0, 160) : '&nbsp;'}</div>
            <div class="row" style="gap:10px; align-items:center;">
              <span class="price">${price}</span>
              <a class="btn" href="${url}" style="margin-left:auto;">Voir</a>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // =========================
  // UI updates
  // =========================
  function updateActiveCategoryUI() {
    if (!catsWrap) return;

    catsWrap.querySelectorAll('.shop-cat').forEach(btn => {
      const slug = String(btn.dataset.cat || 'all').toLowerCase();
      const active = slug === state.activeCatSlug;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (catCurrentEl) catCurrentEl.textContent = getCatName(state.activeCatSlug);
  }

  function beginUpdate() {
    container?.classList.add('is-updating');
    requestAnimationFrame(() => container?.classList.remove('is-updating'));
  }

  function syncSearchUIs() {
    const q = state.q || '';
    if (searchInput && searchInput.value !== q) searchInput.value = q;
    if (mobileSearchInput && mobileSearchInput.value !== q) mobileSearchInput.value = q;
  }

  function applyState({ pushUrl = true, replaceUrl = false, note = '' } = {}) {
    updateActiveCategoryUI();
    setCatNote(note);

    if (sortSelect && sortSelect.value !== state.sort) sortSelect.value = state.sort;
    syncSearchUIs();

    const visible = getVisibleProducts();
    setResultsCount(visible.length);
    renderActiveChips();
    applyShopSeo(visible);

    beginUpdate();
    render(visible);

    if (pushUrl) setUrlFromState({ replace: replaceUrl });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
  }

  function renderCategoriesBar() {
    if (!catsWrap) return;

    // keep "Tous"
    const hasAll = !!catsWrap.querySelector('[data-cat="all"]');
    if (!hasAll) {
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'shop-cat is-active';
      allBtn.dataset.cat = 'all';
      allBtn.textContent = 'Tous';
      allBtn.setAttribute('aria-pressed', 'true');
      catsWrap.prepend(allBtn);
    }

    // remove others
    catsWrap.querySelectorAll('.shop-cat').forEach(btn => {
      if (btn.dataset.cat !== 'all') btn.remove();
    });

    state.categories.forEach(c => {
      const slug = String(c.slug || '').trim().toLowerCase();
      if (!slug) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-cat';
      btn.dataset.cat = slug;
      btn.textContent = c.name || slug;
      btn.setAttribute('aria-pressed', 'false');
      catsWrap.appendChild(btn);
    });

    catsWrap.querySelectorAll('.shop-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const slug = String(btn.dataset.cat || 'all').trim().toLowerCase();
        state.activeCatSlug = slug || 'all';
        applyState({ pushUrl: true, note: '' });
      });
    });

    updateActiveCategoryUI();

    requestAnimationFrame(() => {
      showCatHintIfNeeded();
      bindCatHintDismissal();
    });
  }

  // =========================
  // Active chips (cat + search + sort)
  // =========================
  function chipHtml(label, onRemoveId) {
    return `
      <span class="shop-chip">
        ${escapeHtml(label)}
        <button type="button" aria-label="Retirer" data-remove="${escapeHtml(onRemoveId)}">×</button>
      </span>
    `;
  }

  function renderActiveChips() {
    if (!chipsEl) return;

    const chips = [];
    const cat = state.activeCatSlug || 'all';
    const q = (state.q || '').trim();
    const sort = state.sort || 'new';

    if (cat !== 'all') chips.push(chipHtml(`Catégorie : ${getCatName(cat)}`, 'cat'));
    if (q) chips.push(chipHtml(`Recherche : ${q}`, 'q'));
    if (sort !== 'new') {
      const label = sort === 'price_asc' ? 'Tri : Prix ↑'
        : sort === 'price_desc' ? 'Tri : Prix ↓'
        : sort === 'name_asc' ? 'Tri : Nom A→Z'
        : 'Tri : Nouveautés';
      chips.push(chipHtml(label, 'sort'));
    }

    chipsEl.innerHTML = chips.join('');

    chipsEl.querySelectorAll('button[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-remove');
        if (k === 'cat') state.activeCatSlug = 'all';
        if (k === 'q') state.q = '';
        if (k === 'sort') state.sort = 'new';
        applyState({ pushUrl: true, replaceUrl: true, note: '' });
      });
    });
  }

  // =========================
  // Drawer logic
  // =========================
  function openDrawer() {
    if (!filtersOverlay || !filtersBody || !toolsEl) return;
    filtersOverlay.hidden = false;
    filtersBody.appendChild(toolsEl);
    setTimeout(() => (searchInput || mobileSearchInput)?.focus(), 0);
    document.body.classList.add('modal-open');
  }

  function closeDrawer() {
    if (!filtersOverlay || !toolsEl) return;
    filtersOverlay.hidden = true;
    if (toolsParent) toolsParent.insertBefore(toolsEl, toolsNextSibling);
    document.body.classList.remove('modal-open');
  }

  function isDrawerOpen() {
    return filtersOverlay && !filtersOverlay.hidden;
  }

  function resetAll() {
    state.activeCatSlug = 'all';
    state.q = '';
    state.sort = 'new';
    if (searchInput) searchInput.value = '';
    if (mobileSearchInput) mobileSearchInput.value = '';
    if (sortSelect) sortSelect.value = 'new';
    applyState({ pushUrl: true, replaceUrl: true, note: '' });
  }

  function bindDrawerEvents() {
    filtersOpenBtn?.addEventListener('click', openDrawer);
    filtersCloseBtn?.addEventListener('click', closeDrawer);

    filtersApplyBtn?.addEventListener('click', () => closeDrawer());

    filtersResetBtn?.addEventListener('click', () => {
      resetAll();
      closeDrawer();
    });

    filtersOverlay?.addEventListener('click', (e) => {
      if (e.target === filtersOverlay) closeDrawer();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isDrawerOpen()) closeDrawer();
    });

    window.addEventListener('resize', () => {
      if (window.matchMedia('(min-width: 781px)').matches && isDrawerOpen()) closeDrawer();
    });

    // mobile bar (si présent)
    mobileFiltersBtn?.addEventListener('click', openDrawer);
  }

  // =========================
  // Bind search/sort
  // =========================
  function bindSearchAndSort() {
    const applyQ = (val) => {
      state.q = String(val || '').trim();
      applyState({ pushUrl: true, note: state.q ? 'Recherche active' : '' });
    };

    searchInput?.addEventListener('input', () => applyQ(searchInput.value));
    mobileSearchInput?.addEventListener('input', () => applyQ(mobileSearchInput.value));

    searchClearBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (mobileSearchInput) mobileSearchInput.value = '';
      applyQ('');
    });

    mobileClearBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (mobileSearchInput) mobileSearchInput.value = '';
      applyQ('');
    });

    sortSelect?.addEventListener('change', () => {
      state.sort = String(sortSelect.value || 'new');
      applyState({ pushUrl: true, note: '' });
    });
  }

  // =========================
  // Init
  // =========================
  function applyPlaceholders() {
    const ph = '🔎 Nom / description…';
    if (searchInput) searchInput.placeholder = ph;
    if (mobileSearchInput) mobileSearchInput.placeholder = ph;

    // results chips styling (no HTML change)
    catCurrentEl?.classList.add('shop-result-chip');
    resultsCountEl?.classList.add('shop-result-chip');
    ensureCatNoteEl()?.classList.add('shop-result-chip');
  }

  function mountDesktopResetButton() {
    // ✅ Safety: supprime les vieux patches (si t’en as eu)
    document.querySelectorAll('.shop-tools-actions').forEach(n => n.remove());
    const existing = document.getElementById('shop-desktop-reset');
    if (existing) existing.remove();

    const right = document.querySelector('.shop-tools-right');
    const filtersBtn = document.getElementById('shop-filters-open');
    if (!right || !filtersBtn) return;

    const resetBtn = document.createElement('button');
    resetBtn.id = 'shop-desktop-reset';
    resetBtn.type = 'button';
    resetBtn.className = 'btn secondary';
    resetBtn.textContent = 'Réinitialiser';
    resetBtn.addEventListener('click', resetAll);

    right.insertBefore(resetBtn, filtersBtn);
  }

  async function init() {
    applyPlaceholders();
    readUrlState();
    setLoading(true);
    clearError();

    try {
      const [cats, products] = await Promise.all([
        fetchCategories(),
        fetchProducts()
      ]);

      state.categories = cats;
      state.productsAll = Array.isArray(products) ? products : [];

      renderCategoriesBar();
      bindDrawerEvents();
      bindSearchAndSort();

      // ✅ desktop reset (1 seul, stable)
      mountDesktopResetButton();

      // hydrate UI
      if (searchInput) searchInput.value = state.q || '';
      if (mobileSearchInput) mobileSearchInput.value = state.q || '';
      if (sortSelect) sortSelect.value = state.sort || 'new';

      applyState({ pushUrl: false, replaceUrl: true, note: '' });
    } catch (e) {
      setError(e?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  await init();
})();
