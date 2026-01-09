(async () => {
  // ✅ Guard global: si pas connecté => redirection login
  async function requireAdminSession() {
    if (window.location.pathname.includes('/admin/login')) return true;

    try {
      const res = await fetch('/api/admin/auth/me', {
        credentials: 'include'
      });

      if (!res.ok) {
        window.location.href = '/admin/login.html';
        return false;
      }

      const data = await res.json().catch(() => ({}));
      if (!data || !data.id) {
        window.location.href = '/admin/login.html';
        return false;
      }

      return true;
    } catch {
      window.location.href = '/admin/login.html';
      return false;
    }
  }

  const ok = await requireAdminSession();
  if (!ok) return;

  try {
    // 🔹 Charger le header admin
    const res = await fetch('/admin/partials/admin-header.html', {
      credentials: 'include'
    });

    if (!res.ok) return;

    const html = await res.text();
    const container = document.getElementById('admin-header');
    if (!container) return;

    container.innerHTML = html;

    // ============================
    // 📊 Analytics → navigation
    // ============================
    const analyticsBtn = document.getElementById('adminAnalytics');
    if (analyticsBtn) {
      analyticsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/admin/analytics.html';
      });
    }

    // ============================
    // 🔐 Logout
    // ============================
    const logoutBtn = document.getElementById('adminLogout');

    async function getCsrfToken() {
      const tRes = await fetch('/api/admin/auth/csrf-token', {
        credentials: 'include'
      });

      if (!tRes.ok) throw new Error('CSRF token fetch failed');

      const data = await tRes.json();
      if (!data || !data.csrfToken) throw new Error('CSRF token missing');

      return data.csrfToken;
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        try {
          const csrfToken = await getCsrfToken();

          await fetch('/api/admin/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'X-CSRF-Token': csrfToken
            }
          });
        } catch (err) {
          console.error('Logout failed:', err);
        }

        window.location.href = '/admin/login.html';
      });
    }

  } catch (err) {
    console.error('Admin header load failed', err);
  }
})();
