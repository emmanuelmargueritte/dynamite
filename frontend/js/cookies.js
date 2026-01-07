(() => {
  const KEY = "dynamite_cookie_consent_v1";
  const now = () => Date.now();

  const get = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (!v || typeof v !== "object") return null;
      return v;
    } catch {
      return null;
    }
  };

  const set = (choice) => {
    localStorage.setItem(KEY, JSON.stringify({ choice, ts: now() }));
  };

  const createBanner = () => {
    const banner = document.createElement("div");
    banner.className = "cookieBanner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Préférences cookies");

    banner.innerHTML = `
      <div class="row">
        <div>
          <strong>Cookies</strong>
          <p class="small">
            Nous utilisons des cookies strictement nécessaires au fonctionnement du site
            (panier, sécurité). Les cookies de mesure d’audience sont optionnels.
            Consultez la <a href="politique-cookies.html">politique cookies</a>.
          </p>
        </div>
        <div class="actions">
          <button class="secondary" type="button" id="cookie-refuse">Refuser</button>
          <button type="button" id="cookie-accept">Accepter</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    banner.querySelector("#cookie-refuse").addEventListener("click", () => {
      set("refused");
      banner.style.display = "none";
    });

    banner.querySelector("#cookie-accept").addEventListener("click", () => {
      set("accepted");
      banner.style.display = "none";
    });

    return banner;
  };

  const boot = () => {
    const consent = get();
    if (consent) return;
    const banner = createBanner();
    banner.style.display = "block";
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
