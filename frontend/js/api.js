// API helper (vanilla)
// - cookies sessions: credentials "include"
// - CSRF token: GET /api/auth/csrf then header X-CSRF-Token on writes

const Api = (() => {
  let csrfTokenCache = undefined;

  const baseHeaders = () => ({
    "Content-Type": "application/json"
  });

  const getCsrfToken = async () => {
    if (csrfTokenCache !== undefined) return csrfTokenCache;

    const r = await fetch("/api/auth/csrf", {
      method: "GET",
      credentials: "include"
    });

    if (!r.ok) {
      csrfTokenCache = null;
      return csrfTokenCache;
    }

    const data = await r.json();
    csrfTokenCache = data.csrfToken ?? null;
    return csrfTokenCache;
  };

  const request = async (path, { method = "GET", body, csrf = false } = {}) => {
    const opts = {
      method,
      credentials: "include",
      headers: baseHeaders()
    };

    if (body !== undefined) opts.body = JSON.stringify(body);

    if (csrf) {
      const token = await getCsrfToken();
      if (token) opts.headers["X-CSRF-Token"] = token;
    }

    const r = await fetch(path, opts);
    const ct = r.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const payload = isJson ? await r.json() : await r.text();

    if (!r.ok) {
      const msg = isJson ? (payload?.error || "Erreur API") : "Erreur API";
      const err = new Error(msg);
      err.status = r.status;
      err.payload = payload;

console.log("API FAIL", {
  url: r.url,
  status: r.status,
  statusText: r.statusText,
  isJson,
  payload
});

      throw err;
    }

    return payload;
  };

  return {
    getCsrfToken,
    request
  };
})();
