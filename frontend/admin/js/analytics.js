async function loadAnalyticsView() {
  try {
    const res = await fetch('/api/admin/analytics', {
      credentials: 'include',
    });

    if (!res.ok) {
      console.error('Analytics API error');
      return;
    }

    const data = await res.json();

    // KPI commandes & conversion
    document.getElementById('stat-orders').textContent =
      data.orders ?? '—';

    document.getElementById('stat-conversion').textContent =
      data.conversion_checkout_pct
        ? `${data.conversion_checkout_pct}%`
        : '—';

    // KPI CA
    if (data.revenue) {
      document.getElementById('stat-ca-total').textContent =
        data.revenue.ca_total.toLocaleString('fr-FR') + ' XPF';

      document.getElementById('stat-ca-month').textContent =
        data.revenue.ca_month.toLocaleString('fr-FR') + ' XPF';

      document.getElementById('stat-ca-7d').textContent =
        data.revenue.ca_7d.toLocaleString('fr-FR') + ' XPF';

      document.getElementById('stat-panier').textContent =
        data.revenue.panier_moyen.toLocaleString('fr-FR') + ' XPF';
    }

    // Tunnel
    const funnelTbody = document.getElementById('funnel-table');
    funnelTbody.innerHTML = '';
    (data.funnel || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.funnel_step}</td><td>${row.count}</td>`;
      funnelTbody.appendChild(tr);
    });

    // Pages vues
    const pagesTbody = document.getElementById('pages-table');
    pagesTbody.innerHTML = '';
    (data.pages || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.page}</td><td>${row.views}</td>`;
      pagesTbody.appendChild(tr);
    });

    // Top produits
    const topTbody = document.getElementById('top-products-table');
    topTbody.innerHTML = '';
    (data.top_products || []).forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.name}</td>
        <td>${p.quantity}</td>
        <td>${p.ca.toLocaleString('fr-FR')} XPF</td>
      `;
      topTbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Analytics load failed', err);
  }
}

loadAnalyticsView();

// 🧠 Aide analytics (modal)
const helpBtn = document.getElementById('analyticsHelpBtn');
const helpOverlay = document.getElementById('analyticsHelpOverlay');
const helpPanel = document.getElementById('analyticsHelpPanel');
const helpClose = document.getElementById('analyticsHelpClose');

function openHelp() {
  helpOverlay.classList.remove('hidden');
  helpPanel.classList.remove('hidden');
}

function closeHelp() {
  helpOverlay.classList.add('hidden');
  helpPanel.classList.add('hidden');
}

if (helpBtn) helpBtn.addEventListener('click', openHelp);
if (helpOverlay) helpOverlay.addEventListener('click', closeHelp);
if (helpClose) helpClose.addEventListener('click', closeHelp);

