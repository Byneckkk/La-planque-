/* La Planque : connexion à Supabase (comptes, base en temps réel, photos, Guide, micro).
   Ce fichier remplace les services de Claude par Supabase et par le navigateur.
   Tu n'as rien à modifier ici : les réglages sont dans config.js. */
(function () {
  'use strict';
  const CFG = window.PLANQUE_CONFIG || {};
  const $ = s => document.querySelector(s);
  const configured = CFG.SUPABASE_URL && !/TON-PROJET/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/COLLE-ICI/.test(CFG.SUPABASE_ANON_KEY);
  const BASE_URL = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '');

  /* ---------- « Se souvenir de moi » : localStorage (reste connecté) ou sessionStorage (jusqu'à la fermeture) ---------- */
  const REM = 'planque.remember';
  const ls = (() => { try { return window.localStorage } catch { return null } })();
  const ss = (() => { try { return window.sessionStorage } catch { return null } })();
  const remember = () => { try { return ls?.getItem(REM) !== 'no' } catch { return true } };
  const storage = {
    getItem: k => { try { return ls?.getItem(k) ?? ss?.getItem(k) ?? null } catch { return null } },
    setItem: (k, v) => { try { if (remember()) { ls?.setItem(k, v); ss?.removeItem(k) } else { ss?.setItem(k, v); ls?.removeItem(k) } } catch {} },
    removeItem: k => { try { ls?.removeItem(k); ss?.removeItem(k) } catch {} }
  };

  let sb = null;
  if (configured && window.supabase?.createClient) {
    sb = window.supabase.createClient(BASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'planque-auth' }
    });
  }

  let resolveReady;
  const ready = new Promise(r => { resolveReady = r });
  let session = null, started = false;

  /* ---------- Écran de connexion ---------- */
  function gate(mode, msg) {
    const g = $('#authGate'); if (!g) return;
    g.hidden = false; g.dataset.mode = mode;
    const f = $('#authForm');
    const t = { login: 'Connexion', signup: 'Créer mon compte', forgot: 'Mot de passe oublié', reset: 'Nouveau mot de passe', setup: 'Site pas encore configuré', check: 'Vérifie tes e-mails' }[mode];
    $('#authTitle').textContent = t;
    $('#authMsg').innerHTML = msg || '';
    $('#authMsg').hidden = !msg;
    f.hidden = mode === 'setup' || mode === 'check';
    $('#authEmailRow').hidden = mode === 'reset';
    $('#authPassRow').hidden = mode === 'forgot';
    $('#authPass2Row').hidden = !(mode === 'signup' || mode === 'reset');
    $('#authRemRow').hidden = !(mode === 'login' || mode === 'signup');
    $('#authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#authGo').textContent = { login: 'Se connecter', signup: 'Créer mon compte', forgot: 'Recevoir le lien', reset: 'Enregistrer' }[mode] || 'OK';
    $('#authLinks').innerHTML =
      mode === 'login' ? '<button type="button" class="link" data-auth="signup">Pas encore de compte ? <b>Crée-le</b></button><button type="button" class="link" data-auth="forgot">Mot de passe oublié ?</button>'
      : mode === 'check' ? '<button type="button" class="link" data-auth="login">Retour à la connexion</button>'
      : mode === 'setup' ? ''
      : '<button type="button" class="link" data-auth="login">J\'ai déjà un compte : <b>me connecter</b></button>';
    $('#authRem').checked = remember();
    if (!f.hidden) try { (mode === 'reset' ? $('#authPass') : $('#authEmail')).focus({ preventScroll: true }) } catch {}
  }
  const hideGate = () => { const g = $('#authGate'); if (g) g.hidden = true };
  const FR = m => {
    m = String(m || '');
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirme d\'abord ton e-mail : clique sur le lien reçu (regarde aussi les spams).';
    if (/already registered|already been registered|User already exists/i.test(m)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
    if (/Password should be at least|weak/i.test(m)) return 'Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.';
    if (/rate limit|too many/i.test(m)) return 'Trop d\'essais d\'un coup. Attends une minute et réessaie.';
    if (/Signups not allowed|signup.*disabled/i.test(m)) return 'Les inscriptions sont fermées : demande à l\'admin de la Planque.';
    if (/valid email|invalid.*email/i.test(m)) return 'Cette adresse e-mail n\'est pas valide.';
    if (/fetch|network/i.test(m)) return 'Pas de connexion au serveur. Vérifie ton internet.';
    return 'Ça n\'a pas marché : ' + m;
  };

  function bindGate() {
    const g = $('#authGate'); if (!g) return;
    g.addEventListener('click', e => { const b = e.target.closest('[data-auth]'); if (b) gate(b.dataset.auth) });
    $('#authForm').addEventListener('submit', async e => {
      e.preventDefault();
      const mode = g.dataset.mode, email = $('#authEmail').value.trim(), pass = $('#authPass').value, pass2 = $('#authPass2').value;
      const btn = $('#authGo'), say = (m, ok) => { $('#authMsg').innerHTML = m; $('#authMsg').hidden = !m; $('#authMsg').classList.toggle('ok', !!ok) };
      if ((mode === 'signup' || mode === 'reset') && pass !== pass2) { say('Les deux mots de passe ne sont pas pareils.'); return }
      if ((mode === 'signup' || mode === 'reset') && pass.length < 8) { say('Choisis un mot de passe d\'au moins 8 caractères.'); return }
      try { ls?.setItem(REM, $('#authRem').checked ? 'yes' : 'no') } catch {}
      btn.disabled = true; say('');
      try {
        if (mode === 'login') {
          const { error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error;
        } else if (mode === 'signup') {
          const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error;
          if (!data.session) gate('check', 'Ton compte est créé ! On t\'a envoyé un e-mail à <b>' + esc(email) + '</b> : clique sur le lien dedans pour l\'activer, puis reviens te connecter. (Regarde aussi dans les spams.)');
        } else if (mode === 'forgot') {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error;
          gate('check', 'Si un compte existe avec <b>' + esc(email) + '</b>, tu vas recevoir un lien pour choisir un nouveau mot de passe.');
        } else if (mode === 'reset') {
          const { error } = await sb.auth.updateUser({ password: pass }); if (error) throw error;
          recovering = false; hideGate(); start();
          window.toast?.('Mot de passe changé !');
        }
      } catch (err) { say(FR(err?.message)) } finally { btn.disabled = false }
    });
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let recovering = /type=recovery/.test(location.hash);
  let starting = false;
  async function start(skipRead) {
    if (started || starting || !session || recovering) return;
    starting = true;
    try {
      if (skipRead !== true) await readMaint();
      if (maint.maintenance && !(await amAdmin())) { hideGate(); showMaint(); return }
      started = true; hideGate(); hideMaint(); resolveReady();
      const out = $('#logoutBox'); if (out) { out.hidden = false; $('#logoutMail').textContent = session.user.email || '' }
      if (await amAdmin()) setupMaintBox();
      banner();
    } finally { starting = false }
  }

  /* ---------- Mode maintenance (réglé par un admin, depuis son profil) ---------- */
  const MAINT_DEF = 'La Planque fait une petite mise à jour. Reviens dans quelques minutes !';
  let maint = { maintenance: false, message: '' }, maintReady = false, adminP2 = null;
  const amAdmin = () => session ? (adminP2 || (adminP2 = sb.rpc('planque_is_admin').then(r => !!r.data).catch(() => false))) : Promise.resolve(false);
  async function readMaint() {
    try {
      const { data, error } = await sb.from('planque_settings').select('maintenance,message').eq('id', 1).maybeSingle();
      if (!error && data) { maint = data; maintReady = true } else if (error) maintReady = false;
    } catch {}
    return maint;
  }
  function showMaint() {
    const m = $('#maintGate'); if (!m) return;
    $('#maintMsg').textContent = maint.message || MAINT_DEF;
    $('#maintLinks').innerHTML = session
      ? '<button type="button" class="link" data-maint="logout">Se déconnecter</button>'
      : '<button type="button" class="link" data-maint="login">Tu es admin ? <b>Te connecter</b></button>';
    m.hidden = false;
  }
  const hideMaint = () => { const m = $('#maintGate'); if (m) m.hidden = true };
  function banner() { const b = $('#maintBanner'); if (b) b.hidden = !(started && maint.maintenance) }
  async function applyMaint(m) {
    if (m) maint = { ...maint, ...m };
    if (maint.maintenance) {
      if (started && await amAdmin()) { banner(); updateMaintBox(); return }
      if (recovering) return;
      showMaint();
    } else {
      const shown = !$('#maintGate')?.hidden;
      hideMaint(); banner();
      if (shown) { if (session && !started) start(true); else if (!session) gate('login') }
    }
    updateMaintBox();
  }
  let maintWatching = false;
  function watchMaint() {
    if (maintWatching) return; maintWatching = true;
    sb.channel('planque-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planque_settings' }, p => { if (p.new && 'maintenance' in p.new) applyMaint(p.new) })
      .subscribe();
    const poll = () => { if (!document.hidden) readMaint().then(() => applyMaint()) };
    document.addEventListener('visibilitychange', poll);
    setInterval(poll, 60000);
  }
  function updateMaintBox() {
    const box = $('#maintBox'); if (!box || box.hidden) return;
    if (!maintReady) { $('#maintState').innerHTML = 'Pour activer la maintenance, lance d\'abord le fichier <b>maintenance.sql</b> dans Supabase (SQL Editor).'; $('#maintToggle').hidden = true; $('#maintTextRow').hidden = true; return }
    $('#maintToggle').hidden = false; $('#maintTextRow').hidden = false;
    $('#maintState').innerHTML = maint.maintenance ? '<b style="color:var(--pink,#ff4fa3)">Activée</b> : seuls les admins peuvent utiliser le site.' : '<b>Désactivée</b> : le site est ouvert à tous.';
    $('#maintToggle').textContent = maint.maintenance ? 'Rouvrir le site' : 'Mettre le site en maintenance';
    if (document.activeElement !== $('#maintText')) $('#maintText').value = maint.message || MAINT_DEF;
  }
  function setupMaintBox() {
    const box = $('#maintBox'); if (!box) return;
    box.hidden = false; updateMaintBox();
    $('#maintToggle').onclick = async () => {
      const btn = $('#maintToggle'); btn.disabled = true;
      const next = !maint.maintenance, message = ($('#maintText').value || '').trim().slice(0, 200) || MAINT_DEF;
      const { error } = await sb.from('planque_settings').update({ maintenance: next, message }).eq('id', 1);
      btn.disabled = false;
      if (error) { $('#maintState').textContent = 'Ça n\'a pas marché : ' + error.message; return }
      maint = { ...maint, maintenance: next, message }; banner(); updateMaintBox();
    };
  }

  async function boot() {
    bindGate();
    if (!window.supabase?.createClient) { gate('setup', 'Impossible de charger le module de connexion. Vérifie ta connexion internet puis recharge la page.'); return }
    if (!configured) { gate('setup', 'Ouvre le fichier <b>config.js</b> et colle l\'adresse et la clé de ton projet Supabase (voir le fichier LISEZMOI).'); return }
    sb.auth.onAuthStateChange((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') { recovering = true; session = s; gate('reset', 'Choisis ton nouveau mot de passe.'); return }
      if (ev === 'SIGNED_OUT') { if (started) location.reload(); else gate('login'); return }
      const changedUser = session && s && session.user.id !== s.user.id;
      session = s;
      if (changedUser) location.reload();
      if (s) setTimeout(start, 0);
    });
    $('#maintGate')?.addEventListener('click', e => {
      const b = e.target.closest('[data-maint]'); if (!b) return;
      if (b.dataset.maint === 'login') { hideMaint(); gate('login') } else window.PLANQUE.logout();
    });
    const { data } = await sb.auth.getSession();
    session = data.session;
    watchMaint();
    if (session && !recovering) start();
    else if (!recovering) { await readMaint(); if (maint.maintenance) showMaint(); else if ($('#authGate').hidden) gate('login') }
  }

  /* ---------- Base de données : une table « docs » (chemin, collection, données) en temps réel ---------- */
  const cache = new Map();         // path -> {path, collection, data}
  const listeners = new Set();     // {col, order, dir, lim, cb, err}
  let loadedOnce = false, loading = null, dirty = new Set(), flushT = null;
  const colOf = p => p.split('/').slice(0, -1).join('/');
  const idOf = p => p.split('/').pop();
  const newId = () => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', r = crypto.getRandomValues(new Uint8Array(20)); let s = ''; for (const x of r) s += a[x % 62]; return s };
  const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

  function snap(l) {
    let rows = [];
    for (const r of cache.values()) if (r.collection === l.col) rows.push(r);
    if (l.order) { const k = l.order, d = l.dir === 'desc' ? -1 : 1; rows.sort((a, b) => { const x = a.data?.[k], y = b.data?.[k]; return (x > y ? 1 : x < y ? -1 : 0) * d }) }
    if (l.lim) rows = rows.slice(0, l.lim);
    return { docs: rows.map(r => ({ id: idOf(r.path), data: () => clone(r.data || {}) })), size: rows.length, empty: !rows.length, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function fire(cols) {
    for (const l of listeners) if (!cols || cols.has(l.col)) { try { l.cb(snap(l)) } catch (e) { console.error(e) } }
  }
  function touch(col) { dirty.add(col); if (!flushT) flushT = setTimeout(() => { const d = dirty; dirty = new Set(); flushT = null; if (loadedOnce) fire(d) }, 40) }
  function put(row) { cache.set(row.path, { path: row.path, collection: row.collection, data: row.data || {} }); touch(row.collection) }
  function drop(path) { const r = cache.get(path); if (r) { cache.delete(path); touch(r.collection) } }

  async function loadAll() {
    if (loading) return loading;
    loading = (async () => {
      const all = []; const step = 1000;
      for (let from = 0; ; from += step) {
        const { data, error } = await sb.from('docs').select('path,collection,data').order('path').range(from, from + step - 1);
        if (error) throw error;
        all.push(...data); if (data.length < step) break;
      }
      const seen = new Set(all.map(r => r.path));
      for (const p of [...cache.keys()]) if (!seen.has(p)) drop(p);
      for (const r of all) { const old = cache.get(r.path); if (!old || JSON.stringify(old.data) !== JSON.stringify(r.data)) put(r) }
      if (!loadedOnce) { loadedOnce = true; fire(null) }
    })().finally(() => { loading = null });
    return loading;
  }

  let channel = null;
  function subscribe() {
    if (channel) return;
    channel = sb.channel('planque-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
        if (p.eventType === 'DELETE') { if (p.old?.path) drop(p.old.path) }
        else if (p.new?.path) put(p.new);
      })
      .subscribe(st => { if (st === 'SUBSCRIBED' && loadedOnce) loadAll().catch(() => {}) });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && loadedOnce) loadAll().catch(() => {}) });
    setInterval(() => { if (!document.hidden && loadedOnce) loadAll().catch(() => {}) }, 120000);
  }

  const errCode = e => {
    const c = e?.code, m = String(e?.message || '');
    const out = new Error(m || 'erreur');
    out.code = c === '42501' || /row-level security|permission/i.test(m) ? 'permission_denied' : /fetch|network/i.test(m) ? 'unavailable' : 'unknown';
    return out;
  };
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const deepMerge = (a, b) => { const o = isObj(a) ? { ...a } : {}; for (const [k, v] of Object.entries(b || {})) o[k] = isObj(v) && isObj(o[k]) ? deepMerge(o[k], v) : v; return o };

  async function write(path, data) {
    const col = colOf(path), clean = JSON.parse(JSON.stringify(data ?? {}));
    const { error } = await sb.from('docs').upsert({ path, collection: col, data: clean }, { onConflict: 'path' });
    if (error) throw errCode(error);
    put({ path, collection: col, data: clean });
  }
  function docRef(path) {
    return {
      id: idOf(path), path,
      set: data => write(path, data),
      update: patch => write(path, deepMerge(cache.get(path)?.data || {}, patch)),
      delete: async () => { const { error } = await sb.from('docs').delete().eq('path', path); if (error) throw errCode(error); drop(path) },
      get: async () => { const r = cache.get(path); return { id: idOf(path), exists: !!r, data: () => (r ? clone(r.data) : undefined) } }
    };
  }
  function query(col, opt = {}) {
    return {
      orderBy: (k, dir) => query(col, { ...opt, order: k, dir: dir || 'asc' }),
      limit: n => query(col, { ...opt, lim: n }),
      add: async data => { const ref = docRef(col + '/' + newId()); await ref.set(data); return ref },
      doc: id => docRef(col + '/' + (id || newId())),
      onSnapshot: (cb, err) => {
        const l = { col, ...opt, cb, err }; listeners.add(l);
        if (loadedOnce) setTimeout(() => listeners.has(l) && cb(snap(l)), 0);
        else loadAll().catch(e => { try { err?.(errCode(e)) } catch {} });
        return () => listeners.delete(l);
      }
    };
  }
  const db = { doc: docRef, collection: col => query(col) };

  /* Fiches de départ : ajoutées une seule fois, par le premier qui se connecte */
  async function seed() {
    try {
      await loadAll();
      if (cache.has('meta/seed') || !Array.isArray(window.PLANQUE_FICHES)) return;
      const now = Date.now();
      const rows = window.PLANQUE_FICHES.map((f, i) => { const { id, ...rest } = f; return { path: 'secrets/' + id, collection: 'secrets', data: { author: 'planque', createdAt: now - i, ...rest } } }).filter(r => !cache.has(r.path));
      for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from('docs').upsert(rows.slice(i, i + 200), { onConflict: 'path', ignoreDuplicates: true }); if (error) throw error }
      await write('meta/seed', { at: now, n: rows.length });
      for (const r of rows) put(r);
    } catch (e) { console.warn('Fiches de départ non ajoutées', e) }
  }

  /* ---------- Compte ---------- */
  let adminP = null;
  const user = {
    id: async () => session?.user?.id || null,
    isOwner: () => adminP || (adminP = sb.rpc('planque_is_admin').then(r => !!r.data).catch(() => false)),
    can: async () => true,
    email: async () => session?.user?.email || null
  };

  /* ---------- Présence (qui a l'appli ouverte) ---------- */
  function room() {
    let ch = null, cbs = [];
    const emit = () => { if (!ch) return; const st = ch.presenceState(); const peers = Object.keys(st).filter(k => k !== session.user.id).map(by => ({ by, presence: st[by]?.[0] || {} })); cbs.forEach(cb => { try { cb({ peers }) } catch {} }) };
    return {
      presence: async p => {
        if (!ch) {
          ch = sb.channel('planque-room', { config: { presence: { key: session.user.id } } });
          ch.on('presence', { event: 'sync' }, emit).on('presence', { event: 'join' }, emit).on('presence', { event: 'leave' }, emit);
          await new Promise(res => ch.subscribe(st => { if (st === 'SUBSCRIBED') res() }));
        }
        await ch.track({ id: session.user.id, ...(p || {}) });
      },
      onPeers: cb => { cbs.push(cb); emit(); return () => { cbs = cbs.filter(x => x !== cb) } }
    };
  }

  /* ---------- Photos (Supabase Storage, dossier public « photos ») ---------- */
  const assets = {
    upload: async (blob, opt = {}) => {
      const id = newId() + newId().slice(0, 4);
      const type = blob?.type || opt.type || 'image/jpeg';
      if (!/^image\//.test(type)) { const e = new Error('type'); e.code = 'unsupported_type'; throw e }
      const { error } = await sb.storage.from('photos').upload(id, blob, { contentType: type, cacheControl: '31536000', upsert: false });
      if (error) { const e = new Error(error.message); e.code = /mime|type/i.test(error.message) ? 'unsupported_type' : /size|quota|exceed/i.test(error.message) ? 'quota_or_state' : 'unknown'; throw e }
      return { id };
    },
    delete: async id => { await sb.storage.from('photos').remove([id]) }
  };

  /* ---------- Le Guide (IA) : passe par la fonction Supabase « guide », la clé reste sur le serveur ---------- */
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob) });
  async function toJpeg(blob) {
    if (/^image\/(jpeg|png|webp|gif)$/.test(blob.type)) return blob;
    try { const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return await new Promise(r => c.toBlob(b => r(b || blob), 'image/jpeg', .85)) } catch { return blob }
  }
  async function callGuide(body, signal) {
    const { data: { session: s } } = await sb.auth.getSession();
    let r;
    try {
      r = await fetch(BASE_URL + '/functions/v1/guide', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (s?.access_token || CFG.SUPABASE_ANON_KEY) }, body: JSON.stringify(body) });
    } catch (e) { const x = new Error('net'); x.code = e?.name === 'AbortError' ? 'cancelled' : 'network'; x.text = ''; throw x }
    let j = null; try { j = await r.json() } catch {}
    if (!r.ok || !j || j.error) { const x = new Error(j?.error || 'guide'); x.code = j?.code || (r.status === 401 ? 'session_expired' : r.status === 429 ? 'rate_limited' : r.status === 404 ? 'sampling_disabled' : 'unknown'); x.text = ''; throw x }
    return j;
  }
  async function sample(messages, opt = {}) {
    let msgs = (messages || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
    let system = '';
    if (msgs.length > 1 && msgs[0].role === 'user' && msgs[1].role === 'user') { system = msgs[0].content; msgs = msgs.slice(1) }
    const j = await callGuide({ system, messages: msgs, max_tokens: opt.maxTokens || 900 }, opt.signal);
    try { opt.onText?.({ text: j.text }) } catch {}
    return { text: j.text || '', truncated: !!j.truncated };
  }
  sample.limits = async () => ({ images: true });
  sample.json = async (prompt, opt = {}) => {
    const images = [];
    for (const im of (opt.images || []).slice(0, 4)) { if (!(im instanceof Blob)) continue; const b = await toJpeg(im); images.push({ media_type: b.type || 'image/jpeg', data: await b64(b) }) }
    const j = await callGuide({ messages: [{ role: 'user', content: prompt }], images, max_tokens: 900, json: true }, opt.signal);
    const m = String(j.text || '').match(/\{[\s\S]*\}/); if (!m) return null;
    try { return JSON.parse(m[0]) } catch { return null }
  };

  /* ---------- Micro : reconnaissance vocale du navigateur (Chrome, Edge, Safari) ---------- */
  function dictation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    let rec = null, onF = [], onP = [], onS = [], stopping = false;
    const emit = (arr, v) => arr.forEach(f => { try { f(v) } catch {} });
    return {
      onFinal: f => onF.push(f), onPartial: f => onP.push(f), onState: f => onS.push(f),
      start: () => new Promise((res, rej) => {
        try { rec?.abort() } catch {}
        rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true; stopping = false;
        let began = false;
        rec.onstart = () => { began = true; emit(onS, { state: 'listening' }); res() };
        rec.onresult = e => { let part = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) emit(onF, { text: (t.startsWith(' ') ? '' : ' ') + t }); else part += t } emit(onP, { text: part }) };
        rec.onerror = e => { const code = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'not_granted' : e.error === 'aborted' ? 'stopped' : e.error === 'no-speech' ? 'stopped' : 'unknown'; if (!began) { const x = new Error(e.error); x.code = code; rej(x) } };
        rec.onend = () => { emit(onS, { state: 'idle', reason: 'stopped' }) };
        try { rec.start() } catch (e) { const x = new Error('start'); x.code = 'unknown'; rej(x) }
      }),
      stop: async () => { stopping = true; try { rec?.stop() } catch {} }
    };
  }

  /* ---------- Point d'entrée utilisé par l'appli ---------- */
  window.claude = {
    use: async cap => {
      if (!sb) return null;
      await ready;
      switch (cap) {
        case 'db': subscribe(); seed(); return db;
        case 'user': return user;
        case 'room': return room();
        case 'assets': return assets;
        case 'sample': return CFG.GUIDE_ENABLED ? sample : null;
        case 'dictation': return dictation();
        case 'tts': return null; // la voix du navigateur est utilisée directement par l'appli
        default: return null;
      }
    }
  };
  window.PLANQUE = {
    ready,
    photoBase: BASE_URL + '/storage/v1/object/public/photos/',
    logout: async () => { try { await sb?.auth.signOut() } catch {} try { ls?.removeItem('planque-auth'); ss?.removeItem('planque-auth') } catch {} location.reload() },
    get guideOn() { return !!CFG.GUIDE_ENABLED }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
