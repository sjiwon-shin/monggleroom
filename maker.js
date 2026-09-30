/* 도트홈 — 캐릭터 만들기 위젯
   사용법:  const m = Maker.mount(요소, { value: "2:0.0.0...", onChange: code => {...} });
            m.get() / m.set(code)                                                        */
(function () {
  "use strict";
  const KINDS = [
    { id: "hair",    label: "헤어", field: "h" },
    { id: "face",    label: "얼굴", field: "f" },
    { id: "cloth",   label: "옷",   field: "c" },
    { id: "glasses", label: "안경", field: "g" },
    { id: "hat",     label: "모자", field: "t" }
  ];
  const COLORS = [
    { label: "머리색", field: "hc", list: () => AV.HAIR },
    { label: "피부",   field: "sk", list: () => AV.SKIN },
    { label: "옷색",   field: "cc", list: () => AV.CLOTH }
  ];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /* 조합 결과에서 보여줄 부분을 잘라 작은 캔버스에 그립니다 */
  function thumb(code, kind) {
    const c = el("canvas"), sprite = AV.compose(code);
    const size = kind === "cloth" ? [90, 160] : kind === "hair" ? [120, 120] : [120, 100];
    c.width = size[0]; c.height = size[1];
    if (!sprite) return c;
    let sx = 0, sy = 0, sw = sprite.width, sh = sprite.height;
    if (kind === "hair") sh = Math.round(sprite.height * 0.5);
    else if (kind !== "cloth" && AV.PARTS.facebox) {
      const fb = AV.PARTS.facebox, pad = 5;
      sx = Math.max(0, fb[0] - sprite.ox - pad); sy = Math.max(0, fb[1] - sprite.oy - pad);
      sw = Math.min(sprite.width - sx, fb[2] - fb[0] + pad * 2); sh = Math.min(sprite.height - sy, fb[3] - fb[1] + pad * 2);
    }
    let k = Math.min(c.width / sw, c.height / sh); if (k >= 1) k = Math.floor(k);
    const g = c.getContext("2d"); g.imageSmoothingEnabled = k < 1;
    const dw = Math.round(sw * k), dh = Math.round(sh * k);
    g.drawImage(sprite, sx, sy, sw, sh, Math.round((c.width - dw) / 2), kind === "cloth" ? c.height - dh : Math.round((c.height - dh) / 2), dw, dh);
    return c;
  }

  function mount(root, opts) {
    opts = opts || {};
    let code = AV.isCode(opts.value) ? opts.value : null, tab = "hair";
    root.innerHTML = "";
    const prevBox = el("div", "mk-prev"), prev = el("canvas"); prevBox.appendChild(prev);
    const tabs = el("div", "mk-tabs"), grid = el("div", "mk-grid"), colors = el("div");
    const rand = el("button", "mk-rand", "아무거나 골라줘"); rand.type = "button";
    root.append(prevBox, tabs, grid, colors, rand);

    const usable = kind => (AV.PARTS[kind.id] || []).map((p, i) => ({ p, i })).filter(e => !e.p.couple);
    const kinds = KINDS.filter(k => usable(k).length > 1);
    kinds.forEach(k => {
      const b = el("button", null, k.label); b.type = "button";
      b.onclick = () => { tab = k.id; paint(); };
      k.button = b; tabs.appendChild(b);
    });
    COLORS.forEach(c => {
      const row = el("div", "mk-color"), box = el("div");
      row.append(el("span", null, c.label), box);
      c.list().forEach((hex, i) => {
        const b = el("button"); b.type = "button"; b.style.background = hex; b.setAttribute("aria-label", c.label + " " + (i + 1));
        b.onclick = () => change(c.field, i);
        box.appendChild(b);
      });
      c.box = box; colors.appendChild(row);
    });
    rand.onclick = () => { code = AV.random(); paint(); emit(); };

    function emit() { if (opts.onChange) opts.onChange(code); }
    function change(field, value) { const o = AV.parse(code); o[field] = value; code = AV.make(o); paint(); emit(); }

    function paint() {
      if (!code) return;
      const o = AV.parse(code), sprite = AV.compose(code);
      if (sprite) {
        const k = Math.max(1, Math.floor(Math.min(360 / sprite.width, 380 / sprite.height)));
        prev.width = sprite.width * k + 16; prev.height = sprite.height * k + 16;
        const g = prev.getContext("2d"); g.imageSmoothingEnabled = false;
        g.clearRect(0, 0, prev.width, prev.height);
        g.drawImage(sprite, 8, 8, sprite.width * k, sprite.height * k);
      }
      kinds.forEach(k => k.button.setAttribute("aria-pressed", String(k.id === tab)));
      COLORS.forEach(c => [...c.box.children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === o[c.field]))));
      const kind = kinds.find(k => k.id === tab) || kinds[0];
      grid.innerHTML = ""; grid.classList.toggle("wide", kind.id === "cloth");
      usable(kind).forEach(({ p, i }) => {
        const b = el("button"); b.type = "button"; b.title = p.n; b.setAttribute("aria-label", p.n);
        b.setAttribute("aria-pressed", String(o[kind.field] === i));
        const q = Object.assign({}, o); q[kind.field] = i;
        b.appendChild(thumb(AV.make(q), kind.id));
        b.onclick = () => change(kind.field, i);
        grid.appendChild(b);
      });
    }

    AV.ready().then(() => { if (!code) { code = AV.random(); emit(); } paint(); });
    return { get: () => code, set: v => { if (AV.isCode(v)) { code = v; paint(); } } };
  }

  window.Maker = { mount };
})();
