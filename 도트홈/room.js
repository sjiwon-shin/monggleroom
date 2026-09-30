/* 도트홈 — 방 그리기와 걸어다니는 캐릭터
   사용법:  const room = Room.mount(canvas, { theme: "mint", onPick: actor => {...} });
            room.setTheme("night");
            room.setActors([{ key, name, avatar, message, owner }]);                  */
(function () {
  "use strict";
  const VW = 180, VH = 110;                 // 방 크기 (도트 단위)
  const FLOOR_Y = 62;                       // 벽과 바닥의 경계
  const WALK = { x0: 16, x1: 164, y0: 80, y1: 106 };

  const THEMES = {
    mint:  { name: "민트",   wall: "#CFEDE4", wall2: "#BFE3D8", trim: "#F7F3EA", floor: "#E8C9A0", floor2: "#DDBB8E", rug: "#F28F79", rug2: "#F7B6A6", sky: "#BDE3F5", wood: "#9A6B47", bed: "#5BA8A0", leaf: "#4C9F70" },
    peach: { name: "피치",   wall: "#FBDCCB", wall2: "#F6CDB8", trim: "#FFF8F0", floor: "#D9B48A", floor2: "#CCA67B", rug: "#7FB6D9", rug2: "#B4D6EC", sky: "#FFE3B8", wood: "#8B5E3C", bed: "#E58A7B", leaf: "#5FA36A" },
    night: { name: "나이트", wall: "#3B4468", wall2: "#343C5D", trim: "#565F86", floor: "#5B4A58", floor2: "#52424F", rug: "#E0B84E", rug2: "#EBD08A", sky: "#1E2440", wood: "#3A2E3D", bed: "#7A6BC2", leaf: "#4C8F78" },
    wood:  { name: "우드",   wall: "#EFE3C9", wall2: "#E6D8BA", trim: "#FFFDF6", floor: "#B98A5A", floor2: "#AC7D4F", rug: "#4F7F62", rug2: "#7FA78C", sky: "#CDE9F0", wood: "#6E4A2E", bed: "#C8553D", leaf: "#3F8A5A" }
  };

  function mount(canvas, opts) {
    opts = opts || {};
    const g = canvas.getContext("2d");
    let S = 3, theme = THEMES[opts.theme] || THEMES.mint, back = null;
    let actors = [], raf = 0, last = performance.now(), alive = true;

    const px = (x, y, w, h, c) => { bg.fillStyle = c; bg.fillRect(x * S, y * S, w * S, h * S); };
    let bg = g;

    function resize() {
      const cssW = canvas.clientWidth || canvas.parentNode.clientWidth || 360;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const next = Math.max(2, Math.floor(cssW * dpr / VW));
      if (next === S && back) return;
      S = next; canvas.width = VW * S; canvas.height = VH * S; back = null;
    }

    /* 방 배경을 한 번만 그려서 재사용 */
    function paintBack() {
      back = document.createElement("canvas"); back.width = canvas.width; back.height = canvas.height;
      bg = back.getContext("2d");
      const T = theme;
      px(0, 0, VW, FLOOR_Y, T.wall);
      for (let x = 6; x < VW; x += 12) px(x, 0, 1, FLOOR_Y - 3, T.wall2);            // 벽지 줄무늬
      px(0, FLOOR_Y - 3, VW, 3, T.trim);                                             // 걸레받이
      px(0, FLOOR_Y, VW, VH - FLOOR_Y, T.floor);
      for (let y = FLOOR_Y + 6; y < VH; y += 8) px(0, y, VW, 1, T.floor2);           // 마루 결
      for (let y = FLOOR_Y, r = 0; y < VH; y += 8, r++) for (let x = (r % 2) * 18; x < VW; x += 36) px(x, y, 1, 8, T.floor2);

      // 창문
      px(18, 12, 44, 32, T.wood); px(20, 14, 40, 28, T.sky);
      px(39, 14, 2, 28, T.wood); px(20, 27, 40, 2, T.wood);
      if (T === THEMES.night) { px(27, 18, 2, 2, "#FFF6C9"); px(50, 22, 1, 1, "#FFF6C9"); px(46, 34, 1, 1, "#FFF6C9"); px(30, 33, 5, 5, "#F4E9B0"); }
      else { px(24, 18, 9, 3, "#FFFFFF"); px(27, 16, 5, 2, "#FFFFFF"); px(46, 33, 8, 3, "#FFFFFF"); }
      px(16, 44, 48, 3, T.trim);                                                      // 창턱
      px(22, 40, 4, 4, T.wood); px(21, 35, 6, 5, T.leaf); px(23, 32, 2, 3, T.leaf);   // 창가 화분

      // 액자
      px(84, 16, 18, 14, T.wood); px(86, 18, 14, 10, "#FFF9EE");
      px(88, 23, 4, 4, T.rug); px(93, 20, 5, 7, T.bed); px(86, 27, 14, 1, T.leaf);

      // 선반과 책
      px(114, 20, 40, 2, T.wood);
      [["#D9485B", 4], ["#F2C94C", 3], ["#4C8DF0", 4], ["#4C9F70", 3], ["#8E5BD6", 4]].reduce((x, b) => { px(x, 20 - 9, b[1], 9, b[0]); return x + b[1] + 1; }, 118);
      px(144, 14, 5, 6, T.trim); px(145, 11, 3, 3, T.leaf);

      // 침대 (오른쪽 뒤)
      px(118, 44, 56, 6, T.wood); px(118, 36, 4, 30, T.wood); px(170, 40, 4, 26, T.wood);
      px(122, 48, 48, 14, T.bed); px(122, 48, 48, 3, "#FFFFFF"); px(124, 42, 14, 7, "#FFFFFF");
      px(122, 62, 48, 3, T.wood);

      // 스탠드
      px(104, 38, 2, 26, T.wood); px(99, 30, 12, 9, "#FFE9A8"); px(100, 64, 10, 2, T.wood);

      // 러그
      px(52, 84, 76, 18, T.rug); px(56, 87, 68, 12, T.rug2); px(60, 90, 60, 6, T.rug);

      // 앞쪽 큰 화분
      px(8, 92, 12, 12, T.wood); px(6, 80, 16, 12, T.leaf); px(10, 72, 8, 9, T.leaf); px(3, 84, 5, 5, T.leaf);
      bg = g;
    }

    const rnd = (a, b) => a + Math.random() * (b - a);
    function place(a, first) {
      a.x = first && a.owner ? VW / 2 : rnd(WALK.x0, WALK.x1);
      a.y = first && a.owner ? 92 : rnd(WALK.y0, WALK.y1);
      a.tx = a.x; a.ty = a.y; a.rest = rnd(0.5, 3); a.step = 0; a.face = 1; a.say = 0;
    }

    function setActors(list) {
      const old = new Map(actors.map(a => [a.key, a]));
      actors = list.map(item => {
        const a = old.get(item.key) || Object.assign({}, item);
        Object.assign(a, item);
        if (a.x == null) place(a, true);
        return a;
      });
    }

    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      resize();
      if (!canvas.width) return;
      if (!back) paintBack();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.imageSmoothingEnabled = false;
      g.drawImage(back, 0, 0);

      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) {
        const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy);
        let walking = false;
        if (a.rest > 0) a.rest -= dt;
        else if (dist > 0.8) { const v = 15 * dt; a.x += dx / dist * v; a.y += dy / dist * v; a.face = dx < 0 ? -1 : 1; walking = true; }
        else { a.tx = rnd(WALK.x0, WALK.x1); a.ty = rnd(WALK.y0, WALK.y1); a.rest = rnd(1, 5); }
        a.step = walking ? a.step + dt * 9 : 0;
        if (a.say > 0) a.say -= dt;

        const sprite = window.AV && AV.compose(a.avatar);
        const footX = Math.round(a.x * S), footY = Math.round(a.y * S);
        let w = 12 * S, h = 30 * S;
        if (sprite) {
          const k = Math.max(1, Math.round(40 * S / sprite.height));
          w = sprite.width * k; h = sprite.height * k;
          g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(footX - Math.round(w * 0.32), footY - S, Math.round(w * 0.64), S * 2);
          const hop = walking ? Math.round(Math.abs(Math.sin(a.step)) * S * 0.9) : 0;
          g.save(); g.translate(footX, footY - hop);
          if (a.face < 0) g.scale(-1, 1);
          g.drawImage(sprite, -Math.round(w / 2), -h, w, h);
          g.restore();
        }
        a.box = { x: footX - w / 2, y: footY - h, w, h };
      }

      // 이름표와 말풍선
      const font = Math.max(11, Math.round(S * 3.1));
      g.font = (font) + "px system-ui,'Apple SD Gothic Neo','Noto Sans KR',sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      for (const a of actors) {
        if (!a.box) continue;
        const cx = a.box.x + a.box.w / 2, ny = a.box.y + a.box.h + S * 1.5 + font * 0.75;
        const tw = g.measureText(a.name).width, bh = Math.round(font * 1.5);
        g.fillStyle = a.owner ? "#2A2521" : "rgba(42,37,33,.72)";
        g.fillRect(Math.round(cx - tw / 2 - S * 1.5), Math.round(ny - bh / 2), Math.round(tw + S * 3), bh);
        g.fillStyle = a.owner ? "#FFE27A" : "#FFFFFF";
        g.fillText(a.name, cx, ny + 1);
      }
      for (const a of actors) {
        if (!a.box || a.say <= 0 || !a.message) continue;
        const text = a.message.length > 28 ? a.message.slice(0, 27) + "…" : a.message;
        const tw = g.measureText(text).width, bw = tw + S * 5, bh = Math.round(font * 1.9);
        const cx = a.box.x + a.box.w / 2;
        const bx = Math.max(S, Math.min(canvas.width - bw - S, cx - bw / 2)), by = Math.max(S, a.box.y - bh - S * 3);
        g.fillStyle = "#2A2521"; g.fillRect(bx - S * 0.6, by - S * 0.6, bw + S * 1.2, bh + S * 1.2);
        g.fillStyle = "#FFFFFF"; g.fillRect(bx, by, bw, bh);
        g.fillRect(cx - S, by + bh, S * 2, S * 1.6);
        g.fillStyle = "#2A2521"; g.fillText(text, bx + bw / 2, by + bh / 2 + 1);
      }
    }

    canvas.addEventListener("pointerdown", ev => {
      const r = canvas.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width * canvas.width, y = (ev.clientY - r.top) / r.height * canvas.height;
      const hit = actors.slice().reverse().find(a => a.box && x >= a.box.x - S * 2 && x <= a.box.x + a.box.w + S * 2 && y >= a.box.y && y <= a.box.y + a.box.h + S * 6);
      if (!hit) return;
      hit.say = 4.5; hit.rest = Math.max(hit.rest, 2.5);
      if (opts.onPick) opts.onPick(hit);
    });

    /* 가끔 누군가 한마디 */
    const chatter = setInterval(() => {
      const c = actors.filter(a => a.message && a.say <= 0);
      if (c.length) c[Math.floor(Math.random() * c.length)].say = 4;
    }, 5200);

    raf = requestAnimationFrame(frame);
    return {
      setActors,
      setTheme(id) { theme = THEMES[id] || THEMES.mint; back = null; },
      destroy() { alive = false; cancelAnimationFrame(raf); clearInterval(chatter); }
    };
  }

  window.Room = { mount, THEMES };
})();
