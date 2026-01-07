// frontend/js/settings.js
(async () => {
  try {
    const res = await fetch('/api/public/settings', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok || data.status !== 'ok') return;

    const s = data.settings || {};
    const root = document.documentElement;

    // 🎨 Couleurs
    if (s.theme?.accent) root.style.setProperty('--accent', s.theme.accent);
    if (s.theme?.background) root.style.setProperty('--bg', s.theme.background);
    if (s.theme?.text) root.style.setProperty('--text', s.theme.text);

    // 🏷️ Nom boutique
    if (s.brand?.store_name) {
      document.querySelectorAll('[data-store-name]').forEach(el => {
        el.textContent = s.brand.store_name;
      });
    }

    // 🖼️ Logo
    if (s.brand?.logo_url) {
      document.querySelectorAll('[data-store-logo]').forEach(img => {
        img.src = s.brand.logo_url;
        img.style.display = '';
      });
    }

  } catch (err) {
    console.warn('[settings] load failed:', err);
  }
})();
