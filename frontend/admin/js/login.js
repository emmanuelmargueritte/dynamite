// frontend/admin/js/login.js
(async function () {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('error');

  if (!form || !errorEl) return;

  function showError(msg) {
    errorEl.textContent = msg || '';
    // on force l'affichage sans toucher au CSS global
    errorEl.style.display = msg ? 'block' : 'none';
  }

  function clearError() {
    showError('');
  }

  // Cache l'erreur au chargement
  clearError();

  // Clear error dès que l'utilisateur tape
  document.getElementById('email')?.addEventListener('input', clearError);
  document.getElementById('password')?.addEventListener('input', clearError);

  let csrfToken = null;

  async function fetchCsrfToken() {
    const res = await fetch('/api/admin/auth/csrf-token', {
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.csrfToken) throw new Error('CSRF token missing');
    csrfToken = data.csrfToken;
    return csrfToken;
  }

  // Récupération CSRF au chargement
  try {
    await fetchCsrfToken();
  } catch (err) {
    showError('Erreur CSRF');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const email = String(document.getElementById('email')?.value || '').trim();
    const password = String(document.getElementById('password')?.value || '');

    // ✅ Feedback immédiat (minimal & pro)
    if (!email || !password) {
      showError('Merci de renseigner un email et un mot de passe.');
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      showError('Email invalide.');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (!csrfToken) await fetchCsrfToken();

      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.status === 'error') {
  const raw = String(data?.error || data?.message || '').trim();

  // ✅ mapping minimal (propre)
  if (/invalid credentials/i.test(raw)) {
    showError('Email ou mot de passe incorrect.');
  } else {
    showError(raw || 'Email ou mot de passe incorrect.');
  }
  return;
}


      window.location.href = '/admin/dashboard.html';
    } catch (err) {
      showError('Erreur serveur');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();
