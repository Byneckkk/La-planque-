/* La Planque : barre de recherche globale et choix du style (Néon nuit, Miami soleil, Mode mission). */
(function () {
  'use strict';
  const q = s => document.querySelector(s);
  const SKINS = { neon: { n: 'Néon nuit', tc: '#140a1f' }, miami: { n: 'Miami soleil', tc: '#ffd1e3' }, mission: { n: 'Mode mission', tc: '#0a0c10' } };
  const L = () => window.PLQ || {};
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch { return null } };

  /* ---------- Style ---------- */
  const curSkin = () => document.documentElement.dataset.skin || 'neon';
  function applySkin(k) {
    if (!SKINS[k]) k = 'neon';
    document.documentElement.dataset.skin = k;
    store('planque.skin', k);
    const m = q('meta[name="theme-color"]'); if (m) m.content = SKINS[k].tc;
    document.querySelectorAll('.skinopt').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.skin === k)));
  }
  async function chooseSkin(k) {
    applySkin(k);
    store('planque.skinSeen', '1'); const c = q('#skinCard'); if (c) c.hidden = true;
    const { db, me, players } = L();
    if (db && me && players?.[me] && players[me].skin !== k) { try { await db.doc('players/' + me).update({ skin: k }) } catch {} }
    L().toast?.('Style « ' + SKINS[k].n + ' » activé ✓');
  }
  let synced = false;
  function syncFromProfile() {
    const { me, players } = L(); const p = players?.[me];
    if (!p) return;
    if (!synced) { synced = true; if (p.skin && SKINS[p.skin] && p.skin !== curSkin()) applySkin(p.skin) }
    const c = q('#skinCard'); if (c) c.hidden = !!store('planque.skinSeen') || !!p.skin;
  }

  /* ---------- Recherche ---------- */
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hl(text, nq) {
    const t = String(text ?? ''), n = norm(t); if (!nq) return esc(t);
    const i = n.indexOf(nq); if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + nq.length)) + '</mark>' + esc(t.slice(i + nq.length));
  }
  const ICON = {
    arme: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    argent: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2M12 12v3"/>',
    voiture: '<path d="M4 16l2-6h12l2 6v3H4z"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>',
    lieu: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    easter: '<path d="M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z"/><path d="M6 13l3 2 3-2 3 2 3-2"/>',
    collection: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    mission: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    club: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',
    guide: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01"/>',
    recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const ic = (k, c) => `<span class="gs-ic" style="--c:${c}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.lieu}</svg></span>`;
  const IDEAS = ['tank', 'coffres', 'flamants', 'OVNI', 'voiture gratuite', '6969'];

  let items = [], sel = -1, lastQ = '', allCount = 0;
  const box = () => q('#gsRes'), inp = () => q('#gsIn');

  function search(raw) {
    const { secrets = [], players = {}, clubs = [], me, online = new Set(), catOf } = L();
    const nq = norm(raw).trim(); const words = nq.split(/\s+/).filter(Boolean);
    const out = { fiches: [], potes: [], clubs: [], codeHit: false };
    if (!words.length) return out;
    for (const s of secrets) {
      const title = norm(s.title), zone = norm(s.zone), body = norm([s.exact, s.when, s.cost, s.source].join(' '));
      const codes = (s.codes || []).map(c => norm(c)); const cat = norm(catOf ? catOf(s).l : s.cat);
      let score = 0, all = true;
      for (const w of words) {
        let ws = 0;
        if (title.startsWith(w)) ws = 60; else if (new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(title)) ws = 45; else if (title.includes(w)) ws = 35;
        if (codes.some(c => c.includes(w))) ws = Math.max(ws, /\d{3,}/.test(w) ? 80 : 30);
        if (!ws && cat.includes(w)) ws = 25; if (!ws && zone.includes(w)) ws = 20; if (!ws && body.includes(w)) ws = 8;
        if (!ws) { all = false; break } score += ws;
      }
      if (all) {
        const code = (s.codes || []).find(c => words.some(w => norm(c).includes(w)));
        out.fiches.push({ s, score, code: code ? (code.match(/\d[\d\s-]*\d|\d/) || [code])[0] : null }); if (code && /\d{3,}/.test(nq)) out.codeHit = true;
      }
    }
    out.fiches.sort((a, b) => b.score - a.score || norm(a.s.title).localeCompare(norm(b.s.title)));
    for (const [id, p] of Object.entries(players)) {
      const ps = norm(p.pseudo); if (!ps) continue;
      if (words.every(w => ps.includes(w) || norm(p.gamertag).includes(w))) out.potes.push({ id, p, on: id === me || online.has(id), score: ps.startsWith(nq) ? 2 : 1 });
    }
    out.potes.sort((a, b) => b.score - a.score || (b.on - a.on));
    for (const c of clubs) if (words.every(w => norm(c.name).includes(w))) out.clubs.push(c);
    return out;
  }

  function render() {
    const b = box(), raw = inp().value, nq = norm(raw).trim(); if (!b) return;
    items = []; sel = -1; let h = '';
    const add = (html, act) => { items.push(act); return html.replace('<button', `<button id="gsOpt${items.length - 1}" role="option" aria-selected="false" data-gs="${items.length - 1}"`) };
    if (!nq) {
      const rec = (() => { try { return JSON.parse(store('planque.recent') || '[]') } catch { return [] } })();
      if (rec.length) { h += '<div class="gs-sec">Recherches récentes</div>'; for (const r of rec.slice(0, 5)) h += add(`<button type="button" class="gs-it">${ic('recent', 'var(--muted)')}<span class="gs-t"><b>${esc(r)}</b></span></button>`, { t: 'fill', v: r }) }
      h += '<div class="gs-sec">Idées</div><div class="gs-chips">' + IDEAS.map(x => add(`<button type="button">${esc(x)}</button>`, { t: 'fill', v: x })).join('') + '</div>';
    } else {
      const r = search(raw), { catOf, av, players, isPlaying, name } = L(); allCount = r.fiches.length;
      if (r.fiches.length) {
        h += `<div class="gs-sec">Secrets · ${r.fiches.length}</div>`;
        for (const f of r.fiches.slice(0, 6)) {
          const c = catOf ? catOf(f.s) : { l: '', c: '#888' };
          h += add(`<button type="button" class="gs-it">${ic(f.s.cat, c.c)}<span class="gs-t"><b>${hl(f.s.title, nq.split(/\s+/)[0])}</b><small>${esc(c.l)}${f.s.zone ? ' · ' + esc(f.s.zone) : ''}</small></span>${f.code ? `<span class="gs-code">${esc(f.code)}</span>` : ''}</button>`, { t: 'fiche', id: f.s.id });
        }
      }
      if (r.potes.length) {
        h += '<div class="gs-sec">Potes</div>';
        for (const x of r.potes.slice(0, 4)) {
          const st = isPlaying && isPlaying(x.p) ? 'en jeu' + (x.p.chapter ? ' · chapitre ' + (+x.p.chapter) : '') : x.on ? 'en ligne' : 'hors ligne';
          h += add(`<button type="button" class="gs-it">${av ? av(x.id) : ''}<span class="gs-t"><b>${hl(x.p.pseudo, nq)}</b><small>${st}</small></span></button>`, { t: 'pote', id: x.id });
        }
      }
      if (r.clubs.length) {
        h += '<div class="gs-sec">Clubs</div>';
        for (const c of r.clubs.slice(0, 3)) h += add(`<button type="button" class="gs-it">${ic('club', c.color || 'var(--pink)')}<span class="gs-t"><b>${hl(c.name, nq)}</b><small>${Object.keys(c.members || {}).length} membres</small></span></button>`, { t: 'club', id: c.id });
      }
      if (!r.fiches.length && !r.potes.length && !r.clubs.length) h += `<div class="gs-empty">Rien trouvé pour « ${esc(raw.trim())} ».</div>`;
      h += '<div class="gs-sec">Le Guide</div>' + add(`<button type="button" class="gs-it">${ic('guide', 'var(--cyan)')}<span class="gs-t"><b>Demander au Guide</b><small>« ${esc(raw.trim())} »</small></span></button>`, { t: 'guide', v: raw.trim() });
      if (r.fiches.length > 6) h += add(`<button type="button" class="gs-all">Voir les ${r.fiches.length} secrets</button>`, { t: 'all', v: raw.trim() });
    }
    b.innerHTML = h; place(); b.hidden = false; inp().setAttribute('aria-expanded', 'true');
  }
  function place() {
    const b = box(), r = q('.gs-box').getBoundingClientRect(); if (!b) return;
    const mob = innerWidth <= 760, left = mob ? 10 : r.left, width = mob ? innerWidth - 20 : Math.max(r.width, 380);
    b.style.left = Math.max(8, Math.min(left, innerWidth - width - 8)) + 'px'; b.style.width = width + 'px';
    b.style.top = (r.bottom + 8) + 'px';
    const bottomSpace = mob ? 86 : 16; b.style.maxHeight = Math.max(200, innerHeight - r.bottom - 8 - bottomSpace) + 'px';
  }
  function close() { const b = box(); if (b) b.hidden = true; inp()?.setAttribute('aria-expanded', 'false'); inp()?.removeAttribute('aria-activedescendant') }
  function remember(v) { v = String(v || '').trim(); if (v.length < 2) return; let r = []; try { r = JSON.parse(store('planque.recent') || '[]') } catch {} r = [v, ...r.filter(x => norm(x) !== norm(v))].slice(0, 6); store('planque.recent', JSON.stringify(r)) }
  function clickAct(act, id) { const g = document.createElement('button'); g.dataset.act = act; g.dataset.id = id; g.hidden = true; document.body.append(g); g.click(); g.remove() }
  function choose(i) {
    const a = items[i]; if (!a) return;
    if (a.t === 'fill') { inp().value = a.v; inp().focus(); render(); return }
    const v = inp().value; remember(v); close(); inp().blur();
    if (a.t === 'fiche') clickAct('gosecret', a.id);
    else if (a.t === 'pote') {
      location.hash = 'direct';
      setTimeout(() => { const p = L().players?.[a.id]; const el = [...document.querySelectorAll('#players .pl')].find(x => x.textContent.includes(p?.pseudo || '\u0000')); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.animate?.([{ outline: '3px solid var(--pink)' }, { outline: '3px solid transparent' }], { duration: 1600 }) } }, 250);
    }
    else if (a.t === 'club') { location.hash = 'groupe'; setTimeout(() => clickAct('selclub', a.id), 150) }
    else if (a.t === 'guide') { location.hash = 'aide'; setTimeout(() => { const t = q('#askIn'); if (t) { t.value = a.v; t.dispatchEvent(new Event('input', { bubbles: true })); t.focus() } }, 150) }
    else if (a.t === 'all') { location.hash = 'trouver'; setTimeout(() => { const t = q('#q'); if (t) { t.value = a.v; t.dispatchEvent(new Event('input', { bubbles: true })); t.scrollIntoView({ block: 'center' }) } }, 150) }
    inp().value = '';
  }
  function move(d) {
    if (!items.length) return; sel = (sel + d + items.length) % items.length;
    document.querySelectorAll('#gsRes [data-gs]').forEach(el => el.setAttribute('aria-selected', String(+el.dataset.gs === sel)));
    const el = q('#gsOpt' + sel); if (el) { el.scrollIntoView({ block: 'nearest' }); inp().setAttribute('aria-activedescendant', el.id) }
  }

  /* Micro de la recherche (reconnaissance vocale du navigateur) */
  let rec = null;
  function mic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, btn = q('#gsMic'); if (!SR) return;
    if (rec) { try { rec.stop() } catch {} return }
    rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.maxAlternatives = 1;
    btn.classList.add('on');
    rec.onresult = e => { let t = ''; for (const r of e.results) t += r[0].transcript; inp().value = t.trim(); render() };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') L().toast?.('Autorise le micro dans ton navigateur pour chercher à la voix.') };
    rec.onend = () => { rec = null; btn.classList.remove('on'); inp().focus() };
    try { rec.start() } catch { rec = null; btn.classList.remove('on') }
  }

  function init() {
    const i = inp(); if (!i) return;
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) q('#gsMic').hidden = true;
    i.addEventListener('focus', render);
    i.addEventListener('input', render);
    i.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (box().hidden) render(); move(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      else if (e.key === 'Enter') { e.preventDefault(); if (sel >= 0) choose(sel); else { const k = items.findIndex(a => a.t === 'fiche'); if (k >= 0 && allCount === 1) choose(k); else { const all = items.findIndex(a => a.t === 'all'); choose(all >= 0 ? all : k >= 0 ? k : items.length - 1) } } }
      else if (e.key === 'Escape') { close(); i.blur() }
    });
    q('#gsMic').addEventListener('click', mic);
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#gsRes,.gs-box')) close() });
    document.addEventListener('click', e => {
      const o = e.target.closest('[data-gs]'); if (o) { e.preventDefault(); choose(+o.dataset.gs); return }
      const s = e.target.closest('.skinopt'); if (s) { chooseSkin(s.dataset.skin); return }
      const c = e.target.closest('[data-skincard]');
      if (c) { if (c.dataset.skincard === 'go') { location.hash = 'profil'; setTimeout(() => q('#skinBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200) } else { store('planque.skinSeen', '1'); q('#skinCard').hidden = true } }
    });
    addEventListener('resize', () => { if (!box().hidden) place() });
    addEventListener('scroll', () => { if (!box().hidden) place() }, { passive: true });
    addEventListener('hashchange', close);
    addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { e.preventDefault(); i.focus() } });
    applySkin(curSkin());
    window.__uiRender = syncFromProfile;
    syncFromProfile();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
