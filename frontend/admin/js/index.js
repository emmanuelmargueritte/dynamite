(async () => {
  try {
    const res = await fetch('/api/admin/auth/me', {
      credentials: 'include'
    });

    if (!res.ok) {
      window.location.href = '/admin/login.html';
      return;
    }

    const data = await res.json();

if (data && data.id) {
  window.location.href = '/admin/dashboard.html';
} else {
  window.location.href = '/admin/login.html';
}

  } catch (err) {
    window.location.href = '/admin/login.html';
  }
})();
