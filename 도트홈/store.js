/* 도트홈 — 저장 모듈
   Supabase 가 설정되어 있으면 서버에, 아니면 이 기기(localStorage)에 저장합니다.
   홈 주인은 만들 때 받은 '열쇠(key)'로만 자기 홈을 고칠 수 있습니다. 열쇠는 이 기기에 보관됩니다. */
(function () {
  "use strict";
  const cfg = window.DOTHOME_CONFIG || {};
  const online = Boolean((cfg.SUPABASE_URL || "").trim() && (cfg.SUPABASE_KEY || "").trim());

  const K_HOMES = "dothome.homes", K_NOTES = "dothome.notes", K_MINE = "dothome.mine";
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

  let sbPromise = null;
  function sb() {
    if (!sbPromise) {
      sbPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
        .then(m => m.createClient(cfg.SUPABASE_URL.trim(), cfg.SUPABASE_KEY.trim()));
    }
    return sbPromise;
  }
  function must(res) { if (res.error) throw res.error; return res.data; }

  /* 내가 만든 홈 목록 (열쇠 포함) — 이 기기에만 있음 */
  function mine() { return load(K_MINE, []); }
  function keyOf(id) { const m = mine().find(h => h.id === id); return m ? m.key : null; }
  function remember(id, key, name) {
    const list = mine().filter(h => h.id !== id); list.unshift({ id, key, name }); save(K_MINE, list.slice(0, 20));
  }

  async function createHome(input) {
    const home = { id: token(8), name: clip(input.name, 20), avatar: clip(input.avatar, 60),
                   status: clip(input.status, 60), theme: clip(input.theme, 20) || "mint" };
    const key = token(24);
    if (online) {
      must(await (await sb()).rpc("create_home", { p_id: home.id, p_key: key, p_name: home.name,
        p_avatar: home.avatar, p_status: home.status, p_theme: home.theme }));
    } else {
      const all = load(K_HOMES, {}); all[home.id] = Object.assign({ created_at: new Date().toISOString() }, home); save(K_HOMES, all);
    }
    remember(home.id, key, home.name);
    return { id: home.id, key };
  }

  async function getHome(id) {
    if (online) {
      const rows = must(await (await sb()).from("homes").select("id,name,avatar,status,theme,created_at").eq("id", id).limit(1));
      return rows[0] || null;
    }
    return load(K_HOMES, {})[id] || null;
  }

  async function updateHome(id, patch) {
    const key = keyOf(id); if (!key) throw new Error("NOT_OWNER");
    const p = { name: clip(patch.name, 20), avatar: clip(patch.avatar, 60), status: clip(patch.status, 60), theme: clip(patch.theme, 20) };
    if (online) {
      must(await (await sb()).rpc("update_home", { p_id: id, p_key: key, p_name: p.name, p_avatar: p.avatar, p_status: p.status, p_theme: p.theme }));
    } else {
      const all = load(K_HOMES, {}); if (!all[id]) throw new Error("NOT_FOUND"); Object.assign(all[id], p); save(K_HOMES, all);
    }
    remember(id, key, p.name);
  }

  async function listNotes(homeId, limit) {
    limit = limit || 60;
    if (online) {
      return must(await (await sb()).from("notes").select("id,home_id,name,avatar,message,created_at")
        .eq("home_id", homeId).order("created_at", { ascending: false }).limit(limit));
    }
    return load(K_NOTES, []).filter(n => n.home_id === homeId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }

  async function addNote(input) {
    const note = { home_id: input.home_id, name: clip(input.name, 20), avatar: clip(input.avatar, 60), message: clip(input.message, 200) };
    if (!note.name || !note.message) throw new Error("EMPTY");
    if (online) { must(await (await sb()).from("notes").insert(note)); return; }
    const all = load(K_NOTES, []);
    all.push(Object.assign({ id: Date.now() + Math.floor(Math.random() * 1000), created_at: new Date().toISOString() }, note));
    save(K_NOTES, all.slice(-500));
  }

  async function deleteNote(homeId, noteId) {
    const key = keyOf(homeId); if (!key) throw new Error("NOT_OWNER");
    if (online) { must(await (await sb()).rpc("delete_note", { p_home: homeId, p_key: key, p_note: noteId })); return; }
    save(K_NOTES, load(K_NOTES, []).filter(n => !(n.home_id === homeId && n.id === noteId)));
  }

  function explain(err) {
    const m = String((err && (err.message || err.code)) || err);
    if (m.includes("NOT_OWNER")) return "이 기기에서 만든 홈만 고칠 수 있어요.";
    if (m.includes("EMPTY")) return "이름과 내용을 적어주세요.";
    if (m.includes("Failed to fetch") || m.includes("NetworkError")) return "인터넷 연결을 확인해 주세요.";
    if (m.includes("BAD_KEY")) return "열쇠가 맞지 않아요. 홈을 만든 기기에서 열어주세요.";
    return "문제가 생겼어요. 잠시 후 다시 해주세요.";
  }

  window.Store = { online, createHome, getHome, updateHome, listNotes, addNote, deleteNote, mine, keyOf, explain };
})();
