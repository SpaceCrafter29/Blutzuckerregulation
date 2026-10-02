/* GlukoSim – App-Logik */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const H = Optimierer.hhmm, klon = Optimierer.klon, neueId = Optimierer.neueId, titel = Optimierer.titel;
  const VERSION = '1.0.2';
  const SPEICHER = 'glukosim-v1';
  const SPORTARTEN = [['Spazieren', 'leicht'], ['Radfahren', 'mittel'], ['Joggen', 'mittel'], ['Fußball', 'intensiv'],
    ['Schwimmen', 'mittel'], ['Krafttraining', 'mittel'], ['Tanzen', 'mittel'], ['Sport', 'mittel']];
  const PROFIL_INFO = {
    gesund: ['Gesund', 'Die Bauchspeicheldrüse regelt das Insulin automatisch.'],
    typ1: ['Diabetes Typ 1', 'Kein eigenes Insulin. Es muss gespritzt werden.'],
    typ2: ['Diabetes Typ 2', 'Insulin wirkt schwächer (Insulinresistenz).']
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ico = id => '<svg><use href="#i-' + id + '"/></svg>';
  const vib = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* egal */ } };
  const zuMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return Math.max(0, Math.min(1439, (h || 0) * 60 + (m || 0))); };
  const runde = (x, n) => Math.round(x / n) * n;

  // ---------------- Zustand ----------------
  const STANDARD = {
    version: 1, profil: 'gesund', gewicht: 70, apiKey: '', modell: 'gemini-flash-latest',
    eintraege: [], vorlagen: [], insulinZeigen: false, vInsulinZeigen: false, onboarding: false,
    demoUnveraendert: false, insulinBeiTyp2: false, zoom: 1, vZoom: 0, vAus: {}
  };
  const zustand = Object.assign({}, STANDARD, (() => { try { return JSON.parse(localStorage.getItem(SPEICHER)) || {}; } catch (e) { return {}; } })());
  let speicherTimer = null;
  function speichern() {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(() => {
      try { localStorage.setItem(SPEICHER, JSON.stringify(zustand)); } catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); }
    }, 120);
  }

  // Laufzeit
  let sim = null, st = null, vorschau = null, vorschlaege = null, erklaerung = null, vErklaerung = null;
  let planVersion = 0, seite = 'plan', planChart = null, vChart = null, installEvent = null;
  const simOpt = () => ({ gewicht: zustand.gewicht, insulinBeiTyp2: zustand.insulinBeiTyp2 });

  function geaendert() {
    zustand.demoUnveraendert = false;
    planVersion++; vorschau = null; vorschlaege = null; erklaerung = null; vErklaerung = null;
    speichern(); renderPlan();
  }

  // ---------------- Toast ----------------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('zeigen');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('zeigen'), 3200);
  }

  // ---------------- Mini-Markdown ----------------
  function md(text) {
    const bloecke = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
    return bloecke.map(b => {
      const zeilen = b.split('\n').filter(z => z.trim());
      const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      if (zeilen.length && zeilen.every(z => /^\s*[-*•]\s+/.test(z)))
        return '<ul>' + zeilen.map(z => '<li>' + fmt(z.replace(/^\s*[-*•]\s+/, '')) + '</li>').join('') + '</ul>';
      return '<p>' + zeilen.map(z => fmt(z.replace(/^#+\s*/, ''))).join('<br>') + '</p>';
    }).join('');
  }

  // ---------------- Plan: Berechnung & Anzeige ----------------
  function berechne() {
    sim = GlukoSim.simuliere(zustand.eintraege, zustand.profil, simOpt());
    st = GlukoSim.statistik(sim, zustand.profil);
  }

  function marker(eintraege, profil) {
    const m = [];
    for (const e of eintraege) {
      if (e.typ === 'sport') m.push({ t: e.zeit, breite: e.dauer || 30, farbe: 'rgba(143,180,255,0.08)' });
      else if (e.typ === 'essen') m.push({ t: e.zeit, farbe: 'rgba(233,237,248,0.16)' });
      else if (profil === 'typ1') m.push({ t: e.zeit, farbe: 'rgba(183,156,255,0.18)' });
    }
    return m;
  }

  function renderKurve() {
    berechne();
    const P = GlukoSim.PROFILE[zustand.profil];
    const serien = [{ G: sim.G }];
    if (vorschau) serien.push({ G: vorschau.sim.G, gestrichelt: true, farbe: 'rgba(233,237,248,0.9)' });
    planChart.setDaten({ serien, insulin: zustand.insulinZeigen ? [{ I: sim.I }] : [], ziel: P.ziel, marker: marker(zustand.eintraege, zustand.profil) });
    renderReadout(); renderStats();
  }

  function renderPlan() {
    renderKurve();
    renderSpuren(); renderListe(); renderErklaerung(); renderVorschlaege();
    const chip = $('#profilChip'); chip.dataset.profil = zustand.profil;
    $('#profilName').textContent = GlukoSim.PROFILE[zustand.profil].name;
    $('#t1Banner').hidden = !(zustand.profil === 'typ1' && zustand.eintraege.some(e => e.typ === 'essen') && !zustand.eintraege.some(e => e.typ === 'insulin'));
    $('#tInsulin').setAttribute('aria-pressed', zustand.insulinZeigen);
    if (seite === 'vergleich') renderVergleich();
  }

  function zone(g, ziel) {
    if (g < ziel[0]) return 'tief';
    if (g > 250) return 'sehrhoch';
    if (g > ziel[1]) return 'hoch';
    return 'ok';
  }

  function renderReadout() {
    const ziel = GlukoSim.PROFILE[zustand.profil].ziel;
    const kreuz = planChart.kreuz;
    const t = kreuz != null ? kreuz : st.maxT;
    const g = sim.G[t];
    const a = Math.max(0, t - 10), b = Math.min(1440, t + 10);
    const steigung = (sim.G[b] - sim.G[a]) / (b - a || 1);
    const winkel = steigung > 2 ? -90 : steigung > 0.8 ? -45 : steigung < -2 ? 90 : steigung < -0.8 ? 45 : 0;
    $('#readout').dataset.zone = zone(g, ziel);
    $('#roWert').textContent = Math.round(g);
    $('#roPfeil').style.transform = 'rotate(' + winkel + 'deg)';
    $('#roZeit').textContent = kreuz != null ? 'um ' + H(t) + ' Uhr' : 'Höchster Wert, ' + H(t) + ' Uhr';
    $('#roInsulin').textContent = zustand.insulinZeigen ? 'Insulin ' + Math.round(sim.I[t]) + ' µU/ml' : '';
  }

  function renderStats() {
    const [lo, hi] = st.ziel;
    const k = (v, gut, mittel) => v <= gut ? 'ok' : v <= mittel ? 'warn' : 'schlecht';
    const tiles = [
      ['Spitze', st.max + '<small>mg/dl</small>', 'um ' + H(st.maxT), st.max > hi + 70 ? 'schlecht' : st.max > hi ? 'warn' : 'ok'],
      ['Mittelwert', st.mittel + '<small>mg/dl</small>', 'über 24 h', st.mittel > hi ? 'schlecht' : st.mittel > hi - 25 ? 'warn' : 'ok'],
      ['Im Ziel', st.zielProzent + '<small>%</small>', lo + '–' + hi + ' mg/dl', st.zielProzent >= 90 ? 'ok' : st.zielProzent >= 70 ? 'warn' : 'schlecht'],
      ['Unterzucker', st.unterMin + '<small>min</small>', 'unter ' + lo, k(st.unterMin, 0, 30)]
    ];
    $('#planStats').innerHTML = tiles.map(t => '<div class="stat"><div class="stat-label">' + t[0] + '</div><div class="stat-wert ' + t[3] + '">' + t[1] + '</div><div class="stat-sub">' + t[2] + '</div></div>').join('');
  }

  // ---------------- Spuren & Drag & Drop ----------------
  function spurListe() { return zustand.profil === 'typ1' ? ['essen', 'sport', 'insulin'] : ['essen', 'sport']; }

  function renderSpuren() {
    const spuren = spurListe();
    planChart.setSpuren(spuren.length);
    const box = planChart.spuren;
    box.innerHTML = spuren.map((s, i) => '<div class="spur" style="top:' + (i * 36) + 'px"></div>').join('');
    for (const e of zustand.eintraege) {
      const i = spuren.indexOf(e.typ);
      if (i < 0) continue;
      const c = document.createElement('div');
      c.className = 'chip chip-' + e.typ;
      c.dataset.id = e.id;
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', titel(e) + ' um ' + H(e.zeit) + ', ziehen zum Verschieben');
      c.style.top = (i * 36 + 4) + 'px';
      const label = e.typ === 'essen' ? titel(e) : e.typ === 'sport' ? e.art + ' ' + e.dauer + '′' : e.einheiten + ' IE' + (e.art === 'lang' ? ' lang' : '');
      c.innerHTML = '<span class="chip-ico">' + ico(e.typ === 'essen' ? 'essen' : e.typ) + '</span><span class="chip-txt">' + esc(label) + '</span><span class="chip-zeit">' + H(e.zeit) + '</span>';
      box.appendChild(c);
      ziehbar(c, e);
    }
    positioniereChips();
  }

  function positioniereChip(c, e) {
    const px = planChart.pxProMin;
    if (e.typ === 'sport') {
      c.style.left = (e.zeit * px) + 'px';
      c.style.minWidth = Math.max(28, (e.dauer || 30) * px) + 'px';
      c.style.maxWidth = 'none';
    } else c.style.left = (e.zeit * px - 14) + 'px';
  }

  function positioniereChips() {
    if (!planChart) return;
    planChart.spuren.classList.toggle('kompakt', planChart.pxProStunde < 30);
    for (const c of $$('.chip', planChart.spuren)) {
      const e = zustand.eintraege.find(x => x.id === c.dataset.id);
      if (e) positioniereChip(c, e);
    }
    $('#zoomAus').disabled = planChart.zoomIndex === 0;
    $('#zoomEin').disabled = planChart.zoomIndex === 2;
  }

  function ziehbar(chip, e) {
    let d = null;
    chip.addEventListener('pointerdown', ev => {
      if (ev.button > 0) return;
      chip.setPointerCapture(ev.pointerId);
      d = { x: ev.clientX, zeit: e.zeit, offset: 0, bewegt: false, letztesX: ev.clientX, raf: 0 };
    });
    const neueZeit = () => {
      const schritt = planChart.zoomIndex === 0 ? 15 : 5;
      const t = d.zeit + (d.letztesX - d.x + d.offset) / planChart.pxProMin;
      return Math.max(0, Math.min(1440 - (e.typ === 'sport' ? e.dauer : 5), runde(t, schritt)));
    };
    const anwenden = () => {
      const t = neueZeit();
      if (t !== e.zeit) {
        e.zeit = t;
        positioniereChip(chip, e);
        $('.chip-zeit', chip).textContent = H(t);
        if (t % 60 === 0) vib(4);
        renderKurve();
      }
    };
    const autoScroll = () => {
      if (!d || !d.bewegt) return;
      const sc = planChart.scroller, r = sc.getBoundingClientRect();
      let v = 0;
      if (d.letztesX > r.right - 40) v = 9; else if (d.letztesX < r.left + 40) v = -9;
      if (v) { const vor = sc.scrollLeft; sc.scrollLeft += v; d.offset += sc.scrollLeft - vor; anwenden(); }
      d.raf = requestAnimationFrame(autoScroll);
    };
    chip.addEventListener('pointermove', ev => {
      if (!d) return;
      d.letztesX = ev.clientX;
      if (!d.bewegt && Math.abs(ev.clientX - d.x) > 6) {
        d.bewegt = true; chip.classList.add('zieht'); vib(12);
        planChart.kreuz = null;
        if (vorschau) { vorschau = null; renderVorschlaege(); }
        d.raf = requestAnimationFrame(autoScroll);
      }
      if (d.bewegt) anwenden();
    });
    const ende = () => {
      if (!d) return;
      cancelAnimationFrame(d.raf);
      const warBewegt = d.bewegt;
      d = null;
      chip.classList.remove('zieht');
      if (warBewegt) { vib(8); geaendert(); }
      else oeffneEintrag(e);
    };
    chip.addEventListener('pointerup', ende);
    chip.addEventListener('pointercancel', () => { if (d) { cancelAnimationFrame(d.raf); d = null; chip.classList.remove('zieht'); renderPlan(); } });
    chip.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); oeffneEintrag(e); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault(); e.zeit = Math.max(0, Math.min(1435, e.zeit + (ev.key === 'ArrowLeft' ? -15 : 15))); geaendert();
        const neu = $('.chip[data-id="' + e.id + '"]', planChart.spuren); neu && neu.focus();
      }
    });
  }

  // ---------------- Liste ----------------
  function untertitel(e) {
    if (e.typ === 'essen') return Math.round(e.summe.kh) + ' g Kohlenhydrate, GI ' + e.summe.gi;
    if (e.typ === 'sport') return e.dauer + ' min, ' + e.intensitaet;
    return (e.art === 'lang' ? 'Lang wirkend' : 'Schnell wirkend') + (zustand.profil !== 'typ1' && !(zustand.profil === 'typ2' && zustand.insulinBeiTyp2) ? ', wirkt nur bei Typ 1' : '');
  }

  function renderListe() {
    const ul = $('#eintragListe');
    const liste = zustand.eintraege.slice().sort((a, b) => a.zeit - b.zeit);
    if (!liste.length) {
      ul.innerHTML = '<li class="leer">Noch nichts eingetragen. Tippe auf + und füge eine Mahlzeit hinzu.<br><button class="btn tonal klein" data-aktion="demo">Beispieltag laden</button></li>';
      return;
    }
    const aktivInsulin = zustand.profil === 'typ1' || (zustand.profil === 'typ2' && zustand.insulinBeiTyp2);
    ul.innerHTML = liste.map(e => '<li class="eintrag ' + e.typ + (e.typ === 'insulin' && !aktivInsulin ? ' inaktiv' : '') + '" data-id="' + e.id + '" tabindex="0" role="button">' +
      '<span class="zeit">' + H(e.zeit) + '</span><span class="ico">' + ico(e.typ === 'essen' ? 'essen' : e.typ) + '</span>' +
      '<span class="txt"><div class="t1">' + esc(titel(e)) + '</div><div class="t2">' + esc(untertitel(e)) + '</div></span></li>').join('');
  }

  // ---------------- Erklärung ----------------
  const LAED = '<div class="laedt" aria-label="Wird erstellt"><span></span><span></span><span></span></div>';
  function erklaerHTML(e) {
    if (!e) return '';
    if (e.laden) return LAED;
    return '<div class="erklaerung">' + md(e.text) + '<div class="quelle">' + ico('funke') + esc(e.quelle) + '</div></div>';
  }
  function renderErklaerung() { $('#erklaerBox').innerHTML = erklaerHTML(erklaerung); }

  async function erklaeren() {
    if (!zustand.eintraege.length) { toast('Trage zuerst etwas in den Tag ein.'); return; }
    const p = zustand.profil;
    if (zustand.demoUnveraendert && Demo.texte[p]) {
      erklaerung = { text: Demo.texte[p], quelle: 'Beispieltag, vorab mit KI erstellt' };
      renderErklaerung(); return;
    }
    const lokal = Texte.lokaleErklaerung(zustand.eintraege, p, sim, st);
    if (!zustand.apiKey) {
      erklaerung = { text: lokal, quelle: 'Automatisch aus dem Modell. Mit Gemini-API-Key wird die Erklärung ausführlicher.' };
      renderErklaerung(); return;
    }
    const version = planVersion;
    erklaerung = { laden: true }; renderErklaerung();
    try {
      const text = await KI.erklaere(Texte.zusammenfassung(zustand.eintraege, p, sim, st), zustand);
      if (version !== planVersion || p !== zustand.profil) return;
      erklaerung = { text, quelle: 'Erklärt von Gemini' };
    } catch (e) {
      if (version !== planVersion) return;
      erklaerung = { text: lokal, quelle: e.message + ' Stattdessen automatische Erklärung aus dem Modell.' };
    }
    renderErklaerung();
  }

  // ---------------- Vorschläge ----------------
  function renderVorschlaege() {
    const box = $('#vorschlagBox');
    if (!vorschlaege) { box.innerHTML = ''; return; }
    let html = '<div class="vorschlaege">';
    if (!vorschlaege.liste.length && !vorschlaege.laedt)
      html += '<p class="leer-hinweis">Das Modell findet keine spürbare Verbesserung. Der Tag liegt schon gut im Zielbereich.</p>';
    for (const v of vorschlaege.liste) {
      const ef = Optimierer.effektText(v.effekt);
      const aktiv = vorschau && vorschau.id === v.id;
      html += '<article class="vorschlag' + (aktiv ? ' vorschau' : '') + '" data-id="' + v.id + '"><h3>' + esc(v.titel) + '</h3><p>' + esc(v.text) + '</p>' +
        (ef.length ? '<div class="effekte">' + ef.map(t => '<span class="effekt' + (t.includes('+') ? ' schlecht' : '') + '">' + esc(t) + '</span>').join('') + '</div>' : '') +
        '<div class="knoepfe"><button class="btn tonal klein" data-aktion="vorschau" aria-pressed="' + aktiv + '">' + (aktiv ? 'Vorschau aus' : 'Vorschau') + '</button>' +
        '<button class="btn primaer klein" data-aktion="uebernehmen">Übernehmen</button><span class="herkunft">' + (v.quelle === 'ki' ? 'Gemini' : 'Modell') + '</span></div></article>';
    }
    if (vorschlaege.laedt) html += '<div class="laedt"><span></span><span></span></div>';
    if (vorschlaege.fehler) html += '<p class="klein">' + esc(vorschlaege.fehler) + '</p>';
    box.innerHTML = html + '</div>';
  }

  async function optimieren() {
    if (!zustand.eintraege.some(e => e.typ === 'essen')) { toast('Trage zuerst eine Mahlzeit ein.'); return; }
    const p = zustand.profil, version = planVersion;
    const res = Optimierer.vorschlaege(zustand.eintraege, p, simOpt());
    vorschau = null;
    vorschlaege = { liste: res.vorschlaege, laedt: !!zustand.apiKey };
    renderKurve(); renderVorschlaege();
    $('#vorschlagBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (!zustand.apiKey) return;
    try {
      const ki = await KI.tauschVorschlaege(Texte.planText(zustand.eintraege, p) + '\nStoffwechsel: ' + Texte.PROFIL_TEXT[p], zustand);
      if (version !== planVersion || p !== zustand.profil) return;
      const basis = res.basis;
      for (const v of ki) {
        const alt = zustand.eintraege.find(e => e.id === v.eintragId && e.typ === 'essen');
        if (!alt) continue;
        const plan = klon(zustand.eintraege), ziel = plan.find(e => e.id === alt.id);
        ziel.zutaten = v.mahlzeit.zutaten; ziel.summe = Lebensmittel.summe(v.mahlzeit.zutaten);
        ziel.name = v.mahlzeit.name || ziel.name; ziel.quelle = 'Gemini';
        const s2 = GlukoSim.simuliere(plan, p, simOpt()), st2 = GlukoSim.statistik(s2, p);
        const fenster = G => { let m = 0; for (let t = alt.zeit; t <= Math.min(1440, alt.zeit + 180); t++) m = Math.max(m, G[t]); return m; };
        const effekt = { score: basis.score - GlukoSim.bewertung(s2, p), spitze: st2.max - basis.st.max, ueber: st2.ueberMin - basis.st.ueberMin, unter: st2.unterMin - basis.st.unterMin, ziel: st2.zielProzent - basis.st.zielProzent,
          danach: Math.round(fenster(s2.G) - fenster(basis.sim.G)), nachName: titel(alt) };
        if (effekt.unter > 0 || effekt.ueber > 0 || effekt.spitze > 0 || (effekt.score <= 0 && effekt.danach > -3)) continue;
        vorschlaege.liste.push({ id: neueId(), quelle: 'ki', titel: v.titel, text: v.text + ' Neu: ' + v.mahlzeit.zutaten.map(z => z.name + ' ' + z.gramm + ' g').join(', ') + '.', effekt, plan, sim: s2 });
      }
    } catch (e) {
      vorschlaege.fehler = 'Gemini-Vorschläge nicht verfügbar: ' + e.message;
    }
    vorschlaege.laedt = false;
    renderVorschlaege();
  }

  $('#vorschlagBox').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-aktion]'); if (!b) return;
    const v = vorschlaege && vorschlaege.liste.find(x => x.id === b.closest('.vorschlag').dataset.id); if (!v) return;
    if (b.dataset.aktion === 'vorschau') {
      vorschau = vorschau && vorschau.id === v.id ? null : v;
      renderKurve(); renderVorschlaege();
      if (vorschau) $('#seite-plan').scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      zustand.eintraege = klon(v.plan);
      vib(15); geaendert(); toast('Vorschlag übernommen');
      $('#seite-plan').scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ---------------- Vergleich ----------------
  const PROFILE_LISTE = ['gesund', 'typ1', 'typ2'];
  function vergleichErgebnisse() {
    const e = zustand.eintraege;
    const hatInsulin = e.some(x => x.typ === 'insulin');
    const t1Plan = hatInsulin ? e : e.concat(Optimierer.autoInsulin(e));
    const r = {};
    for (const p of PROFILE_LISTE) {
      const s = GlukoSim.simuliere(p === 'typ1' ? t1Plan : e, p, simOpt());
      r[p] = { sim: s, st: GlukoSim.statistik(s, 'gesund'), autoInsulin: p === 'typ1' && !hatInsulin };
    }
    return r;
  }

  let vErg = null;
  function renderVergleich() {
    vErg = vergleichErgebnisse();
    const aus = zustand.vAus || {};
    const serien = [], insulin = [];
    for (const p of PROFILE_LISTE) {
      if (aus[p]) continue;
      const f = GlukoSim.PROFILE[p].farbe;
      serien.push({ G: vErg[p].sim.G, farbe: f });
      if (zustand.vInsulinZeigen) insulin.push({ I: vErg[p].sim.I, farbe: f, fuellung: f + '1f' });
    }
    vChart.setDaten({ serien, insulin, ziel: [70, 140], marker: marker(zustand.eintraege, 'gesund'), spitzeZeigen: false });
    const t = vChart.kreuz;
    $('#vLegende').innerHTML = PROFILE_LISTE.map(p => '<button data-p="' + p + '" aria-pressed="' + !aus[p] + '"><span class="farbpunkt" style="background:' + GlukoSim.PROFILE[p].farbe + '"></span>' +
      GlukoSim.PROFILE[p].name + (t != null ? ' <span class="lw">' + Math.round(vErg[p].sim.G[t]) + '</span>' : '') + '</button>').join('') +
      (t != null ? '<span class="klein" style="align-self:center">um ' + H(t) + '</span>' : '');
    $('#vTabelle').innerHTML = '<thead><tr><th>Profil</th><th>Spitze</th><th>Ø</th><th>70–140</th><th>Insulin max</th></tr></thead><tbody>' +
      PROFILE_LISTE.map(p => { const s = vErg[p].st; return '<tr><td><span class="farbpunkt" style="background:' + GlukoSim.PROFILE[p].farbe + '"></span>' + GlukoSim.PROFILE[p].name + '</td><td>' + s.max + '</td><td>' + s.mittel + '</td><td>' + s.zielProzent + ' %</td><td>' + s.insulinMax + '</td></tr>'; }).join('') + '</tbody>';
    $('#vHinweis').textContent = vErg.typ1.autoInsulin
      ? 'Typ 1 wird mit einer Standard-Therapie simuliert: 16 IE Langzeitinsulin und 1 IE schnelles Insulin pro 10 g Kohlenhydrate.'
      : 'Typ 1 nutzt das Insulin aus deinem Tagesplan. Werte in mg/dl, Insulin in µU/ml.';
    $('#vInsulin').setAttribute('aria-pressed', zustand.vInsulinZeigen);
    $('#vErklaerBox').innerHTML = erklaerHTML(vErklaerung);
    $('#vZoomAus').disabled = vChart.zoomIndex === 0;
    $('#vZoomEin').disabled = vChart.zoomIndex === 2;
  }

  async function vergleichErklaeren() {
    if (!zustand.eintraege.length) { toast('Trage zuerst etwas in den Tag ein.'); return; }
    if (zustand.demoUnveraendert) { vErklaerung = { text: Demo.texte.vergleich, quelle: 'Beispieltag, vorab mit KI erstellt' }; renderVergleich(); return; }
    const r = vErg || vergleichErgebnisse();
    const lokal = Texte.lokalerVergleich(r);
    if (!zustand.apiKey) { vErklaerung = { text: lokal, quelle: 'Automatisch aus dem Modell. Mit Gemini-API-Key wird die Erklärung ausführlicher.' }; renderVergleich(); return; }
    const version = planVersion;
    vErklaerung = { laden: true }; renderVergleich();
    try {
      const text = await KI.vergleicheErklaeren(Texte.vergleichZusammenfassung(zustand.eintraege, r), zustand);
      if (version !== planVersion) return;
      vErklaerung = { text, quelle: 'Erklärt von Gemini' };
    } catch (e) {
      vErklaerung = { text: lokal, quelle: e.message + ' Stattdessen automatische Erklärung aus dem Modell.' };
    }
    if (seite === 'vergleich') renderVergleich();
  }

  // ---------------- Mahlzeiten (Vorlagen) ----------------
  function renderVorlagen() {
    const ul = $('#vorlagenListe');
    if (!zustand.vorlagen.length) {
      ul.innerHTML = '<li class="leer">Noch keine gespeicherten Mahlzeiten.<br>Tippe auf + oder hake beim Eintragen „Als Mahlzeit speichern“ an.</li>';
      return;
    }
    ul.innerHTML = zustand.vorlagen.map(v => '<li class="eintrag essen" data-id="' + v.id + '" tabindex="0" role="button"><span class="ico">' + ico('essen') + '</span>' +
      '<span class="txt"><div class="t1">' + esc(v.name) + '</div><div class="t2">' + Math.round(v.summe.kh) + ' g KH, GI ' + v.summe.gi + ', ' + v.summe.kcal + ' kcal</div></span></li>').join('');
  }

  // ---------------- Sheet (Bottom-Sheet) ----------------
  const sheet = $('#sheet'), scrim = $('#scrim'), sheetInhalt = $('#sheetInhalt');
  let sheetOffen = false, sheetBeimSchliessen = null;
  function oeffneSheet(html, beiMount, beimSchliessen) {
    sheetInhalt.innerHTML = html;
    sheetInhalt.scrollTop = 0;
    if (!sheetOffen) { history.pushState({ seite, sheet: true }, ''); sheetOffen = true; }
    sheetBeimSchliessen = beimSchliessen || null;
    requestAnimationFrame(() => { sheet.classList.add('offen'); scrim.classList.add('offen'); });
    beiMount && beiMount(sheetInhalt);
  }
  function schliesseSheetUI() {
    sheetOffen = false;
    sheet.classList.remove('offen'); scrim.classList.remove('offen');
    sheet.style.transform = '';
    const cb = sheetBeimSchliessen; sheetBeimSchliessen = null; cb && cb();
    if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
  }
  function schliesseSheet() {
    if (!sheetOffen) return;
    if (history.state && history.state.sheet) history.back(); else schliesseSheetUI();
  }
  scrim.addEventListener('click', schliesseSheet);
  (function griffZiehen() {
    const griff = $('#sheetGriff'); let y0 = null, dy = 0;
    griff.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; griff.setPointerCapture(e.pointerId); sheet.classList.add('zieht'); });
    griff.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = 'translateY(' + dy + 'px)'; });
    const ende = () => { if (y0 == null) return; y0 = null; sheet.classList.remove('zieht'); sheet.style.transform = ''; if (dy > 90) schliesseSheet(); };
    griff.addEventListener('pointerup', ende); griff.addEventListener('pointercancel', ende);
  })();

  function bestaetigen(frage, text, knopf, aktion) {
    oeffneSheet('<h3>' + esc(frage) + '</h3><p class="untertitel">' + esc(text) + '</p><div class="zeile"><button class="btn tonal" data-x="nein">Abbrechen</button><button class="btn gefahr" data-x="ja">' + esc(knopf) + '</button></div>', el => {
      $('[data-x="nein"]', el).onclick = schliesseSheet;
      $('[data-x="ja"]', el).onclick = () => { schliesseSheet(); aktion(); };
    });
  }

  function standardZeit() {
    if (planChart.kreuz != null) return runde(planChart.kreuz, 15);
    return Math.max(0, Math.min(1425, runde(planChart.sichtMitte(), 15)));
  }
  function segmentWahl(el, wert) {
    for (const b of $$('button', el)) b.setAttribute('aria-checked', b.dataset.wert === wert);
  }

  // ---------------- Neu-Auswahl ----------------
  function oeffneNeu() {
    oeffneSheet('<h3>Hinzufügen</h3><div class="neu-kacheln">' +
      '<button class="neu-kachel" data-neu="essen"><span class="ico">' + ico('essen') + '</span>Mahlzeit</button>' +
      '<button class="neu-kachel sport" data-neu="sport"><span class="ico">' + ico('sport') + '</span>Sport</button>' +
      '<button class="neu-kachel insulin" data-neu="insulin"><span class="ico">' + ico('insulin') + '</span>Insulin</button></div>' +
      (zustand.profil !== 'typ1' ? '<p class="klein">Insulin wirkt in der Simulation nur beim Profil Typ 1.</p>' : ''), el => {
      for (const b of $$('[data-neu]', el)) b.onclick = () => {
        const z = standardZeit();
        if (b.dataset.neu === 'essen') mahlzeitSheet(null, z);
        else if (b.dataset.neu === 'sport') sportSheet(null, z);
        else insulinSheet(null, z);
      };
    });
  }

  function oeffneEintrag(e) {
    if (e.typ === 'essen') mahlzeitSheet(e);
    else if (e.typ === 'sport') sportSheet(e);
    else insulinSheet(e);
  }

  // ---------------- Mahlzeit ----------------
  function namensVorschlag(zeit) {
    return zeit < 630 ? 'Frühstück' : zeit < 690 ? 'Snack' : zeit < 870 ? 'Mittagessen' : zeit < 1050 ? 'Snack' : 'Abendessen';
  }

  function mahlzeitSheet(vorhanden, zeit, modus) {
    modus = modus || 'plan';
    const e = vorhanden ? klon(vorhanden) : { id: neueId(), typ: 'essen', name: '', eingabe: '', zutaten: [], zeit: zeit || 720, quelle: '' };
    const w = { unbekannt: [], busy: false, alsVorlage: false };
    const html =
      '<h3>' + (vorhanden ? 'Mahlzeit bearbeiten' : modus === 'vorlage' ? 'Neue gespeicherte Mahlzeit' : 'Mahlzeit') + '</h3>' +
      '<label class="feld"><span>Was isst du?</span><textarea id="mEingabe" rows="2" placeholder="z. B. Nudeln 250 g, Tomatensoße 150 g">' + esc(e.eingabe || '') + '</textarea></label>' +
      '<div class="zeile"><button class="btn tonal" id="mFoto">' + ico('kamera') + 'Foto <span class="experimentell">Test</span></button>' +
      '<button class="btn primaer" id="mAnalyse">Nährwerte ermitteln</button></div>' +
      '<input type="file" accept="image/*" capture="environment" id="mFotoInput" hidden>' +
      (!vorhanden && zustand.vorlagen.length && modus === 'plan' ? '<div class="chips-scroll" id="mVorlagen">' + zustand.vorlagen.map(v => '<button data-v="' + v.id + '">' + esc(v.name) + '</button>').join('') + '</div>' : '') +
      '<div id="mErgebnis" style="display:flex;flex-direction:column;gap:14px"></div>';
    oeffneSheet(html, el => {
      const eingabe = $('#mEingabe', el), erg = $('#mErgebnis', el);
      const setzeBusy = (b, knopf) => { w.busy = b; for (const k of [$('#mAnalyse', el), $('#mFoto', el)]) k.disabled = b; if (knopf) knopf.innerHTML = b ? '<span class="spinner"></span>Wird ermittelt' : knopf.dataset.label; };
      $('#mAnalyse', el).dataset.label = $('#mAnalyse', el).innerHTML;
      $('#mFoto', el).dataset.label = $('#mFoto', el).innerHTML;

      function zutatHTML(z, i) {
        const f = (k, l) => '<label>' + l + '<input type="number" inputmode="decimal" step="any" data-k="' + k + '" value="' + (z[k] ?? 0) + '"></label>';
        return '<div class="zutat" data-i="' + i + '"><div class="zutat-kopf"><input class="z-name" value="' + esc(z.name) + '" aria-label="Zutat">' +
          '<span class="gramm"><input type="number" inputmode="decimal" class="z-gramm" value="' + z.gramm + '" aria-label="Menge in Gramm">g</span>' +
          '<button class="x" aria-label="Zutat entfernen">' + ico('x') + '</button></div>' +
          '<div class="zutat-werte">' + f('kh', 'KH') + f('zucker', 'Zucker') + f('ballaststoffe', 'Ballast') + f('fett', 'Fett') + f('protein', 'Eiweiß') + f('gi', 'GI') + '</div></div>';
      }
      function summeHTML() {
        const s = Lebensmittel.summe(e.zutaten);
        return '<div class="summe"><div><b>' + Math.round(s.kh) + '</b><span>g KH</span></div><div><b>' + s.gi + '</b><span>GI</span></div><div><b>' + Math.round(s.gl) + '</b><span>Glyk. Last</span></div><div><b>' + s.kcal + '</b><span>kcal</span></div></div>';
      }
      function zeichne() {
        if (!e.zutaten.length) { erg.innerHTML = w.unbekannt.length ? '<p class="warnung">Nicht erkannt: ' + esc(w.unbekannt.join(', ')) + '.</p>' : ''; return; }
        const quelle = e.quelle === 'Gemini' ? 'Werte von Gemini' : e.quelle === 'Gemini (Foto)' ? 'Werte von Gemini, aus dem Foto geschätzt' : e.quelle === 'Liste' ? 'Richtwerte aus der eingebauten Liste' : e.quelle ? 'Werte: ' + e.quelle : 'Eigene Werte';
        erg.innerHTML =
          '<span class="quelle-tag">' + ico('funke') + esc(quelle) + '. Alle Werte lassen sich anpassen.</span>' +
          (w.unbekannt.length ? '<p class="warnung">Nicht in der Liste: ' + esc(w.unbekannt.join(', ')) + '. Trage die Werte selbst ein oder hinterlege einen Gemini-API-Key.</p>' : '') +
          '<label class="feld"><span>Name</span><input id="mName" value="' + esc(e.name) + '" placeholder="' + namensVorschlag(e.zeit) + '"></label>' +
          '<div id="mZutaten" style="display:flex;flex-direction:column;gap:8px">' + e.zutaten.map(zutatHTML).join('') + '</div>' +
          '<button class="text-btn" id="mPlus" style="align-self:flex-start">+ Zutat hinzufügen</button>' +
          '<div id="mSumme">' + summeHTML() + '</div>' +
          (modus === 'plan' ? '<label class="feld"><span>Uhrzeit</span><input type="time" id="mZeit" value="' + H(e.zeit) + '"></label>' : '') +
          (modus === 'plan' ? '<label class="schalter"><input type="checkbox" id="mVorlage"' + (w.alsVorlage ? ' checked' : '') + '><span class="schiene"></span><span>Als Mahlzeit speichern (zum Wiederverwenden)</span></label>' : '') +
          '<button class="btn primaer voll" id="mSpeichern">' + (vorhanden ? 'Änderungen speichern' : modus === 'vorlage' ? 'Mahlzeit speichern' : 'Zum Tag hinzufügen') + '</button>' +
          (vorhanden ? '<button class="text-btn gefahr" id="mLoeschen">Mahlzeit löschen</button>' : '');
        binde();
      }
      function aktualisiereSumme() { const s = $('#mSumme', el); if (s) s.innerHTML = summeHTML(); }
      function binde() {
        $('#mName', el).oninput = ev => { e.name = ev.target.value; };
        const zt = $('#mZeit', el); if (zt) zt.onchange = ev => { e.zeit = zuMin(ev.target.value); };
        const vl = $('#mVorlage', el); if (vl) vl.onchange = ev => { w.alsVorlage = ev.target.checked; };
        $('#mPlus', el).onclick = () => { e.zutaten.push({ name: 'Zutat', gramm: 100, kh: 0, zucker: 0, ballaststoffe: 0, fett: 0, protein: 0, kcal: 0, gi: 50 }); zeichne(); };
        for (const box of $$('.zutat', el)) {
          const z = e.zutaten[+box.dataset.i];
          $('.z-name', box).oninput = ev => { z.name = ev.target.value; };
          $('.x', box).onclick = () => { e.zutaten.splice(+box.dataset.i, 1); zeichne(); };
          $('.z-gramm', box).onchange = ev => {
            const neu = Math.max(0, parseFloat(ev.target.value) || 0), alt = z.gramm || 0;
            if (alt > 0) { const f = neu / alt; for (const k of ['kh', 'zucker', 'ballaststoffe', 'fett', 'protein']) z[k] = Math.round(z[k] * f * 10) / 10; z.kcal = Math.round(z.kcal * f); }
            z.gramm = neu;
            for (const inp of $$('.zutat-werte input', box)) inp.value = z[inp.dataset.k];
            aktualisiereSumme();
          };
          for (const inp of $$('.zutat-werte input', box)) inp.oninput = () => { z[inp.dataset.k] = Math.max(0, parseFloat(inp.value) || 0); aktualisiereSumme(); };
        }
        $('#mSpeichern', el).onclick = speichereMahlzeit;
        const lo = $('#mLoeschen', el); if (lo) lo.onclick = () => { zustand.eintraege = zustand.eintraege.filter(x => x.id !== e.id); schliesseSheet(); geaendert(); toast('Mahlzeit gelöscht'); };
      }
      function lokalAnalysieren(text) {
        const r = Lebensmittel.parse(text);
        w.unbekannt = r.unbekannt;
        e.zutaten = r.zutaten.concat(r.unbekannt.map(u => {
          const m = u.match(/(\d+(?:[.,]\d+)?)/);
          return { name: u.replace(/(\d+(?:[.,]\d+)?)\s*(g|ml|gramm)?/i, '').trim() || u, gramm: m ? Math.round(parseFloat(m[1].replace(',', '.'))) : 100, kh: 0, zucker: 0, ballaststoffe: 0, fett: 0, protein: 0, kcal: 0, gi: 50 };
        }));
        e.quelle = 'Liste';
      }
      async function analysieren() {
        const text = eingabe.value.trim();
        if (!text) { toast('Beschreibe zuerst, was du isst.'); eingabe.focus(); return; }
        e.eingabe = text; w.unbekannt = [];
        if (zustand.apiKey) {
          setzeBusy(true, $('#mAnalyse', el));
          try {
            const r = await KI.naehrwerte(text, zustand);
            e.zutaten = r.zutaten; e.quelle = 'Gemini';
            if (!e.name && r.name) e.name = r.name;
          } catch (err) {
            toast(err.message + ' Nutze eingebaute Liste.');
            lokalAnalysieren(text);
          }
          setzeBusy(false, $('#mAnalyse', el));
        } else lokalAnalysieren(text);
        zeichne();
      }
      async function fotoAnalysieren(datei) {
        if (!zustand.apiKey) { toast('Für Fotos brauchst du einen Gemini-API-Key (Einstellungen).'); return; }
        setzeBusy(true, $('#mFoto', el));
        try {
          const bild = await verkleinere(datei);
          const r = await KI.naehrwerteBild(bild, eingabe.value.trim(), zustand);
          e.zutaten = r.zutaten; e.quelle = 'Gemini (Foto)'; w.unbekannt = [];
          if (!e.name && r.name) e.name = r.name;
          e.eingabe = r.zutaten.map(z => z.name + ' ' + z.gramm + ' g').join(', ');
          eingabe.value = e.eingabe;
        } catch (err) { toast(err.message); }
        setzeBusy(false, $('#mFoto', el));
        zeichne();
      }
      function speichereMahlzeit() {
        if (!e.zutaten.length) { toast('Keine Zutaten vorhanden.'); return; }
        e.summe = Lebensmittel.summe(e.zutaten);
        e.name = (e.name || '').trim() || namensVorschlag(e.zeit);
        if (modus === 'vorlage' || w.alsVorlage) {
          zustand.vorlagen.unshift({ id: neueId(), name: e.name, eingabe: e.eingabe, zutaten: klon(e.zutaten), summe: e.summe, quelle: e.quelle });
          zustand.vorlagen = zustand.vorlagen.slice(0, 60);
        }
        if (modus === 'vorlage') { speichern(); schliesseSheet(); renderVorlagen(); toast('Mahlzeit gespeichert'); return; }
        const i = zustand.eintraege.findIndex(x => x.id === e.id);
        if (i >= 0) zustand.eintraege[i] = e; else zustand.eintraege.push(e);
        schliesseSheet(); vib(10); geaendert();
        planChart.zeigeZeit(e.zeit, true);
        toast(vorhanden ? 'Gespeichert' : '„' + e.name + '“ hinzugefügt');
      }
      $('#mAnalyse', el).onclick = analysieren;
      $('#mFoto', el).onclick = () => $('#mFotoInput', el).click();
      $('#mFotoInput', el).onchange = ev => { const f = ev.target.files && ev.target.files[0]; if (f) fotoAnalysieren(f); ev.target.value = ''; };
      eingabe.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); analysieren(); } });
      const vc = $('#mVorlagen', el);
      if (vc) vc.onclick = ev => {
        const b = ev.target.closest('[data-v]'); if (!b) return;
        const v = zustand.vorlagen.find(x => x.id === b.dataset.v); if (!v) return;
        e.name = v.name; e.eingabe = v.eingabe || ''; e.zutaten = klon(v.zutaten); e.quelle = v.quelle || 'gespeichert';
        eingabe.value = e.eingabe; zeichne();
      };
      zeichne();
      if (!vorhanden && !zustand.vorlagen.length) setTimeout(() => eingabe.focus(), 350);
    });
  }

  function verkleinere(datei) {
    return new Promise((ok, fehler) => {
      const r = new FileReader();
      r.onerror = () => fehler(new Error('Foto konnte nicht gelesen werden.'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => fehler(new Error('Foto-Format wird nicht unterstützt.'));
        img.onload = () => {
          const max = 1024, f = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] });
        };
        img.src = r.result;
      };
      r.readAsDataURL(datei);
    });
  }

  // ---------------- Sport ----------------
  function sportSheet(vorhanden, zeit) {
    const e = vorhanden ? klon(vorhanden) : { id: neueId(), typ: 'sport', art: 'Spazieren', dauer: 30, intensitaet: 'leicht', zeit: zeit || 1020 };
    oeffneSheet('<h3>' + (vorhanden ? 'Sport bearbeiten' : 'Sport') + '</h3>' +
      '<div class="wahl" id="sArt" role="radiogroup">' + SPORTARTEN.map(s => '<button data-wert="' + s[0] + '" role="radio">' + (s[0] === 'Sport' ? 'Anderes' : s[0]) + '</button>').join('') + '</div>' +
      '<div class="bereich"><div class="bereich-kopf"><span>Dauer</span><output id="sDauerW"></output></div><input type="range" id="sDauer" min="5" max="120" step="5" value="' + e.dauer + '"></div>' +
      '<div class="feld"><span>Intensität</span><div class="segment" id="sInt" role="radiogroup"><button data-wert="leicht" role="radio">Leicht</button><button data-wert="mittel" role="radio">Mittel</button><button data-wert="intensiv" role="radio">Intensiv</button></div></div>' +
      '<label class="feld"><span>Beginn</span><input type="time" id="sZeit" value="' + H(e.zeit) + '"></label>' +
      '<p class="klein">Arbeitende Muskeln nehmen Glukose auch ohne Insulin auf. Danach wirkt Insulin für einige Stunden stärker.</p>' +
      '<button class="btn primaer voll" id="sSpeichern">' + (vorhanden ? 'Änderungen speichern' : 'Zum Tag hinzufügen') + '</button>' +
      (vorhanden ? '<button class="text-btn gefahr" id="sLoeschen">Sport löschen</button>' : ''), el => {
      const art = $('#sArt', el), int = $('#sInt', el);
      const zeige = () => { segmentWahl(art, e.art); segmentWahl(int, e.intensitaet); $('#sDauerW', el).textContent = e.dauer + ' min'; };
      art.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; e.art = b.dataset.wert; e.intensitaet = (SPORTARTEN.find(s => s[0] === e.art) || [0, 'mittel'])[1]; zeige(); };
      int.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; e.intensitaet = b.dataset.wert; zeige(); };
      $('#sDauer', el).oninput = ev => { e.dauer = +ev.target.value; zeige(); };
      $('#sZeit', el).onchange = ev => { e.zeit = zuMin(ev.target.value); };
      $('#sSpeichern', el).onclick = () => {
        e.zeit = Math.min(e.zeit, 1440 - e.dauer);
        const i = zustand.eintraege.findIndex(x => x.id === e.id);
        if (i >= 0) zustand.eintraege[i] = e; else zustand.eintraege.push(e);
        schliesseSheet(); vib(10); geaendert(); planChart.zeigeZeit(e.zeit, true);
        toast(vorhanden ? 'Gespeichert' : e.art + ' hinzugefügt');
      };
      const lo = $('#sLoeschen', el); if (lo) lo.onclick = () => { zustand.eintraege = zustand.eintraege.filter(x => x.id !== e.id); schliesseSheet(); geaendert(); toast('Sport gelöscht'); };
      zeige();
    });
  }

  // ---------------- Insulin ----------------
  function insulinSheet(vorhanden, zeit) {
    const e = vorhanden ? klon(vorhanden) : { id: neueId(), typ: 'insulin', art: 'schnell', einheiten: 6, zeit: zeit || 720 };
    const kh = zustand.eintraege.filter(x => x.typ === 'essen' && Math.abs(x.zeit - e.zeit) <= 45).reduce((a, x) => a + x.summe.kh, 0);
    oeffneSheet('<h3>' + (vorhanden ? 'Insulin bearbeiten' : 'Insulin') + '</h3>' +
      (zustand.profil !== 'typ1' ? '<p class="warnung">Aktuelles Profil: ' + GlukoSim.PROFILE[zustand.profil].name + '. Gespritztes Insulin wirkt in der Simulation nur bei Typ 1' + (zustand.profil === 'typ2' ? ' (oder in den Einstellungen für Typ 2 aktivieren)' : '') + '.</p>' : '') +
      '<div class="segment" id="iArt" role="radiogroup"><button data-wert="schnell" role="radio">Schnell (zum Essen)</button><button data-wert="lang" role="radio">Lang (Grundbedarf)</button></div>' +
      '<div class="stepper"><button id="iMinus" aria-label="Weniger">−</button><output id="iWert"></output><button id="iPlus" aria-label="Mehr">+</button></div>' +
      '<label class="feld"><span>Uhrzeit</span><input type="time" id="iZeit" value="' + H(e.zeit) + '"></label>' +
      '<p class="klein" id="iHinweis"></p>' +
      '<button class="btn primaer voll" id="iSpeichern">' + (vorhanden ? 'Änderungen speichern' : 'Zum Tag hinzufügen') + '</button>' +
      (vorhanden ? '<button class="text-btn gefahr" id="iLoeschen">Insulin löschen</button>' : ''), el => {
      const zeige = () => {
        segmentWahl($('#iArt', el), e.art);
        $('#iWert', el).innerHTML = e.einheiten + '<small> IE</small>';
        $('#iHinweis', el).textContent = e.art === 'lang'
          ? 'Langzeitinsulin wirkt etwa 24 Stunden gleichmäßig und ersetzt die Grundausschüttung der Bauchspeicheldrüse.'
          : 'Wirkt nach etwa 15 Minuten, am stärksten nach rund einer Stunde. Faustregel im Modell: 1 IE pro 10 g Kohlenhydrate' + (kh ? ' (hier ca. ' + Math.round(kh / 10) + ' IE für ' + Math.round(kh) + ' g).' : '.');
      };
      $('#iArt', el).onclick = ev => { const b = ev.target.closest('button'); if (!b) return; e.art = b.dataset.wert; if (!vorhanden) { e.einheiten = e.art === 'lang' ? 16 : 6; if (e.art === 'lang') e.zeit = 1320, $('#iZeit', el).value = H(1320); } zeige(); };
      $('#iMinus', el).onclick = () => { e.einheiten = Math.max(1, e.einheiten - 1); zeige(); };
      $('#iPlus', el).onclick = () => { e.einheiten = Math.min(60, e.einheiten + 1); zeige(); };
      $('#iZeit', el).onchange = ev => { e.zeit = zuMin(ev.target.value); };
      $('#iSpeichern', el).onclick = () => {
        const i = zustand.eintraege.findIndex(x => x.id === e.id);
        if (i >= 0) zustand.eintraege[i] = e; else zustand.eintraege.push(e);
        schliesseSheet(); vib(10); geaendert(); toast(vorhanden ? 'Gespeichert' : 'Insulin hinzugefügt');
      };
      const lo = $('#iLoeschen', el); if (lo) lo.onclick = () => { zustand.eintraege = zustand.eintraege.filter(x => x.id !== e.id); schliesseSheet(); geaendert(); toast('Insulin gelöscht'); };
      zeige();
    });
  }

  // ---------------- Profil ----------------
  function setzeProfil(p) {
    if (!GlukoSim.PROFILE[p] || p === zustand.profil) return;
    zustand.profil = p; vorschau = null; vorschlaege = null; erklaerung = null;
    speichern(); renderPlan(); renderEinstellungen();
  }
  function profilSheet() {
    oeffneSheet('<h3>Stoffwechsel</h3><p class="untertitel">Wähle, wessen Tag simuliert wird.</p>' +
      PROFILE_LISTE.map(p => '<button class="profil-karte" data-p="' + p + '" role="radio" aria-checked="' + (p === zustand.profil) + '"><span class="farbpunkt" style="background:' + GlukoSim.PROFILE[p].farbe + '"></span><span><b>' + PROFIL_INFO[p][0] + '</b><span>' + PROFIL_INFO[p][1] + '</span></span></button>').join(''), el => {
      for (const b of $$('[data-p]', el)) b.onclick = () => { setzeProfil(b.dataset.p); vib(8); schliesseSheet(); };
    });
  }

  function vorlageSheet(v) {
    oeffneSheet('<h3>' + esc(v.name) + '</h3><p class="untertitel">' + v.zutaten.map(z => esc(z.name) + ' ' + z.gramm + ' g').join(', ') + '</p>' +
      '<div class="summe"><div><b>' + Math.round(v.summe.kh) + '</b><span>g KH</span></div><div><b>' + v.summe.gi + '</b><span>GI</span></div><div><b>' + Math.round(v.summe.gl) + '</b><span>Glyk. Last</span></div><div><b>' + v.summe.kcal + '</b><span>kcal</span></div></div>' +
      '<label class="feld"><span>Uhrzeit</span><input type="time" id="vZeit" value="' + H(standardZeit()) + '"></label>' +
      '<button class="btn primaer voll" id="vHinzu">Zum Tag hinzufügen</button><button class="text-btn gefahr" id="vLoeschen">Gespeicherte Mahlzeit löschen</button>', el => {
      $('#vHinzu', el).onclick = () => {
        const z = zuMin($('#vZeit', el).value);
        zustand.eintraege.push({ id: neueId(), typ: 'essen', name: v.name, eingabe: v.eingabe, zutaten: klon(v.zutaten), summe: v.summe, quelle: v.quelle, zeit: z });
        schliesseSheet(); geaendert(); toast('„' + v.name + '“ um ' + H(z) + ' hinzugefügt');
      };
      $('#vLoeschen', el).onclick = () => { zustand.vorlagen = zustand.vorlagen.filter(x => x.id !== v.id); speichern(); schliesseSheet(); renderVorlagen(); };
    });
  }

  // ---------------- Navigation ----------------
  const SEITEN = ['plan', 'vergleich', 'essen', 'einstellungen'];
  const SEITEN_TITEL = { plan: 'Tagesplan', vergleich: 'Vergleich', essen: 'Mahlzeiten', einstellungen: 'Einstellungen' };
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
      el.setAttribute('aria-hidden', i !== idx);
      el.inert = i !== idx;
    }
    for (const b of $$('#nav button')) b.classList.toggle('aktiv', b.dataset.ziel === s);
    document.body.dataset.seite = s;
    $('#appTitel').textContent = SEITEN_TITEL[s];
    $('#fab').classList.toggle('weg', !(s === 'plan' || s === 'essen'));
    if (s === 'vergleich') renderVergleich();
    if (s === 'essen') renderVorlagen();
    if (s === 'einstellungen') renderEinstellungen();
  }
  window.addEventListener('popstate', ev => {
    if (sheetOffen) { schliesseSheetUI(); return; }
    zeigeSeite((ev.state && ev.state.seite) || 'plan', true);
  });

  // ---------------- Einstellungen ----------------
  function renderEinstellungen() {
    segmentWahl($('#eProfil'), zustand.profil);
    $('#eGewicht').value = zustand.gewicht;
    $('#eKey').value = zustand.apiKey;
    $('#eModell').value = zustand.modell;
    $('#eInsulinT2').checked = !!zustand.insulinBeiTyp2;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    $('#eInstallieren').hidden = !installEvent || standalone;
    $('#eInstallHinweis').textContent = standalone ? 'GlukoSim läuft als installierte App.' : installEvent ? 'Installiert startet GlukoSim wie eine normale App und funktioniert auch offline.' : 'Zum Installieren im Browser-Menü „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen.';
    $('#eVersion').textContent = 'Version ' + VERSION;
  }

  function bindeEinstellungen() {
    $('#eProfil').onclick = ev => { const b = ev.target.closest('button'); if (b) setzeProfil(b.dataset.wert); };
    $('#eGewicht').onchange = ev => { zustand.gewicht = Math.max(25, Math.min(200, parseFloat(ev.target.value) || 70)); ev.target.value = zustand.gewicht; geaendert(); };
    $('#eKey').onchange = ev => { zustand.apiKey = ev.target.value.trim(); speichern(); $('#eTestErgebnis').textContent = ''; };
    $('#eModell').onchange = ev => { zustand.modell = ev.target.value.trim() || STANDARD.modell; ev.target.value = zustand.modell; speichern(); };
    $('#eKeyZeigen').onclick = () => { const i = $('#eKey'); i.type = i.type === 'password' ? 'text' : 'password'; };
    $('#eInsulinT2').onchange = ev => { zustand.insulinBeiTyp2 = ev.target.checked; geaendert(); };
    $('#eTesten').onclick = async () => {
      zustand.apiKey = $('#eKey').value.trim(); zustand.modell = $('#eModell').value.trim() || STANDARD.modell; speichern();
      const out = $('#eTestErgebnis'), b = $('#eTesten');
      b.disabled = true; out.textContent = 'Verbinde …';
      try { await KI.testen(zustand); out.textContent = 'Verbindung klappt. Modell: ' + zustand.modell; out.style.color = 'var(--mint)'; }
      catch (e) { out.textContent = e.message; out.style.color = 'var(--rot)'; }
      b.disabled = false;
    };
    $('#eInstallieren').onclick = installieren;
    $('#eDemo').onclick = () => ladeDemo(true);
    $('#eEinfuehrung').onclick = () => zeigeOnboarding(0);
    $('#eCache').onclick = () => { KI.cacheLeeren(); toast('KI-Zwischenspeicher geleert'); };
    $('#eLeeren').onclick = () => bestaetigen('Tag leeren?', 'Alle Einträge des Tages werden gelöscht. Gespeicherte Mahlzeiten bleiben erhalten.', 'Leeren', () => {
      zustand.eintraege = []; geaendert(); toast('Tag geleert'); zeigeSeite('plan');
    });
  }

  function ladeDemo(nachfragen) {
    const aktion = () => {
      zustand.eintraege = Demo.eintraege();
      geaendert();
      zustand.demoUnveraendert = true; speichern();
      zeigeSeite('plan');
      planChart.kreuz = null; planChart.zeigeZeit(9 * 60, false); renderKurve();
      toast('Beispieltag geladen');
    };
    if (nachfragen && zustand.eintraege.length) bestaetigen('Beispieltag laden?', 'Dein aktueller Tag wird ersetzt.', 'Laden', aktion);
    else aktion();
  }

  // ---------------- Installation ----------------
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installEvent = ev; if (seite === 'einstellungen') renderEinstellungen(); });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('GlukoSim wurde installiert'); if (seite === 'einstellungen') renderEinstellungen(); });
  async function installieren() {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch (e) { /* abgebrochen */ }
    installEvent = null; renderEinstellungen();
  }

  // ---------------- Onboarding ----------------
  const OB_KURVE = '<svg viewBox="0 0 320 150" preserveAspectRatio="none"><defs><linearGradient id="obg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB547"/><stop offset=".42" stop-color="#FFB547"/><stop offset=".5" stop-color="#5BD6B0"/><stop offset="1" stop-color="#5BD6B0"/></linearGradient></defs>' +
    '<rect x="0" y="62" width="320" height="58" fill="rgba(91,214,176,0.09)"/>' +
    '<path d="M0 104 C30 104 40 100 55 84 S80 48 95 60 115 98 140 100 165 96 180 70 200 22 215 36 240 96 265 100 300 98 320 100" fill="none" stroke="url(#obg)" stroke-width="10" stroke-linecap="round" opacity=".14"/>' +
    '<path d="M0 104 C30 104 40 100 55 84 S80 48 95 60 115 98 140 100 165 96 180 70 200 22 215 36 240 96 265 100 300 98 320 100" fill="none" stroke="url(#obg)" stroke-width="3.5" stroke-linecap="round"/></svg>';
  let obWahl = null;
  function zeigeOnboarding(schritt) {
    const ob = $('#onboarding'); ob.hidden = false;
    obWahl = obWahl || zustand.profil;
    const punkte = '<div class="ob-punkte">' + [0, 1, 2, 3].map(i => '<i class="' + (i === schritt ? 'an' : '') + '"></i>').join('') + '</div>';
    let inhalt = '', fuss = '';
    if (schritt === 0) {
      inhalt = '<div class="ob-titel">GlukoSim</div><div class="ob-kurve">' + OB_KURVE + '</div>' +
        '<p class="ob-text">Plane einen Tag mit Essen und Sport und sieh live, wie der Blutzucker darauf reagiert.</p>' +
        '<p class="ob-hinweis">Biologie-Schulprojekt. Vereinfachte Simulation, keine medizinische Beratung.</p>';
      fuss = '<button class="btn primaer" data-ob="weiter">Los geht’s</button>';
    } else if (schritt === 1) {
      inhalt = '<div class="ob-titel">Welcher Stoffwechsel?</div><p class="ob-text">Du kannst das jederzeit oben rechts ändern oder alle drei im Vergleich ansehen.</p>' +
        PROFILE_LISTE.map(p => '<button class="profil-karte" data-p="' + p + '" role="radio" aria-checked="' + (p === obWahl) + '"><span class="farbpunkt" style="background:' + GlukoSim.PROFILE[p].farbe + '"></span><span><b>' + PROFIL_INFO[p][0] + '</b><span>' + PROFIL_INFO[p][1] + '</span></span></button>').join('');
      fuss = '<button class="btn primaer" data-ob="weiter">Weiter</button>';
    } else if (schritt === 2) {
      inhalt = '<div class="ob-titel">So funktioniert’s</div><ul class="ob-liste">' +
        '<li><span class="ico">' + ico('plus') + '</span><div><b>Eintragen</b><span>Mahlzeit mit Grammangabe beschreiben. Die Nährwerte ermittelt Gemini oder die eingebaute Liste.</span></div></li>' +
        '<li><span class="ico">' + ico('pfeil') + '</span><div><b>Verschieben</b><span>Blöcke unter der Kurve ziehen. Die Kurve rechnet live mit.</span></div></li>' +
        '<li><span class="ico">' + ico('funke') + '</span><div><b>Verstehen</b><span>„Kurve erklären“ beschreibt die Biologie dahinter, „Tag optimieren“ zeigt Tipps mit Vorschau.</span></div></li></ul>';
      fuss = '<button class="btn primaer" data-ob="weiter">Weiter</button>';
    } else {
      inhalt = '<div class="ob-titel">Womit starten?</div><p class="ob-text">Der Beispieltag funktioniert auch ohne Internet und ohne API-Key, ideal zum Ausprobieren und Präsentieren.</p>' +
        '<p class="ob-text">Für eigene Mahlzeiten, Fotos und KI-Erklärungen kannst du später in den Einstellungen einen Gemini-API-Key eintragen.</p>';
      fuss = '<button class="btn tonal" data-ob="leer">Leer starten</button><button class="btn primaer" data-ob="demo">Beispieltag</button>';
    }
    ob.innerHTML = '<div class="ob-schritt">' + inhalt + '</div><div class="ob-fuss">' + punkte + fuss + '</div>';
    for (const b of $$('.profil-karte', ob)) b.onclick = () => { obWahl = b.dataset.p; for (const k of $$('.profil-karte', ob)) k.setAttribute('aria-checked', k === b); vib(6); };
    for (const b of $$('[data-ob]', ob)) b.onclick = () => {
      const a = b.dataset.ob;
      if (a === 'weiter') { zeigeOnboarding(schritt + 1); return; }
      zustand.onboarding = true; ob.hidden = true;
      if (obWahl) { zustand.profil = obWahl; }
      speichern(); renderPlan(); renderEinstellungen();
      if (a === 'demo') ladeDemo(false);
    };
  }

  // ---------------- Start ----------------
  function start() {
    planChart = new Verlauf($('#planChart'), { hoehe: 240, spuren: 2 });
    planChart.zoomIndex = zustand.zoom;
    planChart.onTap = () => renderReadout();
    planChart.onLayout = positioniereChips;
    vChart = new Verlauf($('#vChart'), { hoehe: 250, spuren: 0 });
    vChart.zoomIndex = zustand.vZoom;
    vChart.onTap = () => renderVergleich();

    $('#zoomEin').onclick = () => { planChart.setZoom(planChart.zoomIndex + 1, planChart.kreuz); zustand.zoom = planChart.zoomIndex; speichern(); };
    $('#zoomAus').onclick = () => { planChart.setZoom(planChart.zoomIndex - 1, planChart.kreuz); zustand.zoom = planChart.zoomIndex; speichern(); };
    $('#vZoomEin').onclick = () => { vChart.setZoom(vChart.zoomIndex + 1, vChart.kreuz); zustand.vZoom = vChart.zoomIndex; speichern(); renderVergleich(); };
    $('#vZoomAus').onclick = () => { vChart.setZoom(vChart.zoomIndex - 1, vChart.kreuz); zustand.vZoom = vChart.zoomIndex; speichern(); renderVergleich(); };
    $('#tInsulin').onclick = () => { zustand.insulinZeigen = !zustand.insulinZeigen; speichern(); renderKurve(); $('#tInsulin').setAttribute('aria-pressed', zustand.insulinZeigen); };
    $('#vInsulin').onclick = () => { zustand.vInsulinZeigen = !zustand.vInsulinZeigen; speichern(); renderVergleich(); };
    $('#vLegende').onclick = ev => { const b = ev.target.closest('[data-p]'); if (!b) return; zustand.vAus = zustand.vAus || {}; zustand.vAus[b.dataset.p] = !zustand.vAus[b.dataset.p]; speichern(); renderVergleich(); };
    $('#btnErklaeren').onclick = erklaeren;
    $('#btnOptimieren').onclick = optimieren;
    $('#btnVergleichErklaeren').onclick = vergleichErklaeren;
    $('#btnAutoInsulin').onclick = () => { zustand.eintraege = zustand.eintraege.concat(Optimierer.autoInsulin(zustand.eintraege)); geaendert(); toast('Insulin nach Faustregel eingetragen'); };
    $('#profilChip').onclick = profilSheet;
    $('#fab').onclick = () => seite === 'essen' ? mahlzeitSheet(null, null, 'vorlage') : oeffneNeu();
    $('#nav').onclick = ev => { const b = ev.target.closest('button'); if (b) zeigeSeite(b.dataset.ziel); };
    $('#eintragListe').onclick = ev => {
      if (ev.target.closest('[data-aktion="demo"]')) { ladeDemo(false); return; }
      const li = ev.target.closest('.eintrag'); if (!li) return;
      const e = zustand.eintraege.find(x => x.id === li.dataset.id); if (e) oeffneEintrag(e);
    };
    $('#vorlagenListe').onclick = ev => { const li = ev.target.closest('.eintrag'); if (!li) return; const v = zustand.vorlagen.find(x => x.id === li.dataset.id); if (v) vorlageSheet(v); };
    for (const ul of [$('#eintragListe'), $('#vorlagenListe')]) ul.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('eintrag')) { ev.preventDefault(); ev.target.click(); } });
    bindeEinstellungen();

    history.replaceState({ seite: 'plan' }, '');
    zeigeSeite('plan', true);
    renderPlan();
    requestAnimationFrame(() => planChart.zeigeZeit(zustand.eintraege.length ? Math.max(360, st.maxT) : 720, false));
    if (!zustand.onboarding) zeigeOnboarding(0);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline-Funktion nicht verfügbar */ });
    }
    document.fonts && document.fonts.ready.then(() => { planChart.zeichne(); vChart.zeichne(); });
  }

  start();
})();
