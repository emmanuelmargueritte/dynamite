(async () => {
  const catsRow = document.getElementById('home-cats-row');
  const productsGrid = document.getElementById('home-products');
  const loadingEl = document.getElementById('home-loading');
  const errorEl = document.getElementById('home-error');
  const currencyEl = document.getElementById('home-currency');
  const storeNameEl = document.getElementById('home-store-name');

  const selectionTitleEl = document.getElementById('home-selection-title');
  const DEFAULT_SELECTION_TITLE = selectionTitleEl?.textContent || 'Sélection du moment';

  // ✅ HOME: limite visuelle
  const HOME_LIMIT = 6;

  // ✅ micro-style badge (local home) — même famille visuelle
  (function injectFeaturedBadgeStyleOnce(){
    if (document.getElementById('home-featured-style')) return;
    const st = document.createElement('style');
    st.id = 'home-featured-style';
    st.textContent = `
      .home-featured-badge,
      .home-new-badge{
        position:absolute;
        top:10px; left:10px;
        z-index:2;
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:7px 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:900;
        letter-spacing:.2px;
        color: var(--text);
        background:
          linear-gradient(135deg, rgba(255,45,85,.16), rgba(47,107,255,.12)),
          rgba(255,255,255,.86);
        border: 1px solid rgba(255,45,85,.22);
        box-shadow: 0 12px 28px rgba(16,18,35,.10);
        backdrop-filter: blur(7px);
      }
      .home-featured-badge svg,
      .home-new-badge svg{ opacity:.92 }

      /* Variation “Nouveauté” : même style, teinte plus “fresh” */
      .home-new-badge{
        background:
          linear-gradient(135deg, rgba(47,107,255,.16), rgba(0,200,150,.10)),
          rgba(255,255,255,.86);
        border: 1px solid rgba(47,107,255,.22);
      }
    `;
    document.head.appendChild(st);
  })();

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function formatXpf(n) {
    return `${Number(n || 0).toLocaleString('fr-FR')} XPF`;
  }

  function priceOf(product) {
    const vars = Array.isArray(product?.variants) ? product.variants : [];
    const prices = vars.map(v => Number(v?.price_xpf ?? NaN)).filter(n => Number.isFinite(n));
    if (!prices.length) return Number(product?.price_xpf ?? 0);
    return Math.min(...prices);
  }

  function pickImage(product) {
    return product?.image_url || product?.image || '';
  }

  function badgeHtml(type) {
    if (type === 'featured') {
      return `
        <span class="home-featured-badge" aria-label="Sélection du moment">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path>
          </svg>
          Sélection
        </span>
      `;
    }

    if (type === 'new') {
      return `
        <span class="home-new-badge" aria-label="Nouveauté">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2v6"></path>
            <path d="M12 16v6"></path>
            <path d="M2 12h6"></path>
            <path d="M16 12h6"></path>
            <path d="M6 6l4 4"></path>
            <path d="M18 6l-4 4"></path>
            <path d="M6 18l4-4"></path>
            <path d="M18 18l-4-4"></path>
          </svg>
          Nouveauté
        </span>
      `;
    }

    return '';
  }

  function renderProductCard(p, opts = {}) {
    const badgeType =
      opts.badge ||
      (p?.is_featured ? 'featured' : '');

    const id = encodeURIComponent(String(p?.id || ''));
    const name = escapeHtml(p?.name || 'Produit');
    const img = pickImage(p);
    const price = priceOf(p);

    const desc = (p?.seo_description || p?.description || '').trim();
    const descHtml = desc ? escapeHtml(desc).slice(0, 140) : '&nbsp;';

    return `
      <article class="card">
        <a class="media" href="product.html?id=${id}" style="background:#f6f6f6; position:relative;">
          ${badgeHtml(badgeType)}
          ${
            img
              ? `<img class="product-image" src="${escapeHtml(img)}" alt="${name}" loading="lazy" />`
              : `<img class="product-image fallback" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='426'%3E%3Crect width='100%25' height='100%25' fill='%23f2f3f8'/%3E%3Ctext x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' fill='%238a90aa' font-family='Arial' font-size='14'%3EImage%3C/text%3E%3C/svg%3E" alt="${name}" />`
          }
        </a>

        <div class="content">
          <a class="title" href="product.html?id=${id}">${name}</a>
          <div class="meta">${descHtml}</div>

          <div class="row" style="gap:10px; align-items:center; margin-top:10px;">
            <span class="price">${formatXpf(price)}</span>
            <a class="btn" href="product.html?id=${id}" style="margin-left:auto;">Voir</a>
          </div>
        </div>
      </article>
    `;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'ok') throw new Error(data?.error || `Erreur API: ${url}`);
    return data;
  }

  async function initStore() {
    try {
      const data = await fetchJson('/api/public/store');
      if (storeNameEl && data?.name) storeNameEl.textContent = data.name;
      if (currencyEl && data?.currency) currencyEl.textContent = `Prix en ${data.currency}`;
    } catch {}
  }

  async function initCategories() {
    if (!catsRow) return;
    try {
      const data = await fetchJson('/api/public/categories');
      const cats = Array.isArray(data.categories) ? data.categories : [];

      const html = cats.map(c => {
        const slug = encodeURIComponent(String(c?.slug || '').trim().toLowerCase());
        const name = escapeHtml(c?.name || c?.slug || '');
        if (!slug || !name) return '';
        return `<a class="shop-cat" href="shop.html?cat=${slug}">${name}</a>`;
      }).join('');

      catsRow.insertAdjacentHTML('beforeend', html);
    } catch (e) {
      console.warn('[home] categories error:', e?.message || e);
    }
  }

  function setHomeSelectionTitle(mode) {
    if (!selectionTitleEl) return;

    if (mode === 'featured') {
      selectionTitleEl.textContent = DEFAULT_SELECTION_TITLE || 'Sélection du moment';
      return;
    }
    if (mode === 'new') {
      selectionTitleEl.textContent = 'Nouveautés';
      return;
    }
    selectionTitleEl.textContent = DEFAULT_SELECTION_TITLE || 'Sélection du moment';
  }

  // ✅ combine featured + newest (non-featured) to reach limit, en marquant les badges
  function mergeFeaturedWithNew(featured, allProducts, limit) {
    const out = [];
    const seen = new Set();

    for (const p of (Array.isArray(featured) ? featured : [])) {
      const id = String(p?.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ p, badge: 'featured' });
      if (out.length >= limit) return out;
    }

    for (const p of (Array.isArray(allProducts) ? allProducts : [])) {
      const id = String(p?.id || '');
      if (!id || seen.has(id)) continue;
      if (p?.is_featured === true) continue; // déjà gérés au début
      seen.add(id);
      out.push({ p, badge: 'new' });
      if (out.length >= limit) return out;
    }

    return out;
  }

  async function initProducts() {
    if (!productsGrid) return;
    if (loadingEl) loadingEl.style.display = '';
    if (errorEl) errorEl.style.display = 'none';

    try {
      let featured = [];
      let mode = 'featured';

      // 1) récupère featured
      try {
        const featuredData = await fetchJson(`/api/public/featured?limit=${HOME_LIMIT}`);
        featured = Array.isArray(featuredData.products) ? featuredData.products : [];
      } catch (e) {
        console.warn('[home] featured route failed:', e?.message || e);
      }

      // 2) si 0 featured => mode Nouveautés (tous badgés "Nouveauté")
      if (!featured.length) {
        const data = await fetchJson('/api/public/products');
        const products = Array.isArray(data.products) ? data.products : [];
        const selection = products.slice(0, HOME_LIMIT);

        mode = 'new';
        setHomeSelectionTitle(mode);

        productsGrid.innerHTML = selection
          .map(p => renderProductCard(p, { badge: 'new' }))
          .join('');

        if (loadingEl) loadingEl.style.display = 'none';
        return;
      }

      // 3) featured existe => titre "Sélection", et on complète avec nouveautés si besoin
      mode = 'featured';
      setHomeSelectionTitle(mode);

      let rendered = [];
      if (featured.length >= HOME_LIMIT) {
        rendered = featured.slice(0, HOME_LIMIT).map(p => ({ p, badge: 'featured' }));
      } else {
        const data = await fetchJson('/api/public/products');
        const products = Array.isArray(data.products) ? data.products : [];
        rendered = mergeFeaturedWithNew(featured, products, HOME_LIMIT);
      }

      productsGrid.innerHTML = rendered
        .map(({ p, badge }) => renderProductCard(p, { badge }))
        .join('');

      if (loadingEl) loadingEl.style.display = 'none';
    } catch (e) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.textContent = e?.message || 'Impossible de charger la sélection.';
        errorEl.style.display = '';
      }
      setHomeSelectionTitle('default');
    }
  }

  await initStore();
  await initCategories();
  await initProducts();
})();
