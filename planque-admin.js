/* La Planque : panneau admin, annonces et signalements.
   Ce fichier utilise les données de l'appli (players, secrets, posts, clubs…) déjà chargées par index.html. */
(function () {
  'use strict';
  const q = s => document.querySelector(s);
  // Données et outils de l'appli (index.html), relus à chaque utilisation
  let isOwner, players = {}, secrets = [], posts = [], clubs = [], online = new Set(), me, db, loaded, assets, byId = {};
  let esc, ago, av, name, countFound, pct, catOf, REGIONS, BASE, toast, openForm, isPlaying, writeErr;
  const sync = () => {
    const L = window.PLQ; if (!L) return false;
    ({ isOwner, players, secrets, posts, clubs, online, me, db, loaded, assets, byId } = L);
    ({ esc, ago, av, name, countFound, pct, catOf, REGIONS, BASE, toast, openForm, isPlaying, writeErr } = L);
    players = players || {}; secrets = secrets || []; posts = posts || []; clubs = clubs || []; online = online || new Set(); byId = byId || {};
    return true;
  };
  const TABS = [['dash', 'Tableau de bord'], ['members', 'Membres'], ['fiches', 'Fiches'], ['moder', 'Modération'], ['announce', 'Annonce'], ['access', 'Accès'], ['guide', 'Guide IA']];
  const A = { tab: 'dash', members: null, memErr: '', memAt: 0, reports: [], invite: null, renaming: null, banning: null, chef: {}, ficheMax: 60, filled: {}, busy: false };
  const P = () => window.PLANQUE;
  const S = () => P()?.settings || {};
  const admin = () => { sync(); return !!isOwner };
  const visible = () => !q('#v-admin')?.hidden;
  const fmtDate = t => { if (!t) return '—'; const d = new Date(t); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) };
  const when = t => { const n = typeof t === 'string' ? Date.parse(t) : t; return n ? ago(n) : 'jamais' };
  const note = (sel, msg, ok) => { const e = q(sel); if (e) { e.textContent = msg || ''; e.style.color = ok === false ? '#ff8a8a' : ok ? '#8fe892' : '' } };
  const errMsg = e => String(e?.message || e || 'erreur').replace(/^.*?:\s*(Réservé|Tu ne|Il faut|Compte)/, '$1');
  const pseudoOf = id => players[id]?.pseudo || '';

  /* ---------- Signalements (pour tout le monde) ---------- */
  function watchReports() {
    try {
      sync(); db.collection('reports').onSnapshot(sn => {
        A.reports = sn.docs.map(d => ({ ...d.data(), id: d.id }));
        if (visible()) renderAdmin(); else renderTabs();
      }, () => {});
    } catch {}
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act="report"]'); if (!b || !sync()) return;
    const id = b.dataset.id, kind = b.dataset.kind;
    if (A.reports.some(r => r.by === me && r.target === id)) { toast('Tu as déjà signalé ça : un admin va regarder.'); return }
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.textContent = 'Confirmer le signalement';
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Signaler' } }, 4000); return;
    }
    const label = kind === 'secret' ? (byId[id]?.title || 'Fiche') : (() => { const po = posts.find(x => x.id === id); return 'Trouvaille de ' + (pseudoOf(po?.by) || 'quelqu\'un') + (po?.note ? ' : « ' + po.note.slice(0, 60) + ' »' : '') })();
    try { await db.collection('reports').add({ kind, target: id, by: me, at: Date.now(), label }); toast('Merci, c\'est signalé : un admin va regarder.'); b.remove() }
    catch (err) { writeErr(err) }
  });

  /* ---------- Annonce sur l'accueil (pour tout le monde) ---------- */
  const annHtml = (txt, x) => `<span class="ann-ic">📣</span><div class="ann-t"><b>Annonce</b><p>${esc(txt)}</p></div>${x ? '<button class="ann-x" type="button" data-adm="anndismiss" aria-label="Masquer l\'annonce">×</button>' : ''}`;
  function renderAnn() {
    if (!sync()) return;
    const bar = q('#annBar'); if (!bar) return;
    const s = S(); let seen = ''; try { seen = localStorage.getItem('planque.annSeen') || '' } catch {}
    const show = !!(s.announce_on && (s.announce || '').trim()) && seen !== String(s.announce_at);
    bar.hidden = !show; if (show) bar.innerHTML = annHtml(s.announce, true);
  }

  /* ---------- Données des membres (réservées aux admins) ---------- */
  async function loadMembers(force) {
    if (!admin() || A.loadingMem) return;
    if (!force && A.members && Date.now() - A.memAt < 30000) return;
    A.loadingMem = true;
    try {
      const { data, error } = await P().sb.rpc('admin_members');
      if (error) throw error;
      A.members = data || []; A.memErr = ''; A.memAt = Date.now();
    } catch (e) { A.memErr = /admin_members|function|schema cache/i.test(e?.message || '') ? 'missing' : errMsg(e) }
    A.loadingMem = false;
    if (visible()) renderAdmin();
  }
  function memberList() {
    const m = new Map();
    for (const r of (A.members || [])) m.set(r.id, { ...r });
    for (const id of Object.keys(players)) if (!m.has(id)) m.set(id, { id });
    return [...m.values()].map(r => ({ ...r, p: players[r.id], on: r.id === me || online.has(r.id), playing: isPlaying(players[r.id]), adm: r.is_admin ?? window.ADMIN_IDS?.has(r.id) }));
  }

  /* ---------- Rendu ---------- */
  function renderTabs() {
    sync();
    const box = q('#admTabs'); if (!box) return;
    const open = new Set(A.reports.map(r => r.target)).size;
    box.innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-adm="tab" data-id="${k}" aria-selected="${A.tab === k}">${l}${k === 'moder' && open ? `<span class="n">${open}</span>` : ''}</button>`).join('');
  }
  function renderAdmin() {
    sync();
    const tab = document.querySelector('.admtab'); if (tab) tab.hidden = !admin();
    if (!visible()) return;
    if (!admin()) {
      q('#admTabs').innerHTML = ''; document.querySelectorAll('.adm-pane').forEach(p => p.hidden = true);
      q('#admNotice').innerHTML = '<div class="panel"><h3>Réservé aux admins</h3><p class="src" style="margin:6px 0 0">Cette page sert à gérer la Planque. Si tu devrais y avoir accès, demande à un admin de te nommer.</p></div>';
      return;
    }
    renderTabs();
    document.querySelectorAll('.adm-pane').forEach(p => p.hidden = p.dataset.pane !== A.tab);
    const missing = !('signups_open' in S()) || A.memErr === 'missing';
    q('#admNotice').innerHTML = missing ? '<div class="authmsg" style="margin-bottom:12px">Il manque une étape : lance le fichier <b>admin.sql</b> dans Supabase (SQL Editor &gt; New &gt; coller &gt; Run), puis recharge cette page.</div>' : '';
    ({ dash: rDash, members: rMembers, fiches: rFiches, moder: rModer, announce: rAnnounce, access: rAccess, guide: rGuide })[A.tab]?.();
  }

  function rDash() {
    const mem = memberList(), on = mem.filter(m => m.on).length, play = mem.filter(m => m.playing).length;
    const ver = secrets.filter(s => s.status === 'verifier').length, rep = new Set(A.reports.map(r => r.target)).size;
    const gToday = (A.members || []).reduce((t, m) => t + (m.guide_today || 0), 0), s = S();
    const tile = (n, l, go, hot) => `<button class="adm-stat${hot ? ' hot' : ''}" type="button" data-adm="tab" data-id="${go}"><b>${n}</b><small>${l}</small></button>`;
    const signs = s.signups_open === false ? 'fermées' : s.invite_required ? 'avec code d\'invitation' : 'ouvertes à tous';
    const line = (ic, t, st, go) => `<div class="adm-row"><div class="adm-top"><span style="font-size:20px">${ic}</span><div><b>${t}</b><div class="meta">${st}</div></div><button class="link" type="button" data-adm="tab" data-id="${go}">Gérer</button></div></div>`;
    const recent = (A.members || []).slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5);
    q('#admDash').innerHTML = `
      <div class="adm-stats">
        ${tile(A.members ? A.members.length : Object.keys(players).length, 'membres', 'members')}
        ${tile(on, 'en ligne maintenant', 'members')}
        ${tile(play, 'en train de jouer', 'members')}
        ${tile(secrets.length, `fiches · ${ver} à vérifier`, 'fiches')}
        ${tile(posts.length, 'trouvailles postées', 'moder')}
        ${tile(rep, 'signalement' + (rep > 1 ? 's' : '') + ' à traiter', 'moder', rep > 0)}
        ${tile(clubs.length, 'clubs', 'moder')}
        ${tile(gToday, 'questions au Guide aujourd\'hui', 'guide')}
      </div>
      <h3>État du site</h3>
      <div class="adm-list">
        ${line('🛠️', 'Maintenance', s.maintenance ? '<span class="adm-tag red">activée</span> seuls les admins voient le site' : '<span class="adm-tag green">désactivée</span> le site est ouvert', 'access')}
        ${line('🔑', 'Inscriptions', signs, 'access')}
        ${line('📣', 'Annonce', s.announce_on && s.announce ? '« ' + esc(s.announce.slice(0, 80)) + (s.announce.length > 80 ? '…' : '') + ' »' : 'aucune annonce en ligne', 'announce')}
        ${line('🤖', 'Guide IA', !P().guideInstalled ? 'pas installé (étape 7 du mode d\'emploi)' : s.guide_on === false ? '<span class="adm-tag red">coupé</span>' : `<span class="adm-tag green">activé</span> ${s.guide_limit || 40} questions par personne et par jour`, 'guide')}
      </div>
      ${recent.length ? `<h3 style="margin-top:22px">Derniers inscrits</h3><div class="adm-list">${recent.map(m => `<div class="adm-row"><div class="adm-top">${players[m.id] ? av(m.id, 'sm') : ''}<div><b>${players[m.id] ? name(m.id) : esc(m.email)}</b><div class="meta">inscrit ${when(m.created_at)}${players[m.id] ? '' : ' · n\'a pas encore choisi de pseudo'}</div></div></div></div>`).join('')}</div>` : ''}`;
    if (!A.members && !A.memErr) loadMembers();
  }

  function rMembers() {
    if (!A.members && !A.memErr) { loadMembers(); }
    const qq = (q('#admMemQ').value || '').trim().toLowerCase(), fl = q('#admMemF').value;
    let list = memberList();
    if (qq) list = list.filter(m => (m.p?.pseudo || '').toLowerCase().includes(qq) || (m.email || '').toLowerCase().includes(qq));
    if (fl === 'online') list = list.filter(m => m.on);
    if (fl === 'admins') list = list.filter(m => m.adm);
    if (fl === 'banned') list = list.filter(m => m.banned);
    if (fl === 'noprofile') list = list.filter(m => !m.p);
    list.sort((a, b) => (b.playing - a.playing) || (b.on - a.on) || ((b.p?.updatedAt || Date.parse(b.last_sign_in_at) || 0) - (a.p?.updatedAt || Date.parse(a.last_sign_in_at) || 0)));
    const total = secrets.length;
    const row = m => {
      const self = m.id === me, n = m.p ? countFound(m.id) : 0, pc = pct(n, total);
      const tags = (m.adm ? '<span class="adm-tag yel">admin</span>' : '') + (m.banned ? '<span class="adm-tag red">banni</span>' : '') + (m.playing ? '<span class="adm-tag green">en jeu</span>' : m.on ? '<span class="adm-tag green">en ligne</span>' : '') + (self ? '<span class="adm-tag">toi</span>' : '') + (!m.p ? '<span class="adm-tag">sans pseudo</span>' : '');
      const seen = Math.max(m.p?.updatedAt || 0, Date.parse(m.last_sign_in_at || '') || 0);
      let extra = '';
      if (A.renaming === m.id) extra = `<div class="adm-inline"><input id="admRenameIn" maxlength="24" value="${esc(m.p?.pseudo || '')}" placeholder="Nouveau pseudo"><button class="btn sm" type="button" data-adm="renamego" data-id="${m.id}">Enregistrer</button><button class="link" type="button" data-adm="cancel">Annuler</button></div>`;
      if (A.banning === m.id) extra = `<div class="adm-inline"><input id="admBanIn" maxlength="140" placeholder="Raison (facultatif, il ne la verra pas)"><button class="btn sm" type="button" data-adm="bango" data-id="${m.id}" style="background:#ff6b6b">Bannir</button><button class="link" type="button" data-adm="cancel">Annuler</button></div>`;
      const acts = [];
      if (m.p) acts.push(`<button class="link" type="button" data-adm="rename" data-id="${m.id}">Renommer</button>`);
      if (m.p) acts.push(`<button class="link" type="button" data-adm="reset" data-id="${m.id}">Remettre à zéro</button>`);
      if (!self && A.members) {
        acts.push(m.adm ? `<button class="link" type="button" data-adm="unadmin" data-id="${m.id}">Retirer admin</button>` : `<button class="link" type="button" data-adm="mkadmin" data-id="${m.id}">Nommer admin</button>`);
        acts.push(m.banned ? `<button class="link" type="button" data-adm="unban" data-id="${m.id}">Débannir</button>` : `<button class="link danger" type="button" data-adm="ban" data-id="${m.id}">Bannir</button>`);
        acts.push(`<button class="link danger" type="button" data-adm="deluser" data-id="${m.id}">Supprimer le compte</button>`);
      }
      return `<div class="adm-row${m.banned ? ' banned' : ''}">
        <div class="adm-top">${m.p ? av(m.id) : '<span class="av" style="background:#555">?</span>'}<div><b>${m.p ? esc(m.p.pseudo) : esc(m.email || 'Compte')}</b>${tags}
          <div class="meta">${m.email && m.p ? `<span>${esc(m.email)}</span>` : ''}${m.created_at ? `<span>inscrit le ${fmtDate(m.created_at)}</span>` : ''}<span>vu ${seen ? when(seen) : 'jamais'}</span>${m.p ? `<span>chapitre ${+(m.p.chapter || 1)}</span>` : ''}${m.guide_today ? `<span>Guide : ${m.guide_today} aujourd'hui</span>` : ''}${m.banned && m.ban_reason ? `<span>raison : ${esc(m.ban_reason)}</span>` : ''}</div></div>
          ${m.p ? `<div style="text-align:right"><small class="src">${n}/${total} · ${pc} %</small><div class="adm-bar"><i style="width:${pc}%"></i></div></div>` : ''}</div>
        ${extra}<div class="acts">${acts.join('')}</div></div>`;
    };
    q('#admMembers').innerHTML = (A.memErr && A.memErr !== 'missing' ? `<p class="authmsg">${esc(A.memErr)}</p>` : '') + (A.loadingMem && !A.members ? '<p class="adm-empty">Chargement des membres…</p>' : '') +
      (list.length ? `<div class="adm-list">${list.map(row).join('')}</div>` : '<p class="adm-empty">Personne ne correspond.</p>');
    if (A.renaming) setTimeout(() => q('#admRenameIn')?.focus(), 0);
    if (A.banning) setTimeout(() => q('#admBanIn')?.focus(), 0);
  }

  function rFiches() {
    const qq = (q('#admFicheQ').value || '').trim().toLowerCase(), fl = q('#admFicheF').value;
    const repBy = {}; for (const r of A.reports) if (r.kind === 'secret') repBy[r.target] = (repBy[r.target] || 0) + 1;
    let list = secrets.slice();
    if (qq) list = list.filter(s => [s.title, s.zone, s.exact, s.id].join(' ').toLowerCase().includes(qq));
    if (fl === 'verifier') list = list.filter(s => s.status === 'verifier');
    if (fl === 'confirme') list = list.filter(s => s.status !== 'verifier');
    if (fl === 'reported') list = list.filter(s => repBy[s.id]);
    list.sort((a, b) => (repBy[b.id] || 0) - (repBy[a.id] || 0) || (b.createdAt || 0) - (a.createdAt || 0));
    const shown = list.slice(0, A.ficheMax);
    q('#admFiches').innerHTML = (list.length ? `<p class="src" style="margin:0 0 8px">${list.length} fiche${list.length > 1 ? 's' : ''}</p><div class="adm-list">${shown.map(s => {
      const c = catOf(s), ver = s.status === 'verifier';
      return `<div class="adm-row"><div class="adm-top"><span class="tag" style="--c:${c.c}">${esc(c.l)}</span><div><b>${esc(s.title || 'Sans titre')}</b>${ver ? '<span class="adm-tag yel">à vérifier</span>' : '<span class="adm-tag green">confirmée</span>'}${repBy[s.id] ? `<span class="adm-tag red">${repBy[s.id]} signalement${repBy[s.id] > 1 ? 's' : ''}</span>` : ''}
        <div class="meta"><span>${esc(REGIONS[s.region] || 'Partout')}</span>${s.chapter ? `<span>chapitre ${+s.chapter}</span>` : ''}<span>par ${s.author === 'planque' || s.author === BASE ? 'la Planque' : name(s.author)}</span>${s.createdAt ? `<span>${when(s.createdAt)}</span>` : ''}</div></div></div>
        <div class="acts"><button class="link" type="button" data-act="edit" data-id="${s.id}">Modifier</button><button class="link" type="button" data-adm="status" data-id="${s.id}">${ver ? 'Marquer confirmée' : 'Marquer à vérifier'}</button><button class="link" type="button" data-act="gosecret" data-id="${s.id}">Voir</button><button class="link danger" type="button" data-act="del" data-id="${s.id}">Supprimer</button></div></div>`;
    }).join('')}</div>${list.length > shown.length ? `<div style="text-align:center;margin-top:12px"><button class="btn ghost sm" type="button" data-adm="more">Voir plus (${list.length - shown.length})</button></div>` : ''}` : '<p class="adm-empty">Aucune fiche ne correspond.</p>');
  }

  function rModer() {
    const groups = {}; for (const r of A.reports) (groups[r.target] ||= []).push(r);
    const g = Object.values(groups).sort((a, b) => b.length - a.length || Math.max(...b.map(x => x.at || 0)) - Math.max(...a.map(x => x.at || 0)));
    q('#admReports').innerHTML = g.length ? `<div class="adm-list">${g.map(rs => {
      const r = rs[0], exists = r.kind === 'secret' ? !!byId[r.target] : posts.some(p => p.id === r.target);
      const who = [...new Set(rs.map(x => x.by))].map(id => name(id)).join(', ');
      return `<div class="adm-row"><div class="adm-top"><span style="font-size:20px">🚩</span><div><b>${esc(r.kind === 'secret' ? (byId[r.target]?.title || r.label || 'Fiche') : (r.label || 'Trouvaille'))}</b><span class="adm-tag">${r.kind === 'secret' ? 'fiche' : 'trouvaille'}</span>${rs.length > 1 ? `<span class="adm-tag red">${rs.length} signalements</span>` : ''}${exists ? '' : '<span class="adm-tag">déjà supprimé</span>'}
        <div class="meta"><span>signalé par ${who}</span><span>${when(Math.max(...rs.map(x => x.at || 0)))}</span></div></div></div>
        <div class="acts">${exists ? `<button class="link" type="button" data-adm="repview" data-id="${r.target}" data-kind="${r.kind}">Voir</button><button class="link danger" type="button" data-adm="repdel" data-id="${r.target}" data-kind="${r.kind}">Supprimer le contenu</button>` : ''}<button class="link" type="button" data-adm="repok" data-id="${r.target}">${exists ? 'Ignorer (c\'est OK)' : 'Retirer de la liste'}</button></div></div>`;
    }).join('')}</div>` : '<p class="adm-empty">Aucun signalement. Tout est calme 👌</p>';

    q('#admPosts').innerHTML = posts.length ? `<div class="adm-list">${posts.slice(0, 50).map(po => {
      const s = po.secretId && byId[po.secretId], th = ['map', 'place'].filter(k => po[k] && /^[A-Za-z0-9_-]{8,64}$/.test(po[k])).map(k => `<img src="${P().photoBase}${po[k]}" alt="" loading="lazy">`).join('');
      return `<div class="adm-row"><div class="adm-top">${av(po.by, 'sm')}<div><b>${name(po.by)}</b><div class="meta"><span>${when(po.at)}</span>${s ? `<span>${esc(s.title)}</span>` : ''}</div>${po.note ? `<div class="src" style="margin-top:4px">« ${esc(po.note.slice(0, 140))} »</div>` : ''}</div>${th ? `<div class="adm-thumbs">${th}</div>` : ''}</div>
        <div class="acts"><button class="link danger" type="button" data-act="delpost" data-id="${po.id}">Supprimer</button></div></div>`;
    }).join('')}</div>` : '<p class="adm-empty">Aucune trouvaille postée pour l\'instant.</p>';

    q('#admClubs').innerHTML = clubs.length ? `<div class="adm-list">${clubs.map(c => {
      const ids = Object.keys(c.members || {});
      const opts = ids.map(id => `<option value="${id}"${id === c.admin ? ' selected' : ''}>${esc(pseudoOf(id) || 'Un joueur')}</option>`).join('');
      return `<div class="adm-row"><div class="adm-top"><div><b>${esc(c.name || 'Club')}</b><div class="meta"><span>chef : ${name(c.admin)}</span><span>${ids.length} membre${ids.length > 1 ? 's' : ''}</span></div></div></div>
        ${ids.length > 1 ? `<div class="adm-inline"><select data-chef="${c.id}">${opts}</select><button class="btn ghost sm" type="button" data-adm="chef" data-id="${c.id}">Changer le chef</button></div>` : ''}
        <div class="acts"><button class="link danger" type="button" data-adm="delclub" data-id="${c.id}">Supprimer le club</button></div></div>`;
    }).join('')}</div>` : '<p class="adm-empty">Aucun club pour l\'instant.</p>';
  }

  function rAnnounce() {
    const s = S(), ta = q('#admAnnText');
    if (!A.filled.ann && document.activeElement !== ta) { ta.value = s.announce || ''; A.filled.ann = true }
    note('#admAnnState', s.announce_on && s.announce ? 'En ligne depuis ' + when(s.announce_at) + '.' : 'Aucune annonce en ligne.');
    const txt = (ta.value || '').trim();
    q('#admAnnPrev').innerHTML = txt ? `<div id="annPrevBox" style="display:flex;gap:12px;border-radius:18px;padding:14px 16px;background:linear-gradient(90deg,rgba(255,79,163,.22),rgba(255,154,60,.18));border:1px solid rgba(255,79,163,.5)">${annHtml(txt, false)}</div>` : '<p class="adm-empty">Écris un message pour voir l\'aperçu.</p>';
    const pb = q('#annPrevBox'); if (pb) { pb.querySelector('.ann-t b').style.cssText = 'display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ff4fa3'; pb.querySelector('p').style.margin = '0' }
  }

  async function loadInvite() {
    try { const { data, error } = await P().sb.rpc('admin_get_invite'); if (!error) { A.invite = data || ''; if (document.activeElement !== q('#admInvCode')) q('#admInvCode').value = A.invite; invLink() } } catch {}
  }
  const invLink = () => { const c = (q('#admInvCode').value || '').trim().toUpperCase(); q('#admInvLink').value = c ? location.origin + location.pathname + '?invite=' + encodeURIComponent(c) : location.origin + location.pathname };
  function rAccess() {
    const s = S();
    q('#admSignOpen').checked = s.signups_open !== false;
    q('#admInvReq').checked = !!s.invite_required;
    q('#admInvReq').disabled = s.signups_open === false;
    q('#admInvBox').hidden = !s.invite_required || s.signups_open === false;
    q('#admSignState').innerHTML = s.signups_open === false ? '<b>Fermées</b> : personne ne peut créer de compte (les comptes existants marchent toujours).'
      : s.invite_required ? '<b>Sur invitation</b> : il faut le code pour créer un compte.' : '<b>Ouvertes</b> : toute personne qui a le lien peut créer un compte.';
    if (A.invite === null) loadInvite(); else invLink();
  }
  function rGuide() {
    const s = S();
    if (!A.filled.guide || document.activeElement !== q('#admGuideLim')) { q('#admGuideOn').checked = s.guide_on !== false; q('#admGuideLim').value = s.guide_limit || 40; A.filled.guide = true }
    q('#admGuideState').innerHTML = !P().guideInstalled ? 'La fonction du Guide n\'est pas encore installée sur ce site (étape 7 du mode d\'emploi). Tu peux quand même préparer les réglages.'
      : s.guide_on === false ? '<b>Coupé</b> : personne ne peut poser de question.' : `<b>Activé</b> : ${s.guide_limit || 40} questions par personne et par jour.`;
    if (!A.members && !A.memErr) loadMembers();
    const rows = (A.members || []).filter(m => m.guide_week > 0).sort((a, b) => b.guide_week - a.guide_week);
    const mx = Math.max(1, ...rows.map(r => r.guide_week));
    q('#admGuideUse').innerHTML = rows.length ? `<div class="adm-list">${rows.map(m => `<div class="adm-row"><div class="adm-top">${players[m.id] ? av(m.id, 'sm') : ''}<div><b>${players[m.id] ? name(m.id) : esc(m.email)}</b><div class="meta"><span>${m.guide_today} aujourd'hui</span><span>${m.guide_week} sur 7 jours</span></div></div><div class="adm-bar"><i style="width:${Math.round(m.guide_week * 100 / mx)}%"></i></div></div></div>`).join('')}</div>`
      : '<p class="adm-empty">Personne n\'a posé de question cette semaine.</p>';
  }

  /* ---------- Actions ---------- */
  const armed = (b, label) => {
    if (b.dataset.armed) return true;
    const old = b.textContent; b.dataset.armed = '1'; b.textContent = label || 'Sûr ? Clique encore';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = old } }, 4000);
    return false;
  };
  const rpc = async (fn, args) => { const { error } = await P().sb.rpc(fn, args); if (error) throw error };
  async function saveSet(patch, msgSel, okMsg) {
    try { await P().saveSettings(patch); if (msgSel) note(msgSel, okMsg || 'Enregistré ✓', true) }
    catch (e) { if (msgSel) note(msgSel, 'Ça n\'a pas marché : ' + errMsg(e) + (/column|schema/i.test(e?.message || '') ? ' (lance admin.sql dans Supabase)' : ''), false) }
    renderAdmin();
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-adm]'); if (!b || !sync()) return;
    const act = b.dataset.adm, id = b.dataset.id;
    if (act === 'anndismiss') { try { localStorage.setItem('planque.annSeen', String(S().announce_at)) } catch {} q('#annBar').hidden = true; return }
    if (!admin()) return;
    try {
      if (act === 'tab') { A.tab = id; A.renaming = A.banning = null; if (location.hash !== '#admin') location.hash = 'admin'; renderAdmin(); scrollTo({ top: 0 }); if (id === 'members' || id === 'guide') loadMembers(); return }
      if (act === 'cancel') { A.renaming = A.banning = null; renderAdmin(); return }
      if (act === 'rename') { A.renaming = id; A.banning = null; renderAdmin(); return }
      if (act === 'renamego') {
        const v = (q('#admRenameIn').value || '').trim().slice(0, 24); if (!v) return;
        if (Object.entries(players).some(([pid, p]) => pid !== id && (p.pseudo || '').toLowerCase() === v.toLowerCase())) { toast('Ce pseudo est déjà pris.'); return }
        await db.doc('players/' + id).update({ pseudo: v }); A.renaming = null; toast('Pseudo changé ✓'); renderAdmin(); return;
      }
      if (act === 'reset') {
        if (!armed(b, 'Tout effacer ? Clique encore')) return;
        const { id: _i, ...p } = players[id] || {}; await db.doc('players/' + id).set({ ...p, found: {}, steps: {}, chapter: 1, updatedAt: Date.now() });
        toast('Progression remise à zéro.'); return;
      }
      if (act === 'mkadmin' || act === 'unadmin') {
        if (act === 'unadmin' && !armed(b, 'Retirer ? Clique encore')) return;
        await rpc('admin_set_admin', { target: id, make_admin: act === 'mkadmin' }); toast(act === 'mkadmin' ? 'Nouvel admin nommé ✓' : 'Ce n\'est plus un admin.');
        await P().refreshAdmins(); await loadMembers(true); return;
      }
      if (act === 'ban') { A.banning = id; A.renaming = null; renderAdmin(); return }
      if (act === 'bango') { await rpc('admin_set_ban', { uid: id, banned: true, why: (q('#admBanIn').value || '').trim() }); A.banning = null; toast('Compte banni.'); await loadMembers(true); return }
      if (act === 'unban') { await rpc('admin_set_ban', { uid: id, banned: false, why: '' }); toast('Compte débanni.'); await loadMembers(true); return }
      if (act === 'deluser') {
        if (!armed(b, 'Définitif ! Clique encore')) return;
        await rpc('admin_delete_user', { uid: id }); toast('Compte supprimé.'); await loadMembers(true); return;
      }
      if (act === 'newfiche') { openForm(); return }
      if (act === 'more') { A.ficheMax += 60; renderAdmin(); return }
      if (act === 'status') {
        const s = byId[id]; if (!s) return; const { id: _x, ...rest } = s; const ver = s.status === 'verifier';
        await db.doc('secrets/' + id).set(ver ? { ...rest, status: 'confirme', confirmedBy: me, confirmedAt: Date.now() } : { ...rest, status: 'verifier' });
        toast(ver ? 'Fiche confirmée ✓' : 'Fiche marquée à vérifier.'); return;
      }
      if (act === 'importopen') { q('#admImport').hidden = !q('#admImport').hidden; return }
      if (act === 'importgo') {
        let data; try { data = JSON.parse(q('#admImportTxt').value) } catch { note('#admImportMsg', 'Ce texte n\'est pas une sauvegarde valide.', false); return }
        const sec = Array.isArray(data) ? data : data.secrets || [], pin = Array.isArray(data) ? [] : data.pins || [];
        let n = 0, k = 0; b.disabled = true;
        for (const x of sec) { if (!x || !x.id || !x.title) continue; const { id: sid, ...rest } = x; await db.doc('secrets/' + String(sid).replace(/[\/\s]/g, '-')).set(rest); n++ }
        for (const x of pin) { if (!x || !x.id) continue; const { id: pid, ...rest } = x; await db.doc('pins/' + String(pid).replace(/[\/\s]/g, '-')).set(rest); k++ }
        b.disabled = false; note('#admImportMsg', `${n} fiche${n > 1 ? 's' : ''} et ${k} point${k > 1 ? 's' : ''} importés ✓`, true); return;
      }
      if (act === 'repview') { if (b.dataset.kind === 'secret') { const g = document.createElement('button'); g.dataset.act = 'gosecret'; g.dataset.id = id; g.hidden = true; document.body.append(g); g.click(); g.remove() } else location.hash = 'trouvailles'; return }
      if (act === 'repdel') {
        if (!armed(b, 'Supprimer ? Clique encore')) return;
        if (b.dataset.kind === 'secret') await db.doc('secrets/' + id).delete();
        else { const po = posts.find(x => x.id === id); await db.doc('posts/' + id).delete(); if (po && assets) for (const k of ['map', 'place']) if (po[k]) assets.delete(po[k]).catch(() => {}) }
        for (const r of A.reports.filter(r => r.target === id)) await db.doc('reports/' + r.id).delete();
        toast('Contenu supprimé.'); return;
      }
      if (act === 'repok') { for (const r of A.reports.filter(r => r.target === id)) await db.doc('reports/' + r.id).delete(); toast('Signalement retiré.'); return }
      if (act === 'chef') { const v = document.querySelector(`[data-chef="${id}"]`)?.value; if (!v) return; await db.doc('clubs/' + id).update({ admin: v }); toast('Nouveau chef de club ✓'); return }
      if (act === 'delclub') { if (!armed(b, 'Supprimer le club ? Clique encore')) return; await rpc('admin_delete_club', { cid: id }); toast('Club supprimé.'); return }
      if (act === 'annpub') {
        const t = (q('#admAnnText').value || '').trim().slice(0, 280); if (!t) { note('#admAnnState', 'Écris d\'abord ton message.', false); return }
        await saveSet({ announce: t, announce_on: true, announce_at: Date.now() }, '#admAnnState', 'Annonce publiée ✓ Toute la bande la voit sur l\'accueil.'); return;
      }
      if (act === 'annoff') { await saveSet({ announce_on: false }, '#admAnnState', 'Annonce retirée.'); return }
      if (act === 'invgen') { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(6)); q('#admInvCode').value = 'PLANQUE-' + [...r].map(x => a[x % a.length]).join(''); invLink(); note('#admSignMsg', 'Clique sur « Enregistrer le code » pour le valider.'); return }
      if (act === 'invsave') {
        const c = (q('#admInvCode').value || '').trim().toUpperCase(); if (c.length < 4) { note('#admSignMsg', 'Choisis un code d\'au moins 4 caractères.', false); return }
        await rpc('admin_set_invite', { code: c }); A.invite = c; q('#admInvCode').value = c; invLink(); note('#admSignMsg', 'Code enregistré ✓ Envoie le lien d\'invitation à tes potes.', true); return;
      }
      if (act === 'invcopy') { const v = q('#admInvLink').value; try { await navigator.clipboard.writeText(v); note('#admSignMsg', 'Lien copié ✓', true) } catch { q('#admInvLink').select(); note('#admSignMsg', 'Sélectionné : fais Ctrl + C (ou appui long > Copier).') } return }
      if (act === 'guidesave') {
        const lim = Math.max(1, Math.min(500, parseInt(q('#admGuideLim').value, 10) || 40));
        await saveSet({ guide_on: q('#admGuideOn').checked, guide_limit: lim }, '#admGuideMsg', 'Enregistré ✓ (les potes qui avaient déjà le site ouvert devront recharger la page)'); return;
      }
    } catch (err) {
      const m = errMsg(err); toast('Ça n\'a pas marché : ' + esc(m));
      if (/admin_|function|schema cache/i.test(err?.message || '')) A.memErr = 'missing';
      renderAdmin();
    }
  });
  document.addEventListener('change', async e => {
    const t = e.target; if (!admin()) return;
    if (t.id === 'admSignOpen') await saveSet({ signups_open: t.checked }, '#admSignMsg', t.checked ? 'Inscriptions ouvertes ✓' : 'Inscriptions fermées ✓');
    if (t.id === 'admInvReq') {
      if (t.checked && !A.invite) {
        const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(6)), c = 'PLANQUE-' + [...r].map(x => a[x % a.length]).join('');
        try { await rpc('admin_set_invite', { code: c }); A.invite = c; q('#admInvCode').value = c } catch (err) { note('#admSignMsg', 'Ça n\'a pas marché : ' + errMsg(err), false); t.checked = false; return }
      }
      await saveSet({ invite_required: t.checked }, '#admSignMsg', t.checked ? 'Code d\'invitation obligatoire ✓ Envoie le lien ci-dessous à tes potes.' : 'Plus besoin de code ✓');
    }
    if (t.id === 'admMemF' || t.id === 'admFicheF') renderAdmin();
  });
  document.addEventListener('input', e => {
    if (!sync()) return;
    const id = e.target.id;
    if (id === 'admMemQ' || id === 'admFicheQ') { A.ficheMax = 60; renderAdmin() }
    if (id === 'admAnnText') rAnnounce();
    if (id === 'admInvCode') invLink();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'admRenameIn') q('[data-adm="renamego"]')?.click();
    if (e.key === 'Enter' && e.target.id === 'admBanIn') q('[data-adm="bango"]')?.click();
  });

  /* ---------- Branchement sur l'appli ---------- */
  let rT = null;
  const soon = () => { clearTimeout(rT); rT = setTimeout(() => { renderAnn(); renderAdmin() }, 60) };
  function init() {
    window.__admRender = soon;
    P().onSettings(soon);
    addEventListener('hashchange', () => { if (location.hash === '#admin') { A.filled = {}; loadMembers(); soon() } });
    watchReports();
    setInterval(() => { if (visible() && !document.hidden) loadMembers() }, 60000);
    soon();
    if (location.hash === '#admin') loadMembers();
  }
  const wait = setInterval(() => { if (sync() && db && loaded && window.PLANQUE) { clearInterval(wait); init() } }, 250);
})();
