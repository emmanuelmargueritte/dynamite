(async () => {
  const $ = (id) => document.getElementById(id);

  const accentEl = $('accent');
  const bgEl = $('background');
  const textEl = $('text');
  const logoEl = $('logo_url');
  const storeNameEl = $('store_name');
  const ctaTextEl = $('cta_text');
  const ctaHrefEl = $('cta_href');
  const msgEl = $('msg');
  const form = $('appearance-form');
  const btnReset = $('btn-reset');

  const preview = $('preview');

  function setMsg(text, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = ok ? '' : '#c62828';
  }

  function applyPreviewTheme(theme) {
    if (!preview) return;
    const accent = theme?.accent || '#ff2d55';
    const bg = theme?.background || '#ffffff';
    const text = theme?.text || '#101223';

    preview.style.borderColor = 'rgba(16,18,35,.10)';
    preview.style.background = bg;
    preview.style.color = text;
    // petit clin d’œil : badge utilise l’accent
    const badge = preview.querySelector('.badge');
    if (badge) {
      badge.style.borderColor = accent;
      badge.style.boxShadow = '0 12px 28px rgba(16,18,35,.08)';
    }
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, { credentials: 'include', ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status !== 'ok') throw new Error(data?.error || data?.message || `Erreur API: ${url}`);
    return data;
  }

  async function load() {
    setMsg('Chargement…');
    const data = await fetchJson('/api/admin/settings');
    const s = data.settings || {};

    accentEl.value = s?.theme?.accent ?? '';
    bgEl.value = s?.theme?.background ?? '';
    textEl.value = s?.theme?.text ?? '';
    logoEl.value = s?.brand?.logo_url ?? '';
    storeNameEl.value = s?.brand?.store_name ?? '';
    ctaTextEl.value = s?.cta?.primary_text ?? '';
    ctaHrefEl.value = s?.cta?.primary_href ?? '';

    applyPreviewTheme(s.theme);
    setMsg('OK');
  }

  form?.addEventListener('input', () => {
    applyPreviewTheme({
      accent: accentEl.value,
      background: bgEl.value,
      text: textEl.value
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('Enregistrement…');

    const payload = {
      theme: {
        accent: accentEl.value || null,
        background: bgEl.value || null,
        text: textEl.value || null
      },
      brand: {
        logo_url: logoEl.value || '',
        store_name: storeNameEl.value || ''
      },
      cta: {
        primary_text: ctaTextEl.value || '',
        primary_href: ctaHrefEl.value || ''
      }
    };

    try {
      await fetchJson('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setMsg('Enregistré ✅');
    } catch (err) {
      setMsg(err?.message || 'Erreur', false);
    }
  });

  btnReset?.addEventListener('click', async () => {
  if (!confirm('Réinitialiser les réglages ?')) return;
  setMsg('Réinitialisation…');

  try {
    await fetchJson('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: { accent: '#ff2d55', background: '#f6f7fb', text: '#101223' },
        brand: { logo_url: '', store_name: 'Dynamite' },
        cta: { primary_text: 'Voir la boutique', primary_href: 'shop.html' }
      })
    });
    await load();
    setMsg('Réinitialisé ✅');
  } catch (err) {
    setMsg(err?.message || 'Erreur', false);
  }
});


  await load();
})();
