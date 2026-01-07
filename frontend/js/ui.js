const Ui = (() => {
  const xpf = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0 XPF";
    return `${Math.trunc(v)} XPF`;
  };

  const qs = (sel, root = document) => root.querySelector(sel);

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("aria-")) node.setAttribute(k, v);
      else node.setAttribute(k, v);
    }
    for (const c of children) {
  if (c === null || c === undefined) continue;
  node.appendChild(
    typeof c === "string" || typeof c === "number"
      ? document.createTextNode(c)
      : c
  );
}

    return node;
  };

  const notice = (kind, text) => {
    const div = el("div", { class: `notice ${kind}` }, [text]);
    return div;
  };

  return { xpf, qs, el, notice };
})();
