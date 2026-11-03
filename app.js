/* GlukoSim v3 – Tagesassistent, Schritte, Vergleich, Einstellungen */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const H = Optimierer.hhmm, klon = Optimierer.klon, neueId = Optimierer.neueId, titel = Optimierer.titel;
  const VERSION = '3.3.0';
  const SPEICHER = 'glukosim-v3';
  const PROFILE_LISTE = ['gesund', 'typ1', 'typ2'];
  const PROFIL_INFO = {
    gesund: ['Gesund', 'Die Bauchspeicheldrüse regelt das Insulin automatisch.'],
    typ1: ['Diabetes Typ 1', 'Kein eigenes Insulin. Es wird gespritzt.'],
    typ2: ['Diabetes Typ 2', 'Insulin wirkt schwächer (Insulinresistenz).']
  };
  const MAHLZEITEN = [['fruehstueck', 'Frühstück', 'z. B. Toast'], ['mittag', 'Mittagessen', 'z. B. Nudeln'], ['abend', 'Abendessen', 'z. B. Reis']];
  const BEWEGUNG = { Spazieren: 'leicht', Joggen: 'mittel', Radfahren: 'mittel' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ico = id => '<svg><use href="#i-' + id + '"/></svg>';
  const vib = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* egal */ } };
  const zuMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return Math.max(0, Math.min(1439, (h || 0) * 60 + (m || 0))); };
  const heute = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const segmentWahl = (el, w) => { for (const b of $$('button', el)) b.setAttribute('aria-checked', b.dataset.wert === w); };

  // ---------------- Zustand ----------------
  const STANDARD = {
    profil: 'gesund', gewicht: 70, insulinAuto: true, erklaerungen: true,
    tag: '', mahlzeiten: [], bewegung: [], sportZeitraum: [900, 1230], schritte: [], nichtNoetig: [], schrittIndex: 0,
    insulinZeigen: false, vInsulinZeigen: false, vAus: {}, zoom: 0, vZoom: 0
  };
  const z = Object.assign({}, STANDARD, (() => { try { return JSON.parse(localStorage.getItem(SPEICHER)) || {}; } catch (e) { return {}; } })());
  delete z.apiKey; delete z.modell;
  try { localStorage.removeItem('glukosim-ki-cache'); } catch (e) { /* egal */ }
  const speichern = () => { try { localStorage.setItem(SPEICHER, JSON.stringify(z)); } catch (e) { toast('Speichern fehlgeschlagen'); } };
  const opt = () => ({ gewicht: z.gewicht, autoInsulin: z.insulinAuto });
  const schritt = () => z.schritte[z.schrittIndex] || null;
  const plan = () => (schritt() ? schritt().plan : []);

  let sim = null, st = null, simVorher = null, erklaerung = null, vErklaerung = null, version = 0;
  let seite = 'plan', planChart = null, vChart = null, installEvent = null;

  function berechneSchritte() {
    const s = Optimierer.planeSchritte(z.mahlzeiten, z.bewegung, z.profil, opt(), z.sportZeitraum);
    z.nichtNoetig = s.nichtNoetig || [];
    z.schritte = s.map(x => ({ key: x.key, titel: x.titel, text: x.text, plan: x.plan, aenderungen: x.aenderungen || [] }));
    z.schrittIndex = 0;
  }
  function neuBerechnet() { version++; erklaerung = null; vErklaerung = null; speichern(); renderPlan(); }

  // ---------------- Hilfen ----------------
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('zeigen'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('zeigen'), 3400); }
  function md(text) {
    return String(text || '').split(/\n{2,}/).map(b => {
      const zl = b.split('\n').filter(x => x.trim()), f = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      if (zl.length && zl.every(x => /^\s*[-*•]\s+/.test(x))) return '<ul>' + zl.map(x => '<li>' + f(x.replace(/^\s*[-*•]\s+/, '')) + '</li>').join('') + '</ul>';
      return '<p>' + zl.map(x => f(x.replace(/^#+\s*/, ''))).join('<br>') + '</p>';
    }).join('');
  }
  const therapie = p => (p === 'typ1' && z.insulinAuto ? GlukoSim.standardTherapie(p === 'typ1' ? plan() : []) : []);

  // ---------------- Plan ----------------
  function renderKurve() {
    const P = GlukoSim.PROFILE[z.profil];
    sim = GlukoSim.simuliere(plan(), z.profil, opt());
    st = GlukoSim.statistik(sim, z.profil);
    const vor = z.schritte[z.schrittIndex - 1];
    simVorher = vor ? GlukoSim.simuliere(vor.plan, z.profil, opt()) : null;
    const serien = [{ G: sim.G }];
    if (simVorher) serien.push({ G: simVorher.G, gestrichelt: true, farbe: 'rgba(233,237,248,0.55)' });
    const marker = plan().map(e => e.typ === 'sport' ? { t: e.zeit, breite: e.dauer, farbe: 'rgba(143,180,255,0.08)' } : { t: e.zeit, farbe: 'rgba(233,237,248,0.16)' })
      .concat(therapie(z.profil).filter(i => i.art === 'schnell').map(i => ({ t: i.zeit, farbe: 'rgba(183,156,255,0.35)' })));
    planChart.setDaten({ serien, insulin: z.insulinZeigen ? [{ I: sim.I }] : [], ziel: P.ziel, marker });
    renderReadout(); renderStats();
  }

  function renderPlan() {
    const hatPlan = z.schritte.length > 0;
    $('#startLeer').hidden = hatPlan; $('#planInhalt').hidden = !hatPlan;
    $('#profilChip').dataset.profil = z.profil;
    $('#profilName').textContent = GlukoSim.PROFILE[z.profil].name;
    if (!hatPlan) return;
    renderKurve(); renderSpuren(); renderSchritte(); renderListe(); renderErklaerung();
    $('#tInsulin').setAttribute('aria-pressed', z.insulinZeigen);
    if (seite === 'vergleich') renderVergleich();
  }

  function zone(g, ziel) { return g < ziel[0] ? 'tief' : g > 250 ? 'sehrhoch' : g > ziel[1] ? 'hoch' : 'ok'; }
  function renderReadout() {
    const ziel = GlukoSim.PROFILE[z.profil].ziel, kreuz = planChart.kreuz, t = kreuz != null ? kreuz : st.maxT, g = sim.G[t];
    const a = Math.max(0, t - 10), b = Math.min(1440, t + 10), s = (sim.G[b] - sim.G[a]) / (b - a || 1);
    $('#readout').dataset.zone = zone(g, ziel);
    $('#roWert').textContent = Math.round(g);
    $('#roPfeil').style.transform = 'rotate(' + (s > 2 ? -90 : s > 0.8 ? -45 : s < -2 ? 90 : s < -0.8 ? 45 : 0) + 'deg)';
    $('#roZeit').textContent = kreuz != null ? 'um ' + H(t) + ' Uhr' : 'Höchster Wert, ' + H(t) + ' Uhr';
    $('#roInsulin').textContent = z.insulinZeigen ? 'Insulin ' + Math.round(sim.I[t]) + ' µU/ml' : '';
  }
  function renderStats() {
    const [lo, hi] = st.ziel;
    const t = [
      ['Spitze', st.max + '<small>mg/dl</small>', 'um ' + H(st.maxT), st.max > hi + 70 ? 'schlecht' : st.max > hi ? 'warn' : 'ok'],
      ['Mittelwert', st.mittel + '<small>mg/dl</small>', 'über 24 h', st.mittel > hi ? 'schlecht' : st.mittel > hi - 25 ? 'warn' : 'ok'],
      ['Im Ziel', st.zielProzent + '<small>%</small>', lo + '–' + hi + ' mg/dl', st.zielProzent >= 90 ? 'ok' : st.zielProzent >= 70 ? 'warn' : 'schlecht'],
      ['Unterzucker', st.unterMin + '<small>min</small>', 'unter ' + lo, st.unterMin ? 'schlecht' : 'ok']
    ];
    $('#planStats').innerHTML = t.map(x => '<div class="stat"><div class="stat-label">' + x[0] + '</div><div class="stat-wert ' + x[3] + '">' + x[1] + '</div><div class="stat-sub">' + x[2] + '</div></div>').join('');
  }

  // ---------------- Schritte zum Durchklicken ----------------
  function renderSchritte() {
    const n = z.schritte.length, i = z.schrittIndex, s = schritt();
    let punkte = '';
    for (let k = 0; k < n; k++) {
      if (k) punkte += '<i class="' + (k <= i ? 'fertig' : '') + '"></i>';
      punkte += '<button data-schritt="' + k + '" class="' + (k === i ? 'aktiv' : k < i ? 'fertig' : '') + '" aria-label="Schritt ' + (k + 1) + ': ' + esc(z.schritte[k].titel) + '">' + (k + 1) + '</button>';
    }
    let werte = '';
    if (simVorher) {
      const a = GlukoSim.statistik(simVorher, z.profil), w = (l, x, y, u, besser) => '<div><span>' + l + '</span><b class="' + (besser ? 'ok' : '') + '">' + x + ' → ' + y + '</b></div>';
      werte = '<div class="schritt-werte">' + w('Spitze (mg/dl)', a.max, st.max, '', st.max < a.max) + w('Im Ziel (%)', a.zielProzent, st.zielProzent, '', st.zielProzent > a.zielProzent) +
        (a.unterMin || st.unterMin ? w('Unterzucker (min)', a.unterMin, st.unterMin, '', st.unterMin < a.unterMin) : w('Zu hoch (min)', a.ueberMin, st.ueberMin, '', st.ueberMin < a.ueberMin)) + '</div>';
    }
    const liste = s.aenderungen.length ? '<ul class="schritt-liste">' + s.aenderungen.map(a => '<li><span>' + esc(a.titel) + (a.text && s.key === 'snack' ? ': ' + esc(a.text) : '') + '</span><span>' + (a.von != null ? H(a.von) + ' → ' : '') + H(a.nach) + '</span></li>').join('') + '</ul>' : '';
    const weiter = i < n - 1 ? '<button class="btn primaer" data-nav="1">Weiter: ' + esc(z.schritte[i + 1].titel) + '</button>' : '<button class="btn primaer" data-nav="erklaeren">Diesen Tag erklären</button>';
    $('#schritte').innerHTML = '<div class="schritt-karte"><div class="schritt-punkte">' + punkte + '</div>' +
      '<span class="schritt-nr">Schritt ' + (i + 1) + ' von ' + n + '</span><h3>' + esc(s.titel) + '</h3>' +
      (s.angepasst ? '<p class="angepasst">Von dir angepasst</p>' : '') +
      '<p>' + esc(s.text) + '</p>' + liste + werte +
      '<div class="schritt-nav"><button class="btn tonal" data-nav="-1"' + (i === 0 ? ' disabled' : '') + '>Zurück</button>' + weiter + '</div>' +
      (i === n - 1 && z.nichtNoetig.length ? '<p class="schritt-fertig">Nicht nötig: ' + esc(z.nichtNoetig.join(', ')) + '. Das bringt bei diesem Tag keine spürbare Verbesserung.</p>' : '') + '</div>';
  }
  function geheZuSchritt(k) {
    z.schrittIndex = Math.max(0, Math.min(z.schritte.length - 1, k));
    planChart.kreuz = null; erklaerung = null; speichern(); renderPlan(); vib(8);
  }
  $('#schritte').addEventListener('click', ev => {
    const p = ev.target.closest('[data-schritt]'); if (p) { geheZuSchritt(+p.dataset.schritt); return; }
    const b = ev.target.closest('[data-nav]'); if (!b) return;
    if (b.dataset.nav === 'erklaeren') { erklaeren(); return; }
    geheZuSchritt(z.schrittIndex + (+b.dataset.nav));
  });

  // ---------------- Blöcke unter der Kurve ----------------
  function renderSpuren() {
    planChart.setSpuren(2);
    const box = planChart.spuren;
    box.innerHTML = '<div class="spur" style="top:0"></div><div class="spur" style="top:36px"></div>';
    for (const e of plan()) {
      const c = document.createElement('div');
      c.className = 'chip chip-' + e.typ + (e.mahlzeit === 'snack' ? ' snack' : '') + (e.ausnahme ? ' ausnahme' : '');
      c.dataset.id = e.id; c.tabIndex = 0; c.setAttribute('role', 'button');
      c.setAttribute('aria-label', titel(e) + ' um ' + H(e.zeit) + ', ziehen zum Verschieben');
      c.style.top = (e.typ === 'sport' ? 40 : 4) + 'px';
      const label = e.typ === 'sport' ? e.art + ' ' + e.dauer + '′' : titel(e);
      c.innerHTML = '<span class="chip-ico">' + ico(e.typ === 'sport' ? 'sport' : e.mahlzeit === 'snack' ? 'snack' : 'essen') + '</span><span class="chip-txt">' + esc(label) + '</span><span class="chip-zeit">' + H(e.zeit) + '</span>';
      box.appendChild(c);
      ziehbar(c, e);
    }
    positioniereChips();
  }
  function positioniereChip(c, e) {
    const px = planChart.pxProMin;
    if (e.typ === 'sport') { c.style.left = (e.zeit * px) + 'px'; c.style.minWidth = Math.max(28, e.dauer * px) + 'px'; c.style.maxWidth = 'none'; }
    else c.style.left = (e.zeit * px - 14) + 'px';
  }
  function positioniereChips() {
    if (!planChart) return;
    planChart.spuren.classList.toggle('kompakt', planChart.pxProStunde < 30);
    for (const c of $$('.chip', planChart.spuren)) { const e = plan().find(x => x.id === c.dataset.id); if (e) positioniereChip(c, e); }
    $('#zoomAus').disabled = planChart.zoomIndex === 0; $('#zoomEin').disabled = planChart.zoomIndex === 2;
  }
  function ziehbar(chip, e) {
    let d = null;
    chip.addEventListener('pointerdown', ev => { if (ev.button > 0) return; chip.setPointerCapture(ev.pointerId); d = { x: ev.clientX, zeit: e.zeit, bewegt: false }; });
    chip.addEventListener('pointermove', ev => {
      if (!d) return;
      if (!d.bewegt && Math.abs(ev.clientX - d.x) > 6) { d.bewegt = true; chip.classList.add('zieht'); vib(12); planChart.kreuz = null; }
      if (!d.bewegt) return;
      const schrittMin = planChart.zoomIndex === 0 ? 15 : 5;
      const t = Math.max(0, Math.min(1440 - (e.typ === 'sport' ? e.dauer : 5), Math.round((d.zeit + (ev.clientX - d.x) / planChart.pxProMin) / schrittMin) * schrittMin));
      if (t !== e.zeit) { e.zeit = t; positioniereChip(chip, e); $('.chip-zeit', chip).textContent = H(t); renderKurve(); }
    });
    const ende = () => {
      if (!d) return;
      const bewegt = d.bewegt; d = null; chip.classList.remove('zieht');
      if (bewegt) { vib(8); schritt().angepasst = true; neuBerechnet(); }
      else toast(titel(e) + ' um ' + H(e.zeit) + ' Uhr. Zum Verschieben ziehen.');
    };
    chip.addEventListener('pointerup', ende);
    chip.addEventListener('pointercancel', ende);
  }

  // ---------------- Liste ----------------
  function renderListe() {
    const ins = Object.fromEntries(therapie(z.profil).filter(i => i.zu).map(i => [i.zu, i.einheiten]));
    $('#eintragListe').innerHTML = plan().slice().sort((a, b) => a.zeit - b.zeit).map(e => {
      const sport = e.typ === 'sport', snack = e.mahlzeit === 'snack';
      const t2 = sport ? e.dauer + ' min, ' + e.intensitaet : esc(e.eingabe || '');
      let t3 = sport ? '' : Math.round(e.summe.kh) + ' g Kohlenhydrate, GI ' + e.summe.gi;
      if (!sport && ins[e.id]) t3 += ', dazu ' + ins[e.id] + ' IE Insulin';
      if (e.fest) t3 += sport ? '' : ', feste Uhrzeit';
      if (e.ausnahme) t3 += ', außerhalb deines Zeitraums';
      if (snack) t3 += ', vom Algorithmus vorgeschlagen';
      return '<li class="eintrag ' + (sport ? 'sport' : 'essen') + '"><span class="zeit">' + H(e.zeit) + '</span><span class="ico">' + ico(sport ? 'sport' : snack ? 'snack' : 'essen') + '</span>' +
        '<span class="txt"><div class="t1">' + esc(titel(e)) + '</div><div class="t2">' + t2 + '</div>' + (t3 ? '<div class="t2" style="color:var(--text3)">' + esc(t3) + '</div>' : '') + '</span></li>';
    }).join('');
  }

  // ---------------- Erklärung ----------------
  const LAED = '<div class="laedt"><span></span><span></span><span></span></div>';
  const erklaerHTML = e => !e ? '' : e.laden ? LAED : '<div class="erklaerung">' + md(e.text) + '<div class="quelle">' + ico('funke') + esc(e.quelle) + '</div></div>';
  function renderErklaerung() { $('#erklaerBox').innerHTML = erklaerHTML(erklaerung); }
  function erklaeren() {
    if (!plan().length) return;
    const p = z.profil, mitIns = plan().concat(therapie(p)), stP = GlukoSim.statistik(sim, p);
    erklaerung = { text: Texte.lokaleErklaerung(mitIns, p, sim, stP), quelle: 'Automatisch aus den Werten der Simulation erstellt' };
    renderErklaerung();
    $('#erklaerBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------------- Vergleich ----------------
  let vErg = null;
  function vergleichErgebnisse() {
    const r = {};
    for (const p of PROFILE_LISTE) { const s = GlukoSim.simuliere(plan(), p, opt()); r[p] = { sim: s, st: GlukoSim.statistik(s, 'gesund'), ohneInsulin: !z.insulinAuto }; }
    return r;
  }
  function renderVergleich() {
    if (!plan().length) { $('#vTabelle').innerHTML = ''; $('#vLegende').innerHTML = ''; $('#vHinweis').textContent = 'Plane zuerst einen Tag.'; vChart.setDaten({ serien: [], insulin: [], marker: [] }); return; }
    vErg = vergleichErgebnisse();
    const aus = z.vAus || {}, serien = [], insulin = [];
    for (const p of PROFILE_LISTE) {
      if (aus[p]) continue;
      const f = GlukoSim.PROFILE[p].farbe;
      serien.push({ G: vErg[p].sim.G, farbe: f });
      if (z.vInsulinZeigen) insulin.push({ I: vErg[p].sim.I, farbe: f, fuellung: f + '1f' });
    }
    vChart.setDaten({ serien, insulin, ziel: [70, 140], marker: plan().map(e => ({ t: e.zeit, farbe: 'rgba(233,237,248,0.14)' })), spitzeZeigen: false });
    const t = vChart.kreuz;
    $('#vLegende').innerHTML = PROFILE_LISTE.map(p => '<button data-p="' + p + '" aria-pressed="' + !aus[p] + '"><span class="farbpunkt" style="background:' + GlukoSim.PROFILE[p].farbe + '"></span>' +
      GlukoSim.PROFILE[p].name + (t != null ? ' <span class="lw">' + Math.round(vErg[p].sim.G[t]) + '</span>' : '') + '</button>').join('') + (t != null ? '<span class="klein" style="align-self:center">um ' + H(t) + '</span>' : '');
    $('#vTabelle').innerHTML = '<thead><tr><th>Profil</th><th>Spitze</th><th>Ø</th><th>70–140</th><th>Insulin max</th></tr></thead><tbody>' +
      PROFILE_LISTE.map(p => { const s = vErg[p].st; return '<tr><td><span class="farbpunkt" style="background:' + GlukoSim.PROFILE[p].farbe + '"></span>' + GlukoSim.PROFILE[p].name + '</td><td>' + s.max + '</td><td>' + s.mittel + '</td><td>' + s.zielProzent + ' %</td><td>' + s.insulinMax + '</td></tr>'; }).join('') + '</tbody>';
    $('#vHinweis').textContent = 'Plan aus Schritt ' + (z.schrittIndex + 1) + ' („' + schritt().titel + '“). ' + (z.insulinAuto ? 'Typ 1 spritzt Insulin nach Faustregel.' : 'Typ 1 ohne Insulin.') + ' Werte in mg/dl, Insulin in µU/ml.';
    $('#vInsulin').setAttribute('aria-pressed', z.vInsulinZeigen);
    $('#vErklaerBox').innerHTML = erklaerHTML(vErklaerung);
    $('#vZoomAus').disabled = vChart.zoomIndex === 0; $('#vZoomEin').disabled = vChart.zoomIndex === 2;
  }
  function vergleichErklaeren() {
    if (!plan().length) return;
    const r = vErg || vergleichErgebnisse();
    vErklaerung = { text: Texte.lokalerVergleich(r), quelle: 'Automatisch aus den Werten der Simulation erstellt' };
    renderVergleich();
  }

  // ---------------- Sheet ----------------
  const sheet = $('#sheet'), scrim = $('#scrim'), sheetInhalt = $('#sheetInhalt');
  let sheetOffen = false;
  function oeffneSheet(html, beiMount) {
    sheetInhalt.innerHTML = html; sheetInhalt.scrollTop = 0;
    if (!sheetOffen) { history.pushState({ seite, sheet: true }, ''); sheetOffen = true; }
    requestAnimationFrame(() => { sheet.classList.add('offen'); scrim.classList.add('offen'); });
    beiMount && beiMount(sheetInhalt);
  }
  function schliesseSheetUI() { sheetOffen = false; sheet.classList.remove('offen'); scrim.classList.remove('offen'); sheet.style.transform = ''; }
  function schliesseSheet() { if (!sheetOffen) return; if (history.state && history.state.sheet) history.back(); else schliesseSheetUI(); }
  scrim.addEventListener('click', schliesseSheet);
  (function () {
    const g = $('#sheetGriff'); let y0 = null, dy = 0;
    g.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; g.setPointerCapture(e.pointerId); sheet.classList.add('zieht'); });
    g.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = 'translateY(' + dy + 'px)'; });
    const ende = () => { if (y0 == null) return; y0 = null; sheet.classList.remove('zieht'); sheet.style.transform = ''; if (dy > 90) schliesseSheet(); };
    g.addEventListener('pointerup', ende); g.addEventListener('pointercancel', ende);
  })();
  function bestaetigen(frage, text, knopf, aktion) {
    oeffneSheet('<h3>' + esc(frage) + '</h3><p class="untertitel">' + esc(text) + '</p><div class="zeile"><button class="btn tonal" data-x="nein">Abbrechen</button><button class="btn gefahr" data-x="ja">' + esc(knopf) + '</button></div>', el => {
      $('[data-x="nein"]', el).onclick = schliesseSheet;
      $('[data-x="ja"]', el).onclick = () => { schliesseSheet(); aktion(); };
    });
  }

  // ---------------- Profil ----------------
  function setzeProfil(p) {
    if (!GlukoSim.PROFILE[p] || p === z.profil) return;
    z.profil = p;
    if (z.mahlzeiten.length) { berechneSchritte(); toast('Neu berechnet für ' + GlukoSim.PROFILE[p].name); }
    neuBerechnet(); renderEinstellungen();
  }
  function profilKarten(aktiv) {
    return PROFILE_LISTE.map(p => '<button class="profil-karte" data-p="' + p + '" role="radio" aria-checked="' + (p === aktiv) + '"><span class="farbpunkt" style="background:' + GlukoSim.PROFILE[p].farbe + '"></span><span><b>' + PROFIL_INFO[p][0] + '</b><span>' + PROFIL_INFO[p][1] + '</span></span></button>').join('');
  }
  function profilSheet() {
    oeffneSheet('<h3>Stoffwechsel</h3><p class="untertitel">Der Tag wird für das neue Profil neu berechnet.</p>' + profilKarten(z.profil), el => {
      for (const b of $$('[data-p]', el)) b.onclick = () => { schliesseSheet(); setzeProfil(b.dataset.p); vib(8); };
    });
  }

  // ---------------- Tages-Assistent ----------------
  let w = null;
  const asEl = $('#assistent');
  function standardMahlzeit(art) {
    const [von, bis] = Optimierer.STANDARD_ZEITRAUM[art];
    return { items: [], modus: 'zeitraum', von, bis, zeit: Math.round((von + bis) / 2 / 15) * 15 };
  }
  // Schritte des Assistenten. Dazwischen die Erklär-Folien (Mini-Präsentation): Kohlenhydrate, GI, Formel, Algorithmus
  const AS_ALLE = ['profil', 'kh', 'gi', 'essen', 'formel', 'bewegung', 'algo'];
  const AS_INFO = ['kh', 'gi', 'formel', 'algo'];
  const asListe = () => AS_ALLE.filter(k => !AS_INFO.includes(k) || (z.erklaerungen !== false && !w.ohneInfo));
  function oeffneAssistent(start, neuerTag) {
    w = { schritt: typeof start === 'string' ? start : ['profil', 'essen', 'bewegung'][start || 0], neuerTag: !!neuerTag, ohneInfo: false, profil: z.profil, m: {}, bewegung: neuerTag ? [] : klon(z.bewegung),
      sportZeitraum: z.sportZeitraum.slice(), neu: { art: 'Spazieren', dauer: 30 }, busy: false, gezeigt: -1 };
    for (const [art] of MAHLZEITEN) {
      const alt = !neuerTag && z.mahlzeiten.find(m => m.art === art);
      w.m[art] = alt ? ausMahlzeit(alt) : standardMahlzeit(art);
    }
    asEl.hidden = false; zeigeAssistent();
  }
  function schliesseAssistent() { asEl.hidden = true; w = null; }

  // Gespeicherte Mahlzeit (oder Beispieltag) -> Eingabe im Assistenten
  function ausMahlzeit(m) {
    const std = standardMahlzeit(m.art);
    return { items: (m.zutaten || []).filter(x => Lebensmittel.eintrag(x.name)).map(x => ({ name: x.name, gramm: x.gramm })),
      modus: m.fest ? 'fest' : 'zeitraum', von: m.von != null ? m.von : std.von, bis: m.bis != null ? m.bis : std.bis, zeit: m.zeit != null ? m.zeit : std.zeit };
  }
  const zutatenAus = items => items.map(i => Lebensmittel.zutat(i.name, i.gramm)).filter(Boolean);
  // Plus/Minus: ein Stück (Brötchen, Ei …) oder 50 g bzw. 50 ml
  const mengenSchritt = name => (Lebensmittel.einheit(name) === 'g' && Lebensmittel.stueck(name)) || 50;
  const zahlText = x => String(Math.round(x * 2) / 2).replace('.', ',');

  function infoText(m) {
    if (!m.items.length) return '';
    return '<span class="as-info">' + Math.round(Lebensmittel.summe(zutatenAus(m.items)).kh) + ' g Kohlenhydrate</span>';
  }
  function zutatUnter(it) {
    const zt = Lebensmittel.zutat(it.name, it.gramm), st = Lebensmittel.einheit(it.name) === 'g' && Lebensmittel.stueck(it.name);
    return Math.round(zt.kh) + ' g KH' + (st ? ' · ' + zahlText(it.gramm / st) + ' Stück' : '');
  }
  function zutatenHtml(m) {
    if (!m.items.length) return '';
    return '<ul class="as-zutaten">' + m.items.map((it, i) =>
      '<li class="as-zutat" data-i="' + i + '"><span class="n"><b>' + esc(it.name) + '</b><span data-unter>' + zutatUnter(it) + '</span></span>' +
      '<span class="menge"><button data-menge="-1" aria-label="Weniger">−</button>' +
      '<input type="number" inputmode="numeric" min="1" max="3000" data-feld="gramm" value="' + it.gramm + '" aria-label="Menge ' + esc(it.name) + '">' +
      '<span class="einh">' + Lebensmittel.einheit(it.name) + '</span><button data-menge="1" aria-label="Mehr">+</button></span>' +
      '<button class="weg" data-zweg="' + i + '" aria-label="' + esc(it.name) + ' entfernen">' + ico('x') + '</button></li>').join('') + '</ul>';
  }
  function trefferHtml(q) {
    const t = Lebensmittel.suche(q, 6);
    if (!t.length) return '<div class="leer">„' + esc(q.trim()) + '“ steht nicht in der Tabelle. Probier ein ähnliches Lebensmittel.</div>';
    return t.map(e => '<button data-treffer="' + esc(e.name) + '"><span>' + esc(e.name) + '</span><span class="neben">' + zahlText(e.kh) + ' g KH pro 100 ' + Lebensmittel.einheit(e.name) + '</span></button>').join('');
  }
  // Nur eine Mahlzeit-Karte neu zeichnen (das Suchfeld behält den Fokus)
  function zeichneKarte(art) {
    const karte = asEl.querySelector('.as-mahlzeit[data-art="' + art + '"]'); if (!karte) return;
    const m = w.m[art], name = MAHLZEITEN.find(x => x[0] === art)[1];
    karte.querySelector('.as-mahlzeit-kopf').innerHTML = '<b>' + name + '</b>' + infoText(m);
    karte.querySelector('.as-zutaten-box').innerHTML = zutatenHtml(m);
  }
  function zeigeTreffer(karte, q) {
    const box = karte.querySelector('.as-treffer');
    box.innerHTML = q.trim() ? trefferHtml(q) : '';
    box.hidden = !q.trim();
  }
  function hinzufuegen(art, name) {
    const m = w.m[art], da = m.items.find(i => i.name === name);
    if (da) da.gramm = Math.min(3000, da.gramm + mengenSchritt(name)); else m.items.push({ name, gramm: Lebensmittel.startMenge(name) });
    vib(8); zeichneKarte(art);
    const karte = asEl.querySelector('.as-mahlzeit[data-art="' + art + '"]'), feld = karte.querySelector('[data-feld="suche"]');
    feld.value = ''; zeigeTreffer(karte, '');
  }

  // ---------- Erklär-Folien (Mini-Präsentation im Assistenten) ----------
  const kurzName = e => e.name.replace(' (gekocht)', ', gekocht') + (Lebensmittel.einheit(e.name) === 'ml' ? ' (100 ml)' : '');
  const komma = (x, n) => (Math.round(x * Math.pow(10, n || 0)) / Math.pow(10, n || 0)).toString().replace('.', ',');
  function balkenHtml(zeilen, max) {
    return '<div class="mini-balken">' + zeilen.map(r => '<div class="mb-zeile"><span class="mb-name">' + esc(r.name) + '</span><span class="mb-spur"><i style="width:' +
      Math.max(1.5, 100 * r.wert / max).toFixed(1) + '%;background:' + r.farbe + '"></i></span><b style="color:' + r.farbe + '">' + esc(r.label) + '</b></div>').join('') + '</div>';
  }
  // Quelle der Nährwerte ehrlich anzeigen: solange Werte als vorläufig markiert sind, steht das auch so da
  function naehrQuelle(eintraege) {
    return eintraege.some(e => /vorläufig|prüfen/i.test(e.quelle || ''))
      ? 'Lebensmittel-Tabelle der App (Richtwerte, Abgleich mit dem Bundeslebensmittelschlüssel BLS 4.0 läuft)'
      : 'Bundeslebensmittelschlüssel BLS 4.0, Max Rubner-Institut (2025)';
  }
  function infoKopf(k) {
    const nr = AS_INFO.indexOf(k) + 1;
    return '<div class="info-kopf"><span class="info-marke">So funktioniert’s · ' + nr + ' von 4</span>' +
      (k !== 'algo' ? '<button class="text-btn" data-as="ohneInfo">Überspringen</button>' : '') + '</div>';
  }
  function infoKH() {
    const liste = ['Toastbrot', 'Reis (gekocht)', 'Nudeln (gekocht)', 'Apfel', 'Cola'].map(Lebensmittel.eintrag).filter(Boolean);
    return infoKopf('kh') + '<div class="as-titel">Kohlenhydrate</div>' +
      '<p class="as-text">Zucker und Stärke aus dem Essen. Im Darm werden sie zu Glukose (Traubenzucker) zerlegt, und die geht ins Blut.</p>' +
      '<div class="info-karte"><div class="info-ueber">Kohlenhydrate pro 100 g</div>' +
      balkenHtml(liste.map(e => ({ name: kurzName(e), wert: e.kh, farbe: 'var(--blau)', label: komma(e.kh, 1) + ' g' })), 50) + '</div>' +
      '<div class="info-arten">' +
      '<div><i style="background:var(--rot)"></i><b>Zucker</b><span>Cola, Saft, Süßes: geht schnell ins Blut</span></div>' +
      '<div><i style="background:var(--amber)"></i><b>Stärke</b><span>Nudeln, Brot, Reis: muss erst zerlegt werden</span></div>' +
      '<div><i style="background:var(--mint)"></i><b>Ballaststoffe</b><span>werden nicht verdaut und bremsen die Aufnahme</span></div></div>' +
      '<div class="info-merke"><b>In der App:</b> mehr Kohlenhydrate → mehr Zucker im Blut</div>' +
      '<p class="info-quelle">Quelle: ' + esc(naehrQuelle(liste)) + '</p>';
  }
  function infoGI() {
    const liste = ['Traubenzucker', 'Cornflakes', 'Toastbrot', 'Cola', 'Nudeln (gekocht)', 'Apfel', 'Linsen (gekocht)'].map(Lebensmittel.eintrag).filter(e => e && e.gi);
    const farbe = gi => gi >= 70 ? 'var(--rot)' : gi > 55 ? 'var(--amber)' : 'var(--mint)';
    return infoKopf('gi') + '<div class="as-titel">Glykämischer Index</div>' +
      '<p class="as-text">Der GI zeigt, wie schnell ein Lebensmittel den Blutzucker steigen lässt. Traubenzucker hat den GI 100.</p>' +
      '<div class="info-karte"><div class="info-ueber">GI aus den internationalen GI-Tabellen</div>' +
      balkenHtml(liste.map(e => ({ name: e.name.replace(' (gekocht)', ''), wert: e.gi, farbe: farbe(e.gi), label: String(e.gi) })), 100) + '</div>' +
      '<div class="info-stufen"><div><b style="color:var(--mint)">niedrig</b><span>bis 55</span></div><div><b style="color:var(--amber)">mittel</b><span>56 bis 69</span></div><div><b style="color:var(--rot)">hoch</b><span>ab 70</span></div></div>' +
      '<div class="info-karte klein"><b>So wird er gemessen</b><span>Testpersonen essen eine Portion mit 50 g Kohlenhydraten. Zwei Stunden lang wird ihr Blutzucker gemessen und mit Traubenzucker verglichen.</span></div>' +
      '<div class="info-merke"><b>In der App:</b> hoher GI → der Zucker kommt früher und stärker ins Blut</div>' +
      '<p class="info-quelle">Quelle: Atkinson, Foster-Powell & Brand-Miller (2008), International Tables of Glycemic Index, Universität Sydney · Messverfahren nach ISO 26642</p>';
  }
  // Kleine Kurve: nur diese eine Mahlzeit, für das gewählte Profil
  function miniKurve(G, t0, profil) {
    const P = GlukoSim.PROFILE[profil], von = Math.max(0, t0 - 30), bis = Math.min(1440, t0 + 270);
    const werte = Array.from(G.slice(von, bis + 1)), n = werte.length - 1;
    const lo = Math.min(60, ...werte), hi = Math.max(P.ziel[1] + 20, ...werte) + 12;
    const W = 320, Hh = 128, x = i => (i / n) * W, y = g => 8 + (1 - (g - lo) / (hi - lo)) * (Hh - 30);
    let iMax = 0; werte.forEach((g, i) => { if (i >= t0 - von && g > werte[iMax]) iMax = i; });
    const pkt = werte.map((g, i) => x(i).toFixed(1) + ',' + y(g).toFixed(1)).join(' ');
    let ticks = '';
    for (let h = 0; t0 + h * 60 <= bis; h++) {
      const xi = x(t0 - von + h * 60);
      ticks += '<line x1="' + xi.toFixed(1) + '" x2="' + xi.toFixed(1) + '" y1="8" y2="' + (Hh - 22) + '" class="mk-raster"/>' +
        '<text x="' + Math.min(W - 14, Math.max(14, xi)).toFixed(1) + '" y="' + (Hh - 6) + '" class="mk-text" text-anchor="middle">' + (h ? '+' + h + ' h' : 'Essen') + '</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Blutzuckerkurve nach dieser Mahlzeit">' +
      '<rect x="0" y="' + y(P.ziel[1]).toFixed(1) + '" width="' + W + '" height="' + (y(P.ziel[0]) - y(P.ziel[1])).toFixed(1) + '" class="mk-band"/>' + ticks +
      '<line x1="0" x2="' + W + '" y1="' + y(P.ziel[1]).toFixed(1) + '" y2="' + y(P.ziel[1]).toFixed(1) + '" class="mk-grenze"/>' +
      '<text x="4" y="' + (y(P.ziel[1]) - 4).toFixed(1) + '" class="mk-text">' + P.ziel[1] + '</text>' +
      '<polyline points="' + pkt + '" fill="none" stroke="' + P.farbe + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + x(iMax).toFixed(1) + '" cy="' + y(werte[iMax]).toFixed(1) + '" r="4.5" fill="#E9EDF8"/>' +
      '<text x="' + Math.min(W - 20, x(iMax) + 8).toFixed(1) + '" y="' + Math.max(16, y(werte[iMax]) - 6).toFixed(1) + '" class="mk-wert">' + Math.round(werte[iMax]) + '</text></svg>';
  }
  function infoFormel() {
    const kandidaten = MAHLZEITEN.map(([art, name]) => ({ art, name, zt: zutatenAus(w.m[art].items) })).filter(x => x.zt.length)
      .map(x => Object.assign(x, { su: Lebensmittel.summe(x.zt) })).sort((a, b) => b.su.kh - a.su.kh);
    if (!kandidaten.length) return infoKopf('formel') + '<div class="as-titel">So rechnet die App</div><p class="as-text">Trag zuerst eine Mahlzeit ein.</p>';
    const k = kandidaten[0], su = k.su, gi = su.gi, m = w.m[k.art];
    const faktor = 0.35 + 0.65 * gi / 100, wirksam = su.kh * faktor;
    const proGramm = GlukoSim.PARAM.mgdlProGramm * GlukoSim.PARAM.referenzGewicht / (z.gewicht || 70);
    const kin = GlukoSim.mahlzeitKinetik(su, z.gewicht), t1 = Math.round(40 * (1 - gi / 100)), th = Math.round(kin.theta), zuschlag = Math.max(0, th - 18 - t1);
    const t0 = m.modus === 'fest' ? m.zeit : Math.round((Math.min(m.von, m.bis) + Math.max(m.von, m.bis)) / 2 / 15) * 15;
    const simu = GlukoSim.simuliere([{ id: 'formel', typ: 'essen', zeit: t0, summe: su }], w.profil, opt());
    let tMax = t0; for (let t = t0; t <= Math.min(1440, t0 + 270); t++) if (simu.G[t] > simu.G[tMax]) tMax = t;
    const plusW = Math.round(simu.G[tMax] - simu.G[t0]), pName = PROFIL_INFO[w.profil][0];
    const zeile = (nr, formel, erg) => '<div class="f-zeile"><span class="f-nr">' + nr + '</span><div>' + formel + '<span class="f-erg">' + erg + '</span></div></div>';
    return infoKopf('formel') + '<div class="as-titel">So rechnet die App</div>' +
      '<p class="as-text">Mit deinem ' + esc(k.name) + ': ' + esc(Optimierer.zutatenText(k.zt)) + '</p>' +
      '<div class="info-eingaben"><span>Kohlenhydrate <b>' + Math.round(su.kh) + ' g</b></span><span>GI <b>' + gi + '</b></span><span>Fett <b>' + komma(su.fett) + ' g</b> · Ballaststoffe <b>' + komma(su.ballaststoffe) + ' g</b></span></div>' +
      '<div class="formel">' +
      zeile(1, '<b>Wirksamer Zucker</b> = Kohlenhydrate × (0,35 + 0,65 × GI ÷ 100)', Math.round(su.kh) + ' g × ' + faktor.toFixed(2).replace('.', ',') + ' = ' + Math.round(wirksam) + ' g') +
      zeile(2, '<b>Zucker fürs Blut</b> = wirksamer Zucker × ' + komma(proGramm, 1) + ' mg/dl pro Gramm, verteilt über ca. 3 Stunden', Math.round(wirksam) + ' × ' + komma(proGramm, 1) + ' = ' + Math.round(kin.last) + ' mg/dl') +
      zeile(3, '<b>Tempo</b>: stärkste Aufnahme nach 18 + 40 × (1 − GI ÷ 100) + Zuschlag für Fett, Eiweiß und Ballaststoffe', '18 + ' + t1 + ' + ' + zuschlag + ' = ' + th + ' min') +
      zeile(4, '<b>Jede Minute neu</b>: Blutzucker = vorher + Darm + Leber − Gehirn − Muskeln und Fett (Insulin) − Niere', '1440-mal am Tag') +
      '</div>' +
      '<div class="info-karte"><div class="info-ueber">Ergebnis für ' + esc(pName) + ' (nur diese Mahlzeit)</div><div class="info-kurve">' + miniKurve(simu.G, t0, w.profil) + '</div>' +
      '<div class="info-ergebnis">Spitze <b>' + Math.round(simu.G[tMax]) + ' mg/dl</b>, also plus ' + plusW + ' nach ' + (tMax - t0) + ' min</div></div>' +
      '<p class="info-quelle">Die Zahlen 0,35 · 0,65 · 5,6 sind Modellwerte, eingestellt an der Faustregel aus der Diabetes-Schulung: 10 g Kohlenhydrate heben den Blutzucker um 25 bis 40 mg/dl. Aufnahme im Darm nach Hovorka u. a. (2004).</p>';
  }
  function infoAlgo() {
    const zeile = (nr, t, d) => '<div class="f-zeile"><span class="f-nr">' + nr + '</span><div><b>' + t + '</b><span class="f-text">' + d + '</span></div></div>';
    return infoKopf('algo') + '<div class="as-titel">So plant der Algorithmus</div>' +
      '<p class="as-text">Er sucht für deine Mahlzeiten und deine Bewegung die besten Uhrzeiten.</p>' +
      '<div class="formel">' +
      zeile(1, 'Ausprobieren', 'Jede erlaubte Uhrzeit in deinem Zeitraum, erst in 30-min-Schritten, dann genauer in 15-min-Schritten.') +
      zeile(2, 'Durchrechnen', 'Für jede Möglichkeit wird die ganze Tageskurve simuliert.') +
      zeile(3, 'Strafpunkte', 'Jede Minute über dem Ziel kostet Punkte, unter 70 zählt am meisten. Verschieben kostet auch ein bisschen.') +
      zeile(4, 'Bester Plan', 'Die wenigsten Punkte gewinnen, aber nur, wenn es spürbar besser ist und kein Wert schlechter wird.') +
      '</div>' +
      '<div class="info-karte klein"><b>Regeln, damit der Tag realistisch bleibt</b><span>Nur in deinem Zeitraum · Frühstück → Mittag → Abend · mindestens 1 h zwischen Mahlzeiten, 2 h zwischen Hauptmahlzeiten · kein Sport direkt nach dem Essen</span></div>' +
      '<div class="info-merke"><b>Danach:</b> Dein Plan → Beste Uhrzeiten → Snack-Vorschlag → Kleine Ausnahme</div>' +
      '<p class="info-quelle">Zielbereich bei Diabetes 70 bis 180 mg/dl (Battelino u. a. 2019), gesund 70 bis 140 mg/dl. Muskeln nehmen beim Sport Zucker auch ohne Insulin auf (Richter u. a. 2004).</p>';
  }

  function zeigeAssistent() {
    let liste = asListe();
    if (!liste.includes(w.schritt)) w.schritt = AS_ALLE.slice(AS_ALLE.indexOf(w.schritt)).find(k => liste.includes(k)) || liste[0];
    const s = w.schritt, idx = liste.indexOf(s), letzter = idx === liste.length - 1;
    const punkte = '<div class="ob-punkte">' + liste.map((k, i) => '<i class="' + (i === idx ? 'an' : '') + '"></i>').join('') + '</div>';
    const zu = z.schritte.length ? '<button class="icon-btn" data-as="zu" aria-label="Schließen">' + ico('x') + '</button>' : '';
    let inhalt = '';
    if (s === 'profil') {
      inhalt = '<div class="as-titel">' + (w.neuerTag ? 'Neuer Tag' : 'Stoffwechsel') + '</div><p class="as-text">Für wen planen wir heute?</p>' + profilKarten(w.profil) +
        '<button class="text-btn as-demo" data-as="demo">Beispieltag laden</button>';
    } else if (s === 'kh') inhalt = infoKH();
    else if (s === 'gi') inhalt = infoGI();
    else if (s === 'formel') inhalt = infoFormel();
    else if (s === 'algo') inhalt = infoAlgo();
    else if (s === 'essen') {
      inhalt = '<div class="as-titel">Deine Mahlzeiten</div><p class="as-text">Trag ein, was du isst und wann es geht. Snacks schlägt der Algorithmus selbst vor.</p>' +
        MAHLZEITEN.map(([art, name, ph]) => {
          const m = w.m[art];
          return '<div class="as-mahlzeit" data-art="' + art + '"><div class="as-mahlzeit-kopf"><b>' + name + '</b>' + infoText(m) + '</div>' +
            '<div class="as-zutaten-box">' + zutatenHtml(m) + '</div>' +
            '<div class="as-suche">' + ico('suche') + '<input type="search" data-feld="suche" placeholder="Lebensmittel suchen, ' + ph + '" autocomplete="off" enterkeyhint="search" aria-label="Lebensmittel für ' + name + ' suchen"></div>' +
            '<div class="as-treffer" hidden></div>' +
            '<div class="segment" data-feld="modus" role="radiogroup"><button data-wert="zeitraum" role="radio" aria-checked="' + (m.modus === 'zeitraum') + '">Zeitraum</button><button data-wert="fest" role="radio" aria-checked="' + (m.modus === 'fest') + '">Feste Uhrzeit</button></div>' +
            (m.modus === 'zeitraum'
              ? '<div class="as-zeit"><label>Frühestens<input type="time" data-feld="von" value="' + H(m.von) + '"></label><label>Spätestens<input type="time" data-feld="bis" value="' + H(m.bis) + '"></label></div>'
              : '<div class="as-zeit"><label>Uhrzeit<input type="time" data-feld="zeit" value="' + H(m.zeit) + '"></label></div>') + '</div>';
        }).join('') + '<p class="klein">Ohne Lebensmittel wird die Mahlzeit ausgelassen. Es gibt nur Lebensmittel aus der Tabelle, damit jeder Wert eine Quelle hat.</p>' +
        '<details class="as-liste-lm"><summary>Welche Lebensmittel kennt die App?</summary><p class="klein">' + esc(Lebensmittel.DB.map(e => e.name).join(', ')) + '</p></details>';
    } else {
      inhalt = '<div class="as-titel">Bewegung</div><p class="as-text">Wie lange bewegst du dich heute? Wann genau, entscheidet der Algorithmus.</p>' +
        '<div class="as-bewegung-neu"><div class="segment" data-feld="art" role="radiogroup">' + Object.keys(BEWEGUNG).map(a => '<button data-wert="' + a + '" role="radio" aria-checked="' + (w.neu.art === a) + '">' + a + '</button>').join('') + '</div>' +
        '<div class="bereich"><div class="bereich-kopf"><span>Dauer</span><output id="asDauer">' + w.neu.dauer + ' min</output></div><input type="range" min="10" max="60" step="5" value="' + w.neu.dauer + '" data-feld="dauer"></div>' +
        '<button class="btn tonal" data-as="plus">' + ico('plus') + 'Hinzufügen</button></div>' +
        (w.bewegung.length ? '<ul class="as-liste">' + w.bewegung.map(b => '<li><span class="ico">' + ico('sport') + '</span><span class="txt">' + esc(b.art) + ', ' + b.dauer + ' min</span><button data-weg="' + b.id + '" aria-label="Entfernen">' + ico('x') + '</button></li>').join('') + '</ul>' : '<p class="klein">Noch keine Bewegung. Du kannst das auch auslassen.</p>') +
        '<div class="as-zeit"><label>Zeit für Bewegung ab<input type="time" data-feld="sv" value="' + H(w.sportZeitraum[0]) + '"></label><label>bis<input type="time" data-feld="sb" value="' + H(w.sportZeitraum[1]) + '"></label></div>';
    }
    const fuss = (idx > 0 ? '<button class="btn tonal" data-as="zurueck">Zurück</button>' : '') +
      (letzter ? '<button class="btn primaer" data-as="berechnen">' + (w.busy ? '<span class="spinner"></span>Berechne …' : 'Tag berechnen') + '</button>'
        : '<button class="btn primaer" data-as="weiter">Weiter</button>');
    // Gleicher Schritt neu gezeichnet: Scroll-Position behalten, nicht neu einblenden
    const alt = asEl.querySelector('.as-schritt'), gleich = w.gezeigt === s, top = gleich && alt ? alt.scrollTop : 0;
    asEl.innerHTML = '<div class="as-kopf">' + punkte + zu + '</div><div class="as-schritt' + (gleich ? ' ruhig' : '') + '">' + inhalt + '</div><div class="as-fuss">' + fuss + '</div>';
    asEl.querySelector('.as-schritt').scrollTop = top;
    w.gezeigt = s;
  }

  asEl.addEventListener('input', ev => {
    if (!w) return;
    const f = ev.target.dataset.feld, karte = ev.target.closest('[data-art]');
    if (f === 'suche' && karte) zeigeTreffer(karte, ev.target.value);
    if (f === 'gramm' && karte) {
      const li = ev.target.closest('[data-i]'), it = w.m[karte.dataset.art].items[+li.dataset.i], n = parseFloat(ev.target.value);
      if (n > 0) { it.gramm = Math.min(3000, Math.round(n)); li.querySelector('[data-unter]').textContent = zutatUnter(it); karte.querySelector('.as-mahlzeit-kopf').innerHTML = '<b>' + MAHLZEITEN.find(x => x[0] === karte.dataset.art)[1] + '</b>' + infoText(w.m[karte.dataset.art]); }
    }
    if (f === 'dauer') { w.neu.dauer = +ev.target.value; $('#asDauer').textContent = w.neu.dauer + ' min'; }
  });
  asEl.addEventListener('change', ev => {
    if (!w) return;
    const f = ev.target.dataset.feld, karte = ev.target.closest('[data-art]');
    if (karte && (f === 'von' || f === 'bis' || f === 'zeit')) w.m[karte.dataset.art][f] = zuMin(ev.target.value);
    if (karte && f === 'gramm') ev.target.value = w.m[karte.dataset.art].items[+ev.target.closest('[data-i]').dataset.i].gramm;
    if (f === 'sv') w.sportZeitraum[0] = zuMin(ev.target.value);
    if (f === 'sb') w.sportZeitraum[1] = zuMin(ev.target.value);
  });
  asEl.addEventListener('keydown', ev => {
    if (!w || ev.key !== 'Enter' || ev.target.dataset.feld !== 'suche') return;
    ev.preventDefault();
    const karte = ev.target.closest('[data-art]'), erster = karte.querySelector('[data-treffer]');
    if (erster) hinzufuegen(karte.dataset.art, erster.dataset.treffer);
  });
  asEl.addEventListener('click', async ev => {
    if (!w || w.busy) return;
    const karte = ev.target.closest('.profil-karte');
    if (karte) { w.profil = karte.dataset.p; for (const k of $$('.profil-karte', asEl)) k.setAttribute('aria-checked', k === karte); vib(6); return; }
    const seg = ev.target.closest('.segment button');
    if (seg) {
      const feld = seg.parentElement.dataset.feld, k = seg.closest('[data-art]');
      if (feld === 'modus' && k) { w.m[k.dataset.art].modus = seg.dataset.wert; zeigeAssistent(); }
      if (feld === 'art') { w.neu.art = seg.dataset.wert; segmentWahl(seg.parentElement, seg.dataset.wert); }
      return;
    }
    const tr = ev.target.closest('[data-treffer]');
    if (tr) { hinzufuegen(tr.closest('[data-art]').dataset.art, tr.dataset.treffer); return; }
    const mg = ev.target.closest('[data-menge]');
    if (mg) {
      const art = mg.closest('[data-art]').dataset.art, it = w.m[art].items[+mg.closest('[data-i]').dataset.i], st = mengenSchritt(it.name);
      const min = Lebensmittel.einheit(it.name) === 'g' && Lebensmittel.stueck(it.name) ? st : 10;
      it.gramm = Math.max(min, Math.min(3000, it.gramm + (+mg.dataset.menge) * st));
      vib(5); zeichneKarte(art); return;
    }
    const zw = ev.target.closest('[data-zweg]');
    if (zw) { const art = zw.closest('[data-art]').dataset.art; w.m[art].items.splice(+zw.dataset.zweg, 1); vib(8); zeichneKarte(art); return; }
    const weg = ev.target.closest('[data-weg]');
    if (weg) { w.bewegung = w.bewegung.filter(b => b.id !== weg.dataset.weg); zeigeAssistent(); return; }
    const b = ev.target.closest('[data-as]'); if (!b) return;
    const a = b.dataset.as;
    if (a === 'zu') { schliesseAssistent(); return; }
    const liste = asListe(), idx = liste.indexOf(w.schritt);
    if (a === 'zurueck') { w.schritt = liste[Math.max(0, idx - 1)]; zeigeAssistent(); return; }
    if (a === 'ohneInfo') { w.ohneInfo = true; w.schritt = AS_ALLE.slice(AS_ALLE.indexOf(w.schritt) + 1).find(k => !AS_INFO.includes(k)) || 'bewegung'; zeigeAssistent(); return; }
    if (a === 'demo') {
      const d = Demo.eingaben();
      for (const m of d.mahlzeiten) w.m[m.art] = ausMahlzeit(m.fest ? m : Object.assign({}, m, { zeit: null }));
      w.bewegung = d.bewegung.map(x => Object.assign({}, x, { id: neueId() })); w.sportZeitraum = d.sportZeitraum.slice();
      w.schritt = liste[idx + 1] || 'essen'; zeigeAssistent(); toast('Beispieltag eingetragen. Bei Typ 2 zeigt er alle Schritte.'); return;
    }
    if (a === 'plus') { w.bewegung.push({ id: neueId(), art: w.neu.art, dauer: w.neu.dauer, intensitaet: BEWEGUNG[w.neu.art] }); vib(8); zeigeAssistent(); return; }
    if (a === 'weiter') {
      if (w.schritt === 'essen' && !MAHLZEITEN.some(([art]) => w.m[art].items.length)) { toast('Füg mindestens ein Lebensmittel hinzu.'); return; }
      w.schritt = liste[Math.min(liste.length - 1, idx + 1)]; zeigeAssistent(); return;
    }
    if (a === 'berechnen') {
      w.busy = true; zeigeAssistent();
      await new Promise(r => setTimeout(r, 30));
      z.profil = w.profil;
      z.mahlzeiten = MAHLZEITEN.filter(([art]) => w.m[art].items.length).map(([art]) => {
        const m = w.m[art], von = Math.min(m.von, m.bis), bis = Math.max(m.von, m.bis), zutaten = zutatenAus(m.items);
        return { id: 'm-' + art, art, eingabe: Optimierer.zutatenText(zutaten), zutaten, summe: Lebensmittel.summe(zutaten), quelle: 'Liste', fest: m.modus === 'fest', zeit: m.zeit, von, bis };
      });
      z.bewegung = w.bewegung;
      z.sportZeitraum = [Math.min(...w.sportZeitraum), Math.max(...w.sportZeitraum)];
      z.tag = heute();
      berechneSchritte();
      schliesseAssistent();
      zeigeSeite('plan');
      neuBerechnet();
      $('#seite-plan').scrollTo({ top: 0 });
      toast(z.schritte.length > 1 ? 'Tippe auf „Weiter“, um zu sehen, was der Algorithmus verbessert.' : 'Fertig.');
    }
  });

  // ---------------- Navigation ----------------
  const SEITEN = ['plan', 'vergleich', 'einstellungen'];
  const SEITEN_TITEL = { plan: 'Heute', vergleich: 'Vergleich', einstellungen: 'Einstellungen' };
  function zeigeSeite(s, ausHistory) {
    if (!SEITEN.includes(s)) s = 'plan';
    const alt = seite; seite = s;
    if (!ausHistory && s !== alt) {
      if (s === 'plan') { if (history.state && history.state.seite && history.state.seite !== 'plan') history.back(); }
      else if (alt === 'plan') history.pushState({ seite: s }, '');
      else history.replaceState({ seite: s }, '');
    }
    const idx = SEITEN.indexOf(s);
    for (const el of $$('.seite')) {
      const i = SEITEN.indexOf(el.dataset.seite);
      el.style.transform = 'translateX(' + ((i - idx) * 100) + '%)';
      el.style.opacity = i === idx ? '1' : '0';
      el.inert = i !== idx;
    }
    for (const b of $$('#nav button')) b.classList.toggle('aktiv', b.dataset.ziel === s);
    document.body.dataset.seite = s;
    $('#appTitel').textContent = SEITEN_TITEL[s];
    if (s === 'vergleich') renderVergleich();
    if (s === 'einstellungen') renderEinstellungen();
  }
  window.addEventListener('popstate', ev => {
    if (sheetOffen) { schliesseSheetUI(); return; }
    zeigeSeite((ev.state && ev.state.seite) || 'plan', true);
  });

  // ---------------- Einstellungen ----------------
  function renderEinstellungen() {
    segmentWahl($('#eProfil'), z.profil);
    $('#eInsulinAuto').checked = !!z.insulinAuto;
    $('#eErklaerungen').checked = z.erklaerungen !== false;
    $('#eGewicht').value = z.gewicht;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    $('#eInstallieren').hidden = !installEvent || standalone;
    $('#eInstallHinweis').textContent = standalone ? 'GlukoSim läuft als installierte App.' : installEvent ? 'Installiert startet GlukoSim wie eine normale App und funktioniert offline.' : 'Zum Installieren im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.';
    $('#eVersion').textContent = 'Version ' + VERSION;
  }
  function bindeEinstellungen() {
    $('#eProfil').onclick = ev => { const b = ev.target.closest('button'); if (b) setzeProfil(b.dataset.wert); };
    $('#eInsulinAuto').onchange = ev => { z.insulinAuto = ev.target.checked; if (z.mahlzeiten.length) berechneSchritte(); neuBerechnet(); };
    $('#eErklaerungen').onchange = ev => { z.erklaerungen = ev.target.checked; speichern(); };
    $('#eGewicht').onchange = ev => { z.gewicht = Math.max(25, Math.min(200, parseFloat(ev.target.value) || 70)); ev.target.value = z.gewicht; if (z.mahlzeiten.length) berechneSchritte(); neuBerechnet(); };
    $('#eInstallieren').onclick = async () => { if (!installEvent) return; installEvent.prompt(); try { await installEvent.userChoice; } catch (e) { /* abgebrochen */ } installEvent = null; renderEinstellungen(); };
    $('#eNeuerTag').onclick = () => oeffneAssistent(0, true);
    $('#eDemo').onclick = () => { oeffneAssistent(0, true); asEl.querySelector('[data-as="demo"]').click(); };
    $('#eReset').onclick = () => bestaetigen('Alles zurücksetzen?', 'Plan, Mahlzeiten und Einstellungen werden gelöscht.', 'Zurücksetzen', () => {
      Object.assign(z, klon(STANDARD)); speichern(); renderPlan(); oeffneAssistent(0, true);
    });
  }
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEvent = ev; if (seite === 'einstellungen') renderEinstellungen(); });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('GlukoSim wurde installiert'); });

  // ---------------- Start ----------------
  function start() {
    planChart = new Verlauf($('#planChart'), { hoehe: 240, spuren: 2 });
    planChart.zoomIndex = z.zoom;
    planChart.onTap = () => renderReadout();
    planChart.onLayout = positioniereChips;
    vChart = new Verlauf($('#vChart'), { hoehe: 250, spuren: 0 });
    vChart.zoomIndex = z.vZoom;
    vChart.onTap = () => renderVergleich();

    $('#zoomEin').onclick = () => { planChart.setZoom(planChart.zoomIndex + 1, planChart.kreuz); z.zoom = planChart.zoomIndex; speichern(); };
    $('#zoomAus').onclick = () => { planChart.setZoom(planChart.zoomIndex - 1, planChart.kreuz); z.zoom = planChart.zoomIndex; speichern(); };
    $('#vZoomEin').onclick = () => { vChart.setZoom(vChart.zoomIndex + 1, vChart.kreuz); z.vZoom = vChart.zoomIndex; speichern(); renderVergleich(); };
    $('#vZoomAus').onclick = () => { vChart.setZoom(vChart.zoomIndex - 1, vChart.kreuz); z.vZoom = vChart.zoomIndex; speichern(); renderVergleich(); };
    $('#tInsulin').onclick = () => { z.insulinZeigen = !z.insulinZeigen; speichern(); renderKurve(); $('#tInsulin').setAttribute('aria-pressed', z.insulinZeigen); };
    $('#vInsulin').onclick = () => { z.vInsulinZeigen = !z.vInsulinZeigen; speichern(); renderVergleich(); };
    $('#vLegende').onclick = ev => { const b = ev.target.closest('[data-p]'); if (!b) return; z.vAus[b.dataset.p] = !z.vAus[b.dataset.p]; speichern(); renderVergleich(); };
    $('#btnErklaeren').onclick = erklaeren;
    $('#btnVergleichErklaeren').onclick = vergleichErklaeren;
    $('#btnNeuerTag').onclick = () => oeffneAssistent(0, true);
    $('#btnStartLeer').onclick = () => oeffneAssistent(0, true);
    $('#btnAendern').onclick = () => oeffneAssistent('essen', false);
    $('#profilChip').onclick = profilSheet;
    $('#nav').onclick = ev => { const b = ev.target.closest('button'); if (b) zeigeSeite(b.dataset.ziel); };
    bindeEinstellungen();

    history.replaceState({ seite: 'plan' }, '');
    zeigeSeite('plan', true);
    renderPlan();
    if (z.schritte.length) requestAnimationFrame(() => planChart.zeigeZeit(Math.max(360, st.maxT), false));
    // Jeden neuen Tag: Einführung
    if (z.tag !== heute() || !z.schritte.length) oeffneAssistent(0, true);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => { /* ohne Offline-Modus */ });
    document.fonts && document.fonts.ready.then(() => { planChart.zeichne(); vChart.zeichne(); });
  }
  // Erst die Lebensmittel-Tabelle laden, dann starten
  Lebensmittel.laden().then(start).catch(e => {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif;color:#E9EDF8">Die Lebensmittel-Tabelle konnte nicht geladen werden: ' + esc(e.message) + '</p>';
  });
})();
