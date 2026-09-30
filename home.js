/* 몽글룸 — 홈 화면 */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const SITE = (window.DOTHOME_CONFIG || {}).SITE_NAME || "몽글룸";
  document.querySelectorAll(".site").forEach(n => n.textContent = SITE);

  const homeId = new URLSearchParams(location.search).get("u") || "";
  const isOwner = () => Boolean(Store.keyOf(homeId));
  const homeUrl = id => location.pathname.replace(/[^/]*$/, "") + "home.html?u=" + encodeURIComponent(id);
  let home = null, notes = [], diary = [], photos = [], friends = [], room = null;
  let tab = (location.hash || "").replace("#", "") || "home";

  /* 손님 정보는 이 기기에 기억해 둡니다 */
  const ME_KEY = "dothome.me";
  const me = (() => { try { return JSON.parse(localStorage.getItem(ME_KEY)) || {}; } catch (_) { return {}; } })();
  const saveMe = () => { try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch (_) {} };

  const pad = n => String(n).padStart(2, "0");
  const when = iso => { const d = new Date(iso); return `${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const day = iso => { const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
  const say = (id, t, cls) => { $(id).textContent = t; $(id).className = "msg " + (cls || ""); };

  /* 캐릭터를 캔버스에 (얼굴만 또는 전신) */
  function paintAvatar(canvas, code, headOnly, size) {
    const s = AV.compose(code); if (!s) return canvas;
    const sh = headOnly ? Math.round(s.height * 0.46) : s.height;
    if (headOnly) { canvas.width = canvas.height = size || 80; }
    else { const k = Math.max(1, Math.floor(320 / s.height)); canvas.width = s.width * k; canvas.height = s.height * k; }
    const k = Math.min(canvas.width / s.width, canvas.height / sh);
    const g = canvas.getContext("2d"); g.imageSmoothingEnabled = k < 1; g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(s, 0, 0, s.width, sh, (canvas.width - s.width * k) / 2, (canvas.height - sh * k) / 2, s.width * k, sh * k);
    return canvas;
  }
  const face = (code, size) => paintAvatar(el("canvas"), code, true, size);

  /* ── 탭 ── */
  function showTab(name) {
    tab = ["home", "diary", "photos", "notes", "friends"].includes(name) ? name : "home";
    document.querySelectorAll(".itabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("hidden", p.dataset.pane !== tab));
    if (history.replaceState) history.replaceState(null, "", "#" + tab);
    if (tab === "friends") loadFriends().catch(() => {});
  }
  document.querySelectorAll(".itabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));

  /* ── 프로필 ── */
  function renderProfile() {
    $("title").textContent = home.name + " 의 몽글룸";
    document.title = home.name + " 의 홈 · " + SITE;
    paintAvatar($("pfPic"), home.avatar);
    $("pfName").textContent = home.name;
    $("pfMood").classList.toggle("hidden", !home.mood);
    $("pfMood").textContent = home.mood ? "오늘의 기분 " + home.mood : "";
    $("pfStatus").textContent = home.status || "한 줄 소개가 아직 없어요";
    const box = $("pfBtns"); box.innerHTML = "";
    if (isOwner()) {
      const edit = el("button", "btn small line", "꾸미기"); edit.type = "button"; edit.onclick = openEdit;
      const share = el("button", "btn small", "주소 복사"); share.type = "button";
      share.onclick = () => copy(location.origin + homeUrl(homeId), share, "주소 복사", "이 주소를 친구에게 보내세요");
      box.append(edit, share);
    } else {
      friendButton(box);
    }
  }

  function copy(text, btn, label, promptText) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
      () => { btn.textContent = "복사됨"; setTimeout(() => btn.textContent = label, 1500); },
      () => prompt(promptText, text));
  }

  /* 손님이 보는 단짝 버튼 — 이 기기에 내 홈이 있어야 신청할 수 있어요 */
  async function friendButton(box) {
    const mine = Store.myFirstHome();
    const b = el("button", "btn small", "단짝 신청"); b.type = "button"; box.appendChild(b);
    if (!Store.online) { b.disabled = true; b.title = "체험 모드에서는 쓸 수 없어요"; return; }
    if (!mine) { b.onclick = () => { say("pfMsg", "내 홈을 먼저 만들어야 단짝 신청을 할 수 있어요.", "err"); }; return; }
    try {
      const st = await Store.friendState(mine.id, homeId);
      if (st === "ok") { b.textContent = "단짝 ♥"; b.disabled = true; return; }
      if (st === "sent") { b.textContent = "신청 보냄"; b.disabled = true; return; }
      if (st === "received") b.textContent = "단짝 수락";
    } catch (_) {}
    b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await Store.requestFriend(mine.id, homeId);
        b.textContent = r === "ok" || r === "already" ? "단짝 ♥" : "신청 보냄";
        say("pfMsg", r === "ok" ? "이제 서로 단짝이에요!" : `${mine.name || "내"} 홈에서 신청을 보냈어요.`, "ok");
      } catch (e) { b.disabled = false; say("pfMsg", Store.explain(e), "err"); }
    };
  }

  /* ── 방 ── */
  function renderRoom() {
    if (!room) room = Room.mount($("room"), { theme: home.theme });
    room.setTheme(home.theme);
    const seen = new Set(), guests = [];
    for (const n of notes) {                     // 최근 손님 10명 (같은 이름은 한 번만, 비밀글 제외)
      const k = n.name + "|" + n.avatar;
      if (n.secret || seen.has(k) || !AV.isCode(n.avatar)) continue;
      seen.add(k); guests.push({ key: "n" + n.id, name: n.name, avatar: n.avatar, message: n.message });
      if (guests.length >= 10) break;
    }
    room.setActors([{ key: "owner", name: home.name, avatar: home.avatar, message: home.mood ? home.mood + " · " + (home.status || "") : home.status, owner: true }].concat(guests));
  }

  /* ── 홈 탭 요약 ── */
  function renderHomeFeed() {
    const hd = $("hDiary"); hd.innerHTML = "";
    diary.slice(0, 3).forEach(d => { const li = el("li"); li.append(el("i", null, day(d.created_at)), el("span", null, (d.mood ? d.mood + " " : "") + d.body.split("\n")[0].slice(0, 60))); hd.appendChild(li); });
    if (!diary.length) hd.appendChild(el("li", null, "아직 없어요"));
    const hp = $("hPhotos"); hp.innerHTML = "";
    photos.slice(0, 3).forEach(p => hp.appendChild(photoThumb(p)));
    if (!photos.length) hp.appendChild(el("div", "empty", "아직 없어요"));
    const hn = $("hNotes"); hn.innerHTML = "";
    notes.filter(n => !n.secret).slice(0, 4).forEach(n => { const li = el("li"); li.append(el("i", null, n.name), el("span", null, n.message.slice(0, 60))); hn.appendChild(li); });
    if (!notes.some(n => !n.secret)) hn.appendChild(el("li", null, "아직 없어요"));
  }

  /* ── 다이어리 ── */
  let dMood = "";
  function renderDiary() {
    $("dWrite").classList.toggle("hidden", !isOwner());
    const box = $("dList"); box.innerHTML = "";
    $("dEmpty").classList.toggle("hidden", diary.length > 0);
    diary.forEach(d => {
      const it = el("div", "diary-item"), head = el("div", "dhead");
      head.append(el("span", null, day(d.created_at) + (d.mood ? "  " + d.mood : "")));
      if (isOwner()) {
        const del = el("button", "del", "지우기"); del.type = "button";
        del.style.cssText = "font:inherit;font-size:11px;color:var(--sub);background:none;border:none;cursor:pointer;text-decoration:underline";
        del.onclick = async () => { if (!confirm("이 다이어리를 지울까요?")) return; try { await Store.deleteDiary(homeId, d.id); await loadDiary(); } catch (e) { alert(Store.explain(e)); } };
        head.appendChild(del);
      }
      it.append(head, el("p", null, d.body)); box.appendChild(it);
    });
  }
  function moodPicker(box, current, onPick) {
    box.innerHTML = "";
    ["", ...Store.MOODS].forEach(m => {
      const b = el("button", null, m || "없음"); b.type = "button";
      b.setAttribute("aria-pressed", String(m === current));
      b.onclick = () => { onPick(m); [...box.children].forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
      box.appendChild(b);
    });
  }
  $("dBody").addEventListener("input", e => $("dCount").textContent = e.target.value.length);
  $("dSave").onclick = async () => {
    const body = $("dBody").value.trim(); if (!body) return say("dMsg", "내용을 적어주세요.", "err");
    $("dSave").disabled = true; say("dMsg", "올리는 중…");
    try { await Store.addDiary(homeId, body, dMood); $("dBody").value = ""; $("dCount").textContent = "0"; say("dMsg", "올렸어요.", "ok"); await loadDiary(); }
    catch (e) { say("dMsg", Store.explain(e), "err"); }
    $("dSave").disabled = false;
  };

  /* ── 사진첩 ── */
  function photoThumb(p) {
    const b = el("button"); b.type = "button"; b.title = p.caption || "";
    const img = el("img"); img.src = p.image; img.alt = p.caption || "사진"; img.loading = "lazy";
    b.appendChild(img); b.onclick = () => openPhoto(p); return b;
  }
  function renderPhotos() {
    $("pUpload").classList.toggle("hidden", !isOwner());
    const g = $("pGrid"); g.innerHTML = "";
    photos.forEach(p => g.appendChild(photoThumb(p)));
    $("pEmpty").classList.toggle("hidden", photos.length > 0);
  }
  function openPhoto(p) {
    $("lbImg").src = p.image; $("lbCap").textContent = (p.caption ? p.caption + " · " : "") + day(p.created_at);
    const tools = $("lbTools"); tools.innerHTML = "";
    if (isOwner()) {
      const del = el("button", "btn small line", "지우기"); del.type = "button";
      del.onclick = async ev => { ev.stopPropagation(); if (!confirm("이 사진을 지울까요?")) return;
        try { await Store.deletePhoto(homeId, p.id); $("lightbox").classList.add("hidden"); await loadPhotos(); } catch (e) { alert(Store.explain(e)); } };
      tools.appendChild(del);
    }
    $("lightbox").classList.remove("hidden");
  }
  $("lightbox").onclick = () => $("lightbox").classList.add("hidden");
  $("pFile").onchange = async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    say("pMsg", "사진 올리는 중…");
    try { await Store.addPhoto(homeId, file, $("pCaption").value); $("pCaption").value = ""; say("pMsg", "올렸어요.", "ok"); await loadPhotos(); }
    catch (err) { say("pMsg", Store.explain(err), "err"); }
    e.target.value = "";
  };

  /* ── 방명록 ── */
  function renderNotes() {
    const ul = $("notes"); ul.innerHTML = "";
    $("noteCount").textContent = notes.length ? notes.length + "개" : "";
    $("noNotes").classList.toggle("hidden", notes.length > 0);
    notes.forEach(n => {
      const li = el("li"), body = el("div"); body.style.minWidth = "0"; body.style.flex = "1";
      const who = el("div", "who", n.name);
      if (n.secret) who.appendChild(el("span", "secret-tag", "비밀글"));
      const t = el("time", null, when(n.created_at)); who.appendChild(t);
      body.append(who, el("div", "what", n.message));
      li.append(face(n.avatar), body);
      if (isOwner()) {
        const del = el("button", "del", "지우기"); del.type = "button";
        del.onclick = async () => { if (!confirm("이 글을 지울까요?")) return; try { await Store.deleteNote(homeId, n.id); await loadNotes(); } catch (e) { alert(Store.explain(e)); } };
        li.appendChild(del);
      }
      ul.appendChild(li);
    });
  }
  const vMaker = Maker.mount($("vMaker"), { value: me.avatar, onChange: code => { me.avatar = code; saveMe(); } });
  $("vName").value = me.name || "";
  $("vMsg").addEventListener("input", e => $("vCount").textContent = e.target.value.length);
  $("vSend").onclick = async () => {
    const name = $("vName").value.trim(), message = $("vMsg").value.trim(), secret = $("vSecret").checked;
    if (!name) return say("vInfo", "이름을 적어주세요.", "err");
    if (!message) return say("vInfo", "한마디를 적어주세요.", "err");
    $("vSend").disabled = true; say("vInfo", "남기는 중…");
    try {
      await Store.addNote({ home_id: homeId, name, message, secret, avatar: vMaker.get() });
      me.name = name; me.avatar = vMaker.get(); saveMe();
      $("vMsg").value = ""; $("vCount").textContent = "0"; $("vSecret").checked = false;
      await loadNotes();
      say("vInfo", secret ? "비밀글로 남겼어요. 홈 주인만 볼 수 있어요." : "남겼어요! 방 안에 내 캐릭터가 들어왔어요.", "ok");
    } catch (e) { say("vInfo", Store.explain(e), "err"); }
    $("vSend").disabled = false;
  };

  /* ── 단짝 ── */
  async function loadFriends() {
    friends = await Store.listFriends(homeId);
    const list = $("fList"); list.innerHTML = "";
    $("fCount").textContent = friends.length ? friends.length + "명" : "";
    $("fEmpty").classList.toggle("hidden", friends.length > 0);
    $("fEmpty").textContent = Store.online ? "아직 단짝이 없어요." : "체험 모드에서는 단짝 기능을 쓸 수 없어요.";
    friends.forEach(f => {
      const a = el("a"); a.href = homeUrl(f.id);
      a.append(face(f.avatar, 72), el("b", null, f.name));
      if (f.mood) a.appendChild(el("span", "fmood", f.mood));
      if (isOwner()) {
        const x = el("button", "del", "끊기"); x.type = "button"; x.style.cssText = "font:inherit;font-size:11px;color:var(--sub);background:none;border:none;text-decoration:underline;cursor:pointer";
        x.onclick = async ev => { ev.preventDefault(); if (!confirm(f.name + " 님과 단짝을 끊을까요?")) return; try { await Store.removeFriend(homeId, f.id); await loadFriends(); } catch (e) { alert(Store.explain(e)); } };
        a.appendChild(x);
      }
      list.appendChild(a);
    });
    const box = $("fReqBox"), reqs = $("fReqs"); reqs.innerHTML = "";
    if (!isOwner() || !Store.online) { box.classList.add("hidden"); return; }
    const pending = await Store.friendRequests(homeId);
    box.classList.toggle("hidden", !pending.length);
    pending.forEach(r => {
      const d = el("div", "req"), link = el("a", null, r.name); link.href = homeUrl(r.id); link.style.cssText = "border:none;padding:0;font-weight:700";
      const ok = el("button", "btn small", "수락"), no = el("button", "btn small line", "거절"); ok.type = no.type = "button";
      ok.onclick = async () => { try { await Store.answerFriend(homeId, r.id, true); await loadFriends(); } catch (e) { alert(Store.explain(e)); } };
      no.onclick = async () => { try { await Store.answerFriend(homeId, r.id, false); await loadFriends(); } catch (e) { alert(Store.explain(e)); } };
      const row = el("div", "row"); row.style.justifyContent = "center"; row.append(ok, no);
      d.append(face(r.avatar, 72), link, row); reqs.appendChild(d);
    });
  }

  /* ── 주인: 꾸미기 ── */
  let editTheme = "mint", editMood = "", editMaker = null;
  function openEdit() {
    $("edit").classList.remove("hidden");
    $("eName").value = home.name; $("eStatus").value = home.status || "";
    editTheme = home.theme || "mint"; editMood = home.mood || "";
    moodPicker($("eMoods"), editMood, m => editMood = m);
    const box = $("themes"); box.innerHTML = "";
    Object.entries(Room.THEMES).forEach(([id, t]) => {
      const b = el("button"); b.type = "button"; b.dataset.id = id;
      const sw = el("i"); sw.style.background = `linear-gradient(${t.wall} 0 58%, ${t.floor} 58% 100%)`;
      b.append(sw, document.createTextNode(t.name));
      b.onclick = () => { editTheme = id; room.setTheme(id); paint(); };
      box.appendChild(b);
    });
    const paint = () => [...box.children].forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === editTheme)));
    paint();
    editMaker = Maker.mount($("eMaker"), { value: home.avatar });
    $("eCode").textContent = Store.manageCode(homeId);
    $("edit").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("eCopy").onclick = () => copy(Store.manageCode(homeId), $("eCopy"), "코드 복사", "관리 코드");
  $("eCancel").onclick = () => { $("edit").classList.add("hidden"); room.setTheme(home.theme); };
  $("eSave").onclick = async () => {
    const name = $("eName").value.trim();
    if (!name) return say("eMsg", "이름을 적어주세요.", "err");
    $("eSave").disabled = true; say("eMsg", "저장하는 중…");
    try {
      const patch = { name, status: $("eStatus").value.trim(), theme: editTheme, mood: editMood, avatar: editMaker.get() || home.avatar };
      await Store.updateHome(homeId, patch);
      Object.assign(home, patch); renderProfile(); renderRoom();
      say("eMsg", "저장했어요.", "ok"); $("edit").classList.add("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { say("eMsg", Store.explain(e), "err"); }
    $("eSave").disabled = false;
  };

  /* ── 몽글 산책 · 내 홈 ── */
  $("walk").onclick = async () => {
    $("walk").disabled = true;
    try { const id = await Store.randomHome(homeId); if (id) location.href = homeUrl(id); else alert("아직 놀러 갈 홈이 없어요."); }
    catch (e) { alert(Store.explain(e)); }
    $("walk").disabled = false;
  };
  const myHome = Store.myFirstHome();
  if (myHome) { $("myHome").href = homeUrl(myHome.id); $("myHome").textContent = "내 홈"; }
  else { $("myHome").textContent = "홈 만들기"; }

  /* ── 불러오기 ── */
  async function loadNotes() { notes = await Store.listNotes(homeId); renderNotes(); renderRoom(); renderHomeFeed(); }
  async function loadDiary() { diary = await Store.listDiary(homeId); renderDiary(); renderHomeFeed(); }
  async function loadPhotos() { photos = await Store.listPhotos(homeId); renderPhotos(); renderHomeFeed(); }

  (async () => {
    try {
      await AV.ready();
      home = homeId ? await Store.getHome(homeId) : null;
      if (!home) { $("missing").classList.remove("hidden"); return; }
      $("page").classList.remove("hidden");
      renderProfile();
      moodPicker($("dMoods"), "", m => dMood = m);
      showTab(tab);
      Store.visit(home).then(c => { $("cToday").textContent = c.today; $("cTotal").textContent = c.total; }).catch(() => {});
      await Promise.all([loadNotes(), loadDiary(), loadPhotos()]);
      if (Store.online) setInterval(() => loadNotes().catch(() => {}), 30000);
    } catch (e) {
      $("missing").classList.remove("hidden");
      $("missing").querySelector("p").textContent = Store.explain(e);
    }
  })();
})();
