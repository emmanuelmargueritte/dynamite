// frontend/js/product.js
(async () => {
  const root = document.getElementById("product");
  if (!root) return;

  // -------------------------
  // ✅ URL helpers (SEO /p/slug-uuid)
  // -------------------------
  function getProductIdFromUrl() {
    // 1) priorité au querystring ?id=
    const params = new URLSearchParams(window.location.search);
    const qid = params.get("id");
    if (qid) return qid;

    // 2) sinon, extraire UUID à la fin du path /p/slug-<uuid>
    const m = window.location.pathname.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
    );
    return m ? m[1] : null;
  }

  function isSeoProductPath() {
    return /^\/p\//i.test(window.location.pathname);
  }

  function removeVariantFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("variant");
      if (isSeoProductPath()) url.searchParams.delete("id");
      window.history.replaceState({}, "", url.toString());
    } catch (_) {}
  }

  const params = new URLSearchParams(window.location.search);
  const pid = getProductIdFromUrl();
  const variantParam = params.get("variant");

  if (!pid) {
    root.appendChild(Ui.notice("err", "Produit introuvable (id manquant)."));
    return;
  }

  // -------------------------
  // Utils
  // -------------------------
  const uniq = (arr) => [...new Set((arr || []).filter(v => v !== null && v !== undefined && String(v).length))];

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function normalizeBulletPoints(bp) {
    if (bp === null || bp === undefined) return [];
    if (Array.isArray(bp)) return bp.map(x => String(x).trim()).filter(Boolean);
    if (typeof bp === "string") {
      try {
        const parsed = JSON.parse(bp);
        if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean);
      } catch (_) {
        return bp.split("\n").map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  }

  function setMetaDescription(text) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    const short = String(text || "").trim().slice(0, 155);
    if (short) meta.setAttribute("content", short);
  }

  function setCanonical(url) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", url);
  }

  function setJsonLd(schemaObj) {
    const existing = document.getElementById("pdp-jsonld");
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.id = "pdp-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schemaObj);
    document.head.appendChild(script);
  }

  function minPrice(variants, fallback = 0) {
    const prices = (variants || [])
      .map(v => Number(v?.price_xpf))
      .filter(n => Number.isFinite(n) && n > 0);
    if (!prices.length) return Number(fallback || 0);
    return Math.min(...prices);
  }

  // -------------------------
  // Cloudinary (fond blanc)
  // -------------------------
  const normalizeCloudinary = (url, transform) => {
    if (!url) return url;
    const marker = "/image/upload/";
    if (!url.includes(marker)) return url;

    const [base, tail] = url.split(marker);
    if (!tail) return url;

    const parts = tail.split("/");
    if (parts[0]?.startsWith("v")) return `${base}${marker}${transform}/${tail}`;
    parts[0] = transform;
    return `${base}${marker}${parts.join("/")}`;
  };

  const TRANSFORM_PDP_450 = "c_pad,g_center,w_450,h_600,b_rgb:ffffff,q_auto,f_auto";
  const TRANSFORM_PDP_900 = "c_pad,g_center,w_900,h_1200,b_rgb:ffffff,q_auto,f_auto";

  function setProductImage(imgEl, rawUrl, alt) {
    if (!imgEl) return;

    if (!rawUrl || !rawUrl.includes("/image/upload/")) {
      imgEl.removeAttribute("srcset");
      imgEl.removeAttribute("sizes");
      imgEl.src = rawUrl || "/assets/logo.svg";
      imgEl.alt = alt || "";
      return;
    }

    const src450 = normalizeCloudinary(rawUrl, TRANSFORM_PDP_450);
    const src900 = normalizeCloudinary(rawUrl, TRANSFORM_PDP_900);

    imgEl.src = src450;
    imgEl.srcset = `${src450} 450w, ${src900} 900w`;
    imgEl.sizes = "(max-width: 980px) 92vw, 420px";
    imgEl.alt = alt || "";
  }

  function prefetch900(rawUrl) {
    if (!rawUrl || !rawUrl.includes("/image/upload/")) return;
    const src900 = normalizeCloudinary(rawUrl, TRANSFORM_PDP_900);
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = src900;
  }

  // -------------------------
  // Swatches couleur (même mapping que shop)
  // -------------------------
  const COLOR_MAP = {
    noir: "#111111", black: "#111111",
    blanc: "#ffffff", white: "#ffffff",
    rouge: "#e11d48", red: "#e11d48",
    bleu: "#2563eb", blue: "#2563eb",
    vert: "#16a34a", green: "#16a34a",
    jaune: "#f59e0b", yellow: "#f59e0b",
    orange: "#f97316",
    rose: "#ec4899", pink: "#ec4899",
    violet: "#7c3aed", purple: "#7c3aed",
    gris: "#9ca3af", gray: "#9ca3af", grey: "#9ca3af",
    marron: "#8b5e34", brown: "#8b5e34",
    beige: "#d6c7a1",
    default: "#d1d5db"
  };

  const colorToHex = (name) => {
    const key = String(name || "").trim().toLowerCase();
    return COLOR_MAP[key] || null;
  };

  function renderSwatchesInto(el, colors, selectedColor) {
    if (!el) return;
    el.innerHTML = colors.map(c => {
      const hex = colorToHex(c);
      const isActive = String(c) === String(selectedColor);
      const showText = !hex;
      return `
        <button type="button"
          class="swatch ${isActive ? "is-active" : ""}"
          data-color="${escapeHtml(c)}"
          title="${escapeHtml(c)}"
          aria-pressed="${isActive ? "true" : "false"}">
          <span class="swatch-dot" style="${hex ? `background:${hex};` : ""}"></span>
          ${showText ? `<span class="swatch-text">${escapeHtml(c)}</span>` : ""}
        </button>
      `;
    }).join("");
  }

  function getActiveSwatchColor(swatchesEl) {
    const btn = swatchesEl?.querySelector(".swatch.is-active");
    return btn?.getAttribute("data-color") || null;
  }

  // -------------------------
  // API
  // -------------------------
  async function fetchProductById(id) {
    try {
      const res = await fetch(`/api/public/products/${encodeURIComponent(id)}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "ok" && data.product) return data.product;
    } catch (_) {}

    const res2 = await fetch(`/api/public/products`, { credentials: "include" });
    const data2 = await res2.json().catch(() => ({}));
    if (!res2.ok || data2.status !== "ok") throw new Error(data2?.error || "Impossible de charger le produit.");
    const p2 = (data2.products || []).find(p => String(p.id) === String(id));
    if (!p2) throw new Error("Produit introuvable.");
    return p2;
  }

  async function addToCart(variantId, quantity) {
    const res = await fetch("/api/cart/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ variant_id: variantId, quantity })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Impossible d’ajouter au panier.");
    return data;
  }

  function pickDefaultVariant(product) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) return null;

    if (product.default_variant_id) {
      const dv = variants.find(v => String(v.id) === String(product.default_variant_id));
      if (dv) return dv;
    }
    return variants.find(v => v.is_default) || variants[0] || null;
  }

  // -------------------------
  // Sticky bar (mobile)
  // -------------------------
  function createStickyBar() {
    const sticky = document.createElement("div");
    sticky.className = "pdp-sticky";
    sticky.innerHTML = `
      <div class="pdp-sticky-inner">
        <div class="pdp-sticky-left">
          <div class="pdp-sticky-price" data-sticky-price></div>
          <div class="pdp-sticky-sub" data-sticky-sub>Choisir une variante</div>
        </div>
        <button type="button" class="btn pdp-sticky-btn" data-sticky-add disabled>Ajouter</button>
      </div>
    `;
    document.body.appendChild(sticky);

    return {
      el: sticky,
      priceEl: sticky.querySelector("[data-sticky-price]"),
      subEl: sticky.querySelector("[data-sticky-sub]"),
      btn: sticky.querySelector("[data-sticky-add]")
    };
  }

  // -------------------------
  // UI helpers
  // -------------------------
  let DEFAULT_VARIANT_ID = null;

  function updateUrlVariant(productId, variantId) {
    try {
      const url = new URL(window.location.href);

      if (isSeoProductPath()) {
        url.searchParams.delete("id");
      } else {
        url.searchParams.set("id", productId);
      }

      if (!variantId || (DEFAULT_VARIANT_ID && String(variantId) === String(DEFAULT_VARIANT_ID))) {
        url.searchParams.delete("variant");
      } else {
        url.searchParams.set("variant", variantId);
      }

      window.history.replaceState({}, "", url.toString());
    } catch (_) {}
  }

  function renderCategoryBadges(product) {
    const cats = Array.isArray(product?.categories) ? product.categories : [];
    if (!cats.length) return null;

    const row = Ui.el("div", { class: "product-cats", style: "margin-top:10px;" }, []);
    cats.slice(0, 4).forEach(c => {
      const slug = String(c.slug || "").trim().toLowerCase();
      const name = c.name || slug;
      const btn = Ui.el("button", { type: "button", class: "cat-badge" }, [name]);

      btn.addEventListener("click", () => {
        if (!slug) return;
        window.location.href = `/shop.html?cat=${encodeURIComponent(slug)}`; // ✅ ABSOLU
      });

      row.appendChild(btn);
    });

    if (cats.length > 4) row.appendChild(Ui.el("span", { class: "cat-badge is-more" }, [`+${cats.length - 4}`]));
    return row;
  }

  function applySeo(product, variants) {
    const name = String(product?.name || "Produit").trim();
    const seoTitle = String(product?.seo_title || "").trim() || name;
    const seoDesc =
      String(product?.seo_description || "").trim() ||
      String(product?.description || "").trim() ||
      `${name} — disponible en plusieurs variantes.`;

    document.title = `${seoTitle} — Dynamite`;
    setMetaDescription(seoDesc);

    // Canonical : si SEO path => /p/... ; sinon construit un /product.html?id=
    const canonicalUrl = isSeoProductPath()
      ? `${window.location.origin}${window.location.pathname}`
      : `${window.location.origin}/product.html?id=${encodeURIComponent(product.id)}`;

    setCanonical(canonicalUrl);

    const bullets = normalizeBulletPoints(product?.bullet_points);
    const img = product?.image_url || null;
    const cats = Array.isArray(product?.categories) ? product.categories : [];
    const catNames = cats.map(c => c?.name).filter(Boolean);

    const colors = uniq(variants.map(v => v.color)).slice(0, 12);
    const sizes = uniq(variants.map(v => v.size)).slice(0, 12);

    const bestPrice = minPrice(variants, product.price_xpf ?? 0);

    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": name,
      "description": seoDesc,
      ...(img ? { "image": [img] } : {}),
      "brand": { "@type": "Brand", "name": "Dynamite" },
      ...(catNames.length ? { "category": catNames.join(" / ") } : {}),
      ...(bullets.length ? {
        "additionalProperty": bullets.slice(0, 10).map((b, i) => ({
          "@type": "PropertyValue",
          "name": `Point clé ${i + 1}`,
          "value": b
        }))
      } : {}),
      ...(colors.length ? { "color": colors.join(", ") } : {}),
      ...(sizes.length ? { "size": sizes.join(", ") } : {}),
      "offers": {
        "@type": "Offer",
        "priceCurrency": "XPF",
        "price": String(bestPrice || ""),
        "availability": "https://schema.org/InStock",
        "url": canonicalUrl
      }
    };

    setJsonLd(schema);
  }

  // -------------------------
  // Render page layout
  // -------------------------
  root.innerHTML = "";

  // ✅ FIX : lien absolu (évite /p/shop.html)
  root.appendChild(
    Ui.el("a", { href: "/shop.html", class: "small", style: "display:inline-block;margin:10px 0;" }, ["← Retour boutique"])
  );

  const grid = Ui.el("div", { class: "pdp-grid" }, []);
  root.appendChild(grid);

  const cardMedia = Ui.el("div", { class: "card" }, []);
  const cardPick  = Ui.el("div", { class: "card" }, []);
  const cardInfo  = Ui.el("div", { class: "card" }, []);
  grid.appendChild(cardMedia);
  grid.appendChild(cardPick);
  grid.appendChild(cardInfo);

  // MEDIA
  const imgWrap = Ui.el("div", { class: "media", style: "background:#f6f6f6;" }, []);
  const imgEl = Ui.el("img", {
    src: "/assets/logo.svg",
    alt: "",
    loading: "lazy",
    class: "product-image fallback"
  });
  imgWrap.appendChild(imgEl);

  const mediaContent = Ui.el("div", { class: "content" }, []);
  const titleEl = Ui.el("div", { class: "title" }, [""]);
  const metaEl = Ui.el("div", { class: "meta" }, [""]);
  const priceEl = Ui.el("div", { class: "price" }, [""]);
  const proLine = Ui.el("div", { class: "small", style: "margin-top:10px;" }, [
    "Livraison NC • Paiement sécurisé • Échanges faciles"
  ]);

  mediaContent.appendChild(titleEl);
  mediaContent.appendChild(metaEl);
  mediaContent.appendChild(priceEl);
  mediaContent.appendChild(proLine);

  cardMedia.appendChild(imgWrap);
  cardMedia.appendChild(mediaContent);

  // PICKER
  const pickContent = Ui.el("div", { class: "content" }, []);
  pickContent.appendChild(Ui.el("div", { class: "title" }, ["Choisir une variante"]));

  const genderRow = Ui.el("div", { class: "row", style: "justify-content:space-between; gap:10px; align-items:center;" }, [
    Ui.el("span", { class: "badge" }, ["Genre"]),
    Ui.el("select", { id: "gender", style: "min-width:170px;" }, [])
  ]);

  const colorRow = Ui.el("div", { class: "row", style: "justify-content:space-between; gap:10px; align-items:center;" }, [
    Ui.el("span", { class: "badge" }, ["Couleur"]),
    Ui.el("div", { class: "swatches", id: "swatches" }, [])
  ]);

  const sizeRow = Ui.el("div", { class: "row", style: "justify-content:space-between; gap:10px; align-items:center;" }, [
    Ui.el("span", { class: "badge" }, ["Taille"]),
    Ui.el("select", { id: "size", style: "min-width:170px;" }, [])
  ]);

  const qtyRow = Ui.el("div", { class: "row", style: "justify-content:space-between; gap:10px; align-items:center;" }, [
    Ui.el("span", { class: "badge" }, ["Quantité"]),
    // ✅ micro UX : number natif
    Ui.el("input", { id: "qty", type: "number", min: "1", step: "1", inputmode: "numeric", value: "1", style: "min-width:170px;" })
  ]);

  const stockRow = Ui.el("div", { class: "row", style: "justify-content:space-between; gap:10px; align-items:center;" }, [
    Ui.el("span", { class: "badge" }, ["Stock"]),
    Ui.el("div", { id: "stock", class: "badge" }, ["—"])
  ]);

  const addBtn = Ui.el("button", { id: "add", class: "btn", type: "button", disabled: true }, ["Ajouter"]);
  const msgEl = Ui.el("div", { id: "msg", class: "small" }, [""]);

  pickContent.appendChild(genderRow);
  pickContent.appendChild(colorRow);
  pickContent.appendChild(sizeRow);
  pickContent.appendChild(qtyRow);
  pickContent.appendChild(stockRow);
  pickContent.appendChild(Ui.el("hr", {}, []));
  pickContent.appendChild(addBtn);
  pickContent.appendChild(msgEl);

  cardPick.appendChild(pickContent);

  // INFO
  const infoContent = Ui.el("div", { class: "content" }, []);
  const infoTitle = Ui.el("div", { class: "title" }, ["Détails"]);
  const longDescEl = Ui.el("div", { class: "meta", style: "white-space:pre-line;" }, [""]);
  const bulletsWrap = Ui.el("div", {}, []);
  const seoMeta = Ui.el("div", { class: "small", style: "margin-top:10px; opacity:.85;" }, [""]);

  infoContent.appendChild(infoTitle);
  infoContent.appendChild(longDescEl);
  infoContent.appendChild(bulletsWrap);
  infoContent.appendChild(Ui.el("hr", {}, []));
  infoContent.appendChild(seoMeta);

  cardInfo.appendChild(infoContent);

  // Sticky (mobile)
  const sticky = createStickyBar();
  sticky.subEl.addEventListener("click", () => {
    try { cardPick.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) {}
  });

  // -------------------------
  // Boot
  // -------------------------
  try {
    const product = await fetchProductById(pid);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (!variants.length) throw new Error("Aucune variante disponible.");

    const requestedVariant = variantParam
      ? variants.find(v => String(v.id) === String(variantParam))
      : null;

    const defaultVariant = pickDefaultVariant(product);
    DEFAULT_VARIANT_ID = defaultVariant?.id || product.default_variant_id || null;

    if (variantParam && !requestedVariant) {
      removeVariantFromUrl();
    }

    let current = requestedVariant || defaultVariant;

    titleEl.textContent = product.name || "Produit";
    metaEl.textContent = product.description || "";
    priceEl.textContent = Ui.xpf(minPrice(variants, product.price_xpf ?? current?.price_xpf ?? 0));

    const catBadges = renderCategoryBadges(product);
    if (catBadges) mediaContent.insertBefore(catBadges, priceEl);

    const productImage = current?.image_url || product.image_url || "/assets/logo.svg";
    imgEl.className = (productImage && productImage !== "/assets/logo.svg") ? "product-image" : "product-image fallback";
    setProductImage(imgEl, productImage, product.name);
    prefetch900(productImage);

    applySeo(product, variants);

    const longDesc = String(product.long_description || "").trim();
    longDescEl.textContent = longDesc || (product.description ? String(product.description) : "—");

    const bullets = normalizeBulletPoints(product.bullet_points);
    if (bullets.length) {
      bulletsWrap.innerHTML = `
        <ul style="margin:12px 0 0; padding-left:18px; color: var(--muted); line-height:1.45;">
          ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}
        </ul>
      `;
    } else {
      const colors = uniq(variants.map(v => v.color)).filter(Boolean);
      const sizes = uniq(variants.map(v => v.size)).filter(Boolean);
      bulletsWrap.innerHTML = `
        <ul style="margin:12px 0 0; padding-left:18px; color: var(--muted); line-height:1.45;">
          ${colors.length ? `<li>Couleurs : <strong>${escapeHtml(colors.join(", "))}</strong></li>` : ""}
          ${sizes.length ? `<li>Tailles : <strong>${escapeHtml(sizes.join(", "))}</strong></li>` : ""}
          <li>Livraison : <strong>Nouvelle-Calédonie</strong></li>
          <li>Paiement : <strong>sécurisé</strong></li>
          <li>Échanges : <strong>faciles</strong> (voir CGV)</li>
        </ul>
      `;
    }

    seoMeta.textContent = `Fiche optimisée SEO (title + meta + canonical + JSON-LD).`;

    // refs
    const genderSel = genderRow.querySelector("#gender");
    const sizeSel = sizeRow.querySelector("#size");
    const swatchesEl = colorRow.querySelector("#swatches");
    const qtyInput = qtyRow.querySelector("#qty");
    const stockEl = stockRow.querySelector("#stock");

    const genders = () => uniq(variants.map(v => v.gender)).sort();
    const colorsForGender = (g) => uniq(variants.filter(v => String(v.gender) === String(g)).map(v => v.color)).sort();
    const sizesForGenderColor = (g, c) =>
      uniq(variants.filter(v => String(v.gender) === String(g) && String(v.color) === String(c)).map(v => v.size))
        .sort((a, b) => String(a).localeCompare(String(b)));

    const findVariant = (g, c, s) =>
      variants.find(v => String(v.gender) === String(g) && String(v.color) === String(c) && String(v.size) === String(s)) || null;

    function buildOptions(values, selected) {
      return values.map(v => {
        const sel = (String(v) === String(selected)) ? "selected" : "";
        return `<option value="${escapeHtml(v)}" ${sel}>${escapeHtml(v)}</option>`;
      }).join("");
    }

    function applyVisibility(gList, cList, sList) {
      genderRow.style.display = (gList.length <= 1) ? "none" : "";
      colorRow.style.display  = (cList.length <= 1) ? "none" : "";
      sizeRow.style.display   = (sList.length <= 1) ? "none" : "";
    }

    function variantLabel(v) {
      if (!v) return "Choisir une variante";
      const parts = [v.gender, v.color, v.size].filter(Boolean);
      return parts.length ? parts.join(" • ") : "Variante sélectionnée";
    }

    function syncSticky() {
      sticky.priceEl.textContent = Ui.xpf(minPrice(variants, product.price_xpf ?? current?.price_xpf ?? 0));
      sticky.subEl.textContent = variantLabel(current);
      sticky.btn.disabled = !current || addBtn.disabled;
    }

    function syncFromCurrent() {
      if (!current) {
        addBtn.disabled = true;
        addBtn.dataset.variant = "";
        stockEl.textContent = "—";
        setProductImage(imgEl, product.image_url || "/assets/logo.svg", product.name);
        updateUrlVariant(product.id, null);
        syncSticky();
        return;
      }

      addBtn.disabled = false;
      addBtn.dataset.variant = current.id;

      priceEl.textContent = Ui.xpf(minPrice([current], product.price_xpf ?? current.price_xpf ?? 0));

      const img = current.image_url || product.image_url || "/assets/logo.svg";
      imgEl.className = (img && img !== "/assets/logo.svg") ? "product-image" : "product-image fallback";
      setProductImage(imgEl, img, product.name);
      prefetch900(img);

      if (typeof current.stock === "number") {
        stockEl.textContent = current.stock > 0 ? `En stock (${current.stock})` : "Rupture de stock";
        addBtn.disabled = current.stock <= 0;
      } else {
        stockEl.textContent = "—";
      }

      updateUrlVariant(product.id, current.id);
      syncSticky();
    }

    function initSelectors() {
      const gList = genders();
      const g = current?.gender || gList[0] || "UNISEXE";
      genderSel.innerHTML = buildOptions(gList, g);

      const cList = colorsForGender(g);
      const c = (current && String(current.gender) === String(g) && cList.includes(current.color))
        ? current.color
        : (cList[0] || "DEFAULT");

      renderSwatchesInto(swatchesEl, cList, c);

      const sList = sizesForGenderColor(g, c);
      const s = (current && String(current.gender) === String(g) && String(current.color) === String(c) && sList.includes(current.size))
        ? current.size
        : (sList[0] || "M");

      sizeSel.innerHTML = buildOptions(sList, s);
      applyVisibility(gList, cList, sList);

      current = findVariant(g, c, s) || current;
      syncFromCurrent();
    }

    async function doAddToCart() {
      msgEl.textContent = "";
      const variantId = current?.id || addBtn.dataset.variant;
      if (!variantId) return;

      const qty = Number(String(qtyInput.value || "1").replace(",", "."));
      if (!Number.isInteger(qty) || qty <= 0) {
        msgEl.textContent = "Quantité invalide.";
        return;
      }

      const prevMain = addBtn.textContent;
      const prevSticky = sticky.btn.textContent;

      try {
        addBtn.disabled = true;
        sticky.btn.disabled = true;
        addBtn.textContent = "Ajout…";
        sticky.btn.textContent = "Ajout…";

        await addToCart(variantId, qty);
        window.dispatchEvent(new Event("cart:updated"));

        addBtn.textContent = "Ajouté ✓";
        sticky.btn.textContent = "Ajouté ✓";

        setTimeout(() => {
          addBtn.textContent = prevMain;
          sticky.btn.textContent = prevSticky;
          addBtn.disabled = false;
          syncSticky();
        }, 700);
      } catch (e) {
        console.error(e);
        addBtn.textContent = prevMain;
        sticky.btn.textContent = prevSticky;
        addBtn.disabled = false;
        syncSticky();
        msgEl.textContent = e.message || "Erreur lors de l’ajout.";
      }
    }

    initSelectors();

    genderSel.addEventListener("change", () => {
      const g = genderSel.value;
      const cList = colorsForGender(g);
      const nextColor = cList[0] || "DEFAULT";
      renderSwatchesInto(swatchesEl, cList, nextColor);

      const sList = sizesForGenderColor(g, nextColor);
      sizeSel.innerHTML = buildOptions(sList, sList[0] || "M");
      applyVisibility(genders(), cList, sList);

      current = findVariant(g, nextColor, sizeSel.value);
      syncFromCurrent();
    });

    swatchesEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".swatch");
      if (!btn) return;

      const g = genderSel.value;
      const color = btn.getAttribute("data-color");
      renderSwatchesInto(swatchesEl, colorsForGender(g), color);

      const sList = sizesForGenderColor(g, color);
      sizeSel.innerHTML = buildOptions(sList, sList[0] || "M");
      applyVisibility(genders(), colorsForGender(g), sList);

      current = findVariant(g, color, sizeSel.value);
      syncFromCurrent();
    });

    sizeSel.addEventListener("change", () => {
      const g = genderSel.value;
      const color = getActiveSwatchColor(swatchesEl) || (colorsForGender(g)[0] || "DEFAULT");
      current = findVariant(g, color, sizeSel.value);
      syncFromCurrent();
    });

    addBtn.addEventListener("click", doAddToCart);
    sticky.btn.addEventListener("click", doAddToCart);

    syncSticky();

  } catch (e) {
    root.appendChild(Ui.notice("err", e.message || "Erreur de chargement."));
  }
})();
