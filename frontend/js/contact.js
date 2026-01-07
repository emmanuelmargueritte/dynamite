// frontend/js/contact.js
(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Message envoyé ✅ (formulaire en cours de branchement)');
  });
})();
