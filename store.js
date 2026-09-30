/* 몽글룸 — 저장 모듈
   Supabase 가 설정되어 있으면 서버에, 아니면 이 기기(localStorage)에 저장합니다.
   홈 주인은 만들 때 받은 '열쇠(key)'로만 자기 홈을 고칠 수 있습니다. 열쇠는 이 기기에 보관되고,
   '관리 코드'로 다른 기기에 옮길 수 있습니다. */
(function () {
  "use strict";
  const cfg = window.DOTHOME_CONFIG || {};
  const online = Boolean((cfg.SUPABASE_URL || "").trim() && (cfg.SUPABASE_KEY || "").trim());

  const K = { homes: "dothome.homes", notes: "dothome.notes", mine: "dothome.mine", diary: "dothome.diary", photos: "dothome.photos" };
  const load = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (_) { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
  function token(len) {
    const buf = new Uint32Array(len);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    let out = ""; for (let i = 0; i < len; i++) out += ALPHA[buf[i] % ALPHA.length];
    return out;
  }
  const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 한국 날짜
  const localId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

  let sbPromise = null;
  function sb() {
    if (!sbPromise) {
      sbPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
        .then(m => m.createClient(cfg.SUPABASE_URL.trim(), cfg.SUPABASE_KEY.trim()));
    }
    return sbPromise;
  }
  function must(res) { if (res.error) throw res.error; return res.data; }
  async function rpc(name, args) { return must(await (await sb()).rpc(name, args)); }
  async function table(name) { return (await sb()).from(name); }

  /* ── 내 홈 (열쇠) ── */
  function mine() { return load(K.mine, []); }
  function keyOf(id) { const m = mine().find(h => h.id === id); return m ? m.key : null; }
  function myFirstHome() { return mine()[0] || null; }
  function remember(id, key, name) {
    const list = mine().filter(h => h.id !== id); list.unshift({ id, key, name }); save(K.mine, list.slice(0, 20));
  }
  function forget(id) { save(K.mine, mine().filter(h => h.id !== id)); }
  function ownerKey(id) { const key = keyOf(id); if (!key) throw new Error("NOT_OWNER"); return key; }

  /* 관리 코드: "아이디.열쇠" */
  function manageCode(id) { const key = keyOf(id); return key ? id + "." + key : ""; }
  async function importCode(code) {
    const m = String(code || "").trim().match(/^([a-z0-9]{6,12})\.([a-z0-9]{16,40})$/);
    if (!m) throw new Error("BAD_CODE");
    const [, id, key] = m;
    if (online) { if (!(await rpc("check_key", { p_home: id, p_key: key }))) throw new Error("BAD_CODE"); }
    else if (!load(K.homes, {})[id]) throw new Error("BAD_CODE");
    const h = await getHome(id);
    remember(id, key, h ? h.name : "");
    return id;
  }

  /* ── 홈 ── */
  const HOME_COLS = "id,name,avatar,status,theme,mood,today_count,total_count,count_day,created_at";

  async function createHome(input) {
    const home = { id: token(8), name: clip(input.name, 20), avatar: clip(input.avatar, 60),
                   status: clip(input.status, 60), theme: clip(input.theme, 20) || "mint" };
    const key = token(24);
    if (online) {
      await rpc("create_home", { p_id: home.id, p_key: key, p_name: home.name, p_avatar: home.avatar, p_status: home.status, p_theme: home.theme });
      if (input.mood) await rpc("update_home", { p_id: home.id, p_key: key, p_name: home.name, p_avatar: home.avatar, p_status: home.status, p_theme: home.theme, p_mood: clip(input.mood, 20) });
    } else {
      const all = load(K.homes, {});
      all[home.id] = Object.assign({ created_at: new Date().toISOString(), mood: clip(input.mood, 20), today_count: 0, total_count: 0, count_day: today() }, home);
      save(K.homes, all);
    }
    remember(home.id, key, home.name);
    return { id: home.id, key };
  }

  async function getHome(id) {
    if (online) {
      const rows = must(await (await table("homes")).select(HOME_COLS).eq("id", id).limit(1));
      return rows[0] || null;
    }
    return load(K.homes, {})[id] || null;
  }

  async function updateHome(id, patch) {
    const key = ownerKey(id);
    const p = { name: clip(patch.name, 20), avatar: clip(patch.avatar, 60), status: clip(patch.status, 60), theme: clip(patch.theme, 20), mood: clip(patch.mood, 20) };
    if (online) {
      await rpc("update_home", { p_id: id, p_key: key, p_name: p.name, p_avatar: p.avatar, p_status: p.status, p_theme: p.theme, p_mood: p.mood });
    } else {
      const all = load(K.homes, {}); if (!all[id]) throw new Error("NOT_FOUND"); Object.assign(all[id], p); save(K.homes, all);
    }
    remember(id, key, p.name);
  }

  /* 방문자 수 — 같은 브라우저는 하루에 한 번만 셉니다 */
  async function visit(home) {
    const mark = "dothome.v." + home.id, day = today();
    let seen = null; try { seen = localStorage.getItem(mark); } catch (_) {}
    const showToday = home.count_day === day ? home.today_count : 0;
    if (seen === day || keyOf(home.id)) return { today: showToday, total: home.total_count || 0 };
    try { localStorage.setItem(mark, day); } catch (_) {}
    if (online) {
      const r = await rpc("visit", { p_home: home.id });
      return r && r[0] ? r[0] : { today: showToday, total: home.total_count || 0 };
    }
    const all = load(K.homes, {}), h = all[home.id]; if (!h) return { today: 0, total: 0 };
    h.today_count = h.count_day === day ? (h.today_count || 0) + 1 : 1; h.count_day = day; h.total_count = (h.total_count || 0) + 1;
    save(K.homes, all);
    return { today: h.today_count, total: h.total_count };
  }

  async function randomHome(notId) {
    if (online) return await rpc("random_home", { p_not: notId || "" });
    const ids = Object.keys(load(K.homes, {})).filter(i => i !== notId);
    return ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
  }

  /* ── 방명록 ── */
  async function listNotes(homeId, limit) {
    limit = limit || 80;
    let rows;
    if (online) {
      rows = must(await (await table("notes")).select("id,home_id,name,avatar,message,secret,created_at")
        .eq("home_id", homeId).order("created_at", { ascending: false }).limit(limit));
      const key = keyOf(homeId);
      if (key) {
        const secret = await rpc("secret_notes", { p_home: homeId, p_key: key });
        rows = rows.concat(secret).sort((a, b) => b.created_at.localeCompare(a.created_at));
      }
    } else {
      rows = load(K.notes, []).filter(n => n.home_id === homeId && (!n.secret || keyOf(homeId)))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    }
    return rows;
  }

  async function addNote(input) {
    const note = { home_id: input.home_id, name: clip(input.name, 20), avatar: clip(input.avatar, 60), message: clip(input.message, 200), secret: Boolean(input.secret) };
    if (!note.name || !note.message) throw new Error("EMPTY");
    if (online) { must(await (await table("notes")).insert(note)); return; }
    const all = load(K.notes, []);
    all.push(Object.assign({ id: localId(), created_at: new Date().toISOString() }, note));
    save(K.notes, all.slice(-500));
  }

  async function deleteNote(homeId, noteId) {
    const key = ownerKey(homeId);
    if (online) { await rpc("delete_note", { p_home: homeId, p_key: key, p_note: noteId }); return; }
    save(K.notes, load(K.notes, []).filter(n => !(n.home_id === homeId && n.id === noteId)));
  }

  /* ── 다이어리 ── */
  async function listDiary(homeId, limit) {
    limit = limit || 50;
    if (online) return must(await (await table("diary")).select("id,home_id,body,mood,created_at").eq("home_id", homeId).order("created_at", { ascending: false }).limit(limit));
    return load(K.diary, []).filter(d => d.home_id === homeId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
  async function addDiary(homeId, body, mood) {
    const key = ownerKey(homeId); body = clip(body, 1000); if (!body) throw new Error("EMPTY");
    if (online) { await rpc("add_diary", { p_home: homeId, p_key: key, p_body: body, p_mood: clip(mood, 20) }); return; }
    const all = load(K.diary, []); all.push({ id: localId(), home_id: homeId, body, mood: clip(mood, 20), created_at: new Date().toISOString() }); save(K.diary, all.slice(-300));
  }
  async function deleteDiary(homeId, id) {
    const key = ownerKey(homeId);
    if (online) { await rpc("delete_diary", { p_home: homeId, p_key: key, p_id: id }); return; }
    save(K.diary, load(K.diary, []).filter(d => !(d.home_id === homeId && d.id === id)));
  }

  /* ── 사진첩 ── */
  /* 사진을 긴 변 720px JPEG 로 줄여 data URL 로 만듭니다 (서버 한도 약 290KB) */
  function shrinkPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let side = 720, q = 0.82, out = "";
        for (let tries = 0; tries < 6; tries++) {
          const s = Math.min(1, side / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL("image/jpeg", q);
          if (out.length < 390000) return resolve(out);
          side = Math.round(side * 0.82); q = Math.max(0.55, q - 0.07);
        }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("BAD_IMAGE")); };
      img.src = url;
    });
  }
  async function listPhotos(homeId, limit) {
    limit = limit || 60;
    if (online) return must(await (await table("photos")).select("id,home_id,image,caption,created_at").eq("home_id", homeId).order("created_at", { ascending: false }).limit(limit));
    return load(K.photos, []).filter(p => p.home_id === homeId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
  async function addPhoto(homeId, file, caption) {
    const key = ownerKey(homeId), image = await shrinkPhoto(file);
    if (online) { await rpc("add_photo", { p_home: homeId, p_key: key, p_image: image, p_caption: clip(caption, 100) }); return; }
    const all = load(K.photos, []);
    if (all.filter(p => p.home_id === homeId).length >= 20) throw new Error("TOO_MANY");
    all.push({ id: localId(), home_id: homeId, image, caption: clip(caption, 100), created_at: new Date().toISOString() });
    save(K.photos, all);
  }
  async function deletePhoto(homeId, id) {
    const key = ownerKey(homeId);
    if (online) { await rpc("delete_photo", { p_home: homeId, p_key: key, p_id: id }); return; }
    save(K.photos, load(K.photos, []).filter(p => !(p.home_id === homeId && p.id === id)));
  }

  /* ── 단짝 ── (서버 연결 시에만) */
  const needOnline = () => { if (!online) throw new Error("ONLINE_ONLY"); };
  async function listFriends(homeId) { if (!online) return []; return await rpc("list_friends", { p_home: homeId }); }
  async function friendRequests(homeId) { if (!online) return []; return await rpc("friend_requests", { p_home: homeId, p_key: ownerKey(homeId) }); }
  async function friendState(me, other) { if (!online || !me) return "none"; return await rpc("friend_state", { p_me: me, p_other: other }); }
  async function requestFriend(me, other) { needOnline(); return await rpc("friend_request", { p_from: me, p_key: ownerKey(me), p_to: other }); }
  async function answerFriend(homeId, from, ok) { needOnline(); await rpc("friend_answer", { p_home: homeId, p_key: ownerKey(homeId), p_from: from, p_ok: Boolean(ok) }); }
  async function removeFriend(homeId, other) { needOnline(); await rpc("friend_remove", { p_home: homeId, p_key: ownerKey(homeId), p_other: other }); }

  function explain(err) {
    const m = String((err && (err.message || err.code)) || err);
    if (m.includes("NOT_OWNER")) return "이 기기에서 관리하는 홈이 아니에요. 관리 코드를 넣으면 고칠 수 있어요.";
    if (m.includes("BAD_CODE")) return "관리 코드가 맞지 않아요.";
    if (m.includes("EMPTY")) return "내용을 적어주세요.";
    if (m.includes("TOO_MANY")) return "사진은 60장까지 올릴 수 있어요. 예전 사진을 지워주세요.";
    if (m.includes("BAD_IMAGE")) return "이 사진은 읽을 수 없어요. 다른 사진을 골라주세요.";
    if (m.includes("ONLINE_ONLY")) return "체험 모드에서는 단짝 기능을 쓸 수 없어요.";
    if (m.includes("SELF")) return "내 홈에는 단짝 신청을 할 수 없어요.";
    if (m.includes("Failed to fetch") || m.includes("NetworkError")) return "인터넷 연결을 확인해 주세요.";
    if (m.includes("BAD_KEY")) return "관리 권한이 없어요. 홈을 만든 기기나 관리 코드로 열어주세요.";
    if (m.includes("value too long") || m.includes("check constraint")) return "글이 너무 길어요.";
    return "문제가 생겼어요. 잠시 후 다시 해주세요.";
  }

  const MOODS = ["😊 좋음", "🥰 설렘", "🥳 신남", "☕ 여유", "😴 졸림", "😋 배고픔", "🤯 바쁨", "🥲 울적"];

  window.Store = {
    online, today, MOODS,
    mine, keyOf, myFirstHome, forget, manageCode, importCode,
    createHome, getHome, updateHome, visit, randomHome,
    listNotes, addNote, deleteNote,
    listDiary, addDiary, deleteDiary,
    listPhotos, addPhoto, deletePhoto,
    listFriends, friendRequests, friendState, requestFriend, answerFriend, removeFriend,
    explain
  };
})();
