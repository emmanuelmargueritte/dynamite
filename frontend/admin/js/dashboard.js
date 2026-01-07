(async () => {
  try {
    // Vérifier que l'admin est bien connecté
    const res = await fetch('/api/admin/auth/me', {
      credentials: 'include'
    });

    if (!res.ok) {
      window.location.href = '/admin/login.html';
      return;
    }

    const data = await res.json();

   if (!data || !data.id) {
  window.location.href = '/admin/login.html';
  return;
}


  } catch (err) {
    window.location.href = '/admin/login.html';
    return;
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (err) {
        // même en cas d'erreur, on force la sortie
      }

      window.location.href = '/admin/login.html';
    });
  }
})();
