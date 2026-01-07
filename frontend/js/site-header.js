(async function () {
  const mount = document.getElementById('site-header');
  if (!mount) return;

  const DEFAULTS = {
    brand: {
      store_name: 'Dynamite',
      logo_url: '/assets/dynamite-logo.png'
    },
    theme: {
      accent: null,
      background: null,
      text: null
    }
  };

  async function fetchSettings() {
    try {
      const res = await fetch('/api/public/settings', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'ok') return null;
      return data.settings || null;
    } catch (_) {
      return null;
    }
  }

  function applyThemeVars(settings) {
    const root = document.documentElement;
    const theme = settings?.theme || {};
    if (theme.accent) root.style.setProperty('--accent', theme.accent);
    if (theme.background) root.style.setProperty('--bg', theme.background);
    if (theme.text) root.style.setProperty('--text', theme.text);
  }

  function pickStoreName(settings) {
    return String(settings?.brand?.store_name || DEFAULTS.brand.store_name).trim() || DEFAULTS.brand.store_name;
  }

  function pickLogoUrl(settings) {
    return String(settings?.brand?.logo_url || DEFAULTS.brand.logo_url).trim() || DEFAULTS.brand.logo_url;
  }

  // 1) injecte le header immédiatement (fallback “SEO-friendly” + pas d’attente)
  mount.innerHTML = `
    <header class="site-header">
      <div class="site-header-inner">
        <a href="/index.html" class="brand" aria-label="${DEFAULTS.brand.store_name}">
          <img
            data-store-logo
            src="${DEFAULTS.brand.logo_url}"
            alt="${DEFAULTS.brand.store_name}"
            loading="eager"
          >
        </a>

        <nav class="site-nav" aria-label="Navigation principale">
          <a href="/index.html">Accueil</a>
          <a href="/shop.html">Boutique</a>
          <a href="/cart.html" class="nav-cart">
            Panier <span id="cart-badge" class="cart-badge" hidden>0</span>
          </a>
          <a href="/contact.html">Contact</a>
        </nav>
      </div>
    </header>
  `;

  const badge = document.getElementById('cart-badge');
  const brandLink = mount.querySelector('.brand');
  const brandLogo = mount.querySelector('[data-store-logo]');

  // 2) charge settings + applique thème + logo + nom (sans dépendre d’un autre script)
  const settings = await fetchSettings();
  if (settings) {
    applyThemeVars(settings);

    const storeName = pickStoreName(settings);
    const logoUrl = pickLogoUrl(settings);

    if (brandLink) brandLink.setAttribute('aria-label', storeName);
    if (brandLogo) {
      brandLogo.src = logoUrl;
      brandLogo.alt = storeName;
    }

    // Optionnel : si tu as d’autres endroits qui doivent afficher le nom
    document.querySelectorAll('[data-store-name]').forEach(el => {
      el.textContent = storeName;
    });
  }

  async function refreshBadge() {
    if (!badge) return;

    try {
      const res = await fetch('/api/cart', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data?.items) ? data.items : [];
      const qty = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

      if (qty > 0) {
        badge.hidden = false;
        badge.textContent = String(qty);
      } else {
        badge.hidden = true;
        badge.textContent = '0';
      }
    } catch (_) {}
  }

  await refreshBadge();
  window.addEventListener('cart:updated', refreshBadge);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshBadge();
  });
})();
