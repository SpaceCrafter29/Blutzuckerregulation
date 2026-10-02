/* Optimierer (läuft lokal, ohne KI) + Texte für Erklärungen */
(function (root) {
  'use strict';
  const S = root.GlukoSim;
  const hhmm = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(Math.round(((m % 60) + 60) % 60)).padStart(2, '0');
  const klon = x => JSON.parse(JSON.stringify(x));
  const neueId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const titel = e => e.typ === 'essen' ? (e.name || 'Mahlzeit') : e.typ === 'sport' ? (e.art || 'Sport') : (e.einheiten + ' IE ' + (e.art === 'lang' ? 'Langzeitinsulin' : 'schnelles Insulin'));

  // ---------- Typ 1: Standard-Therapie vorschlagen ----------
  function autoInsulin(eintraege) {
    const neu = [];
    if (!eintraege.some(e => e.typ === 'insulin' && e.art === 'lang'))
      neu.push({ id: neueId(), typ: 'insulin', art: 'lang', einheiten: 16, zeit: 22 * 60, auto: true });
    for (const e of eintraege.filter(x => x.typ === 'essen' && x.summe && x.summe.kh >= 8)) {
      const hat = eintraege.some(i => i.typ === 'insulin' && i.art !== 'lang' && i.zeit >= e.zeit - 45 && i.zeit <= e.zeit + 20);
      if (!hat) neu.push({ id: neueId(), typ: 'insulin', art: 'schnell', einheiten: Math.max(1, Math.round(e.summe.kh / 10)), zeit: Math.max(0, e.zeit - 15), auto: true });
    }
    return neu;
  }

  // ---------- Realistische Essenszeiten ----------
  // Art der Mahlzeit aus dem Namen, sonst aus der Uhrzeit
  function mahlzeitArt(e) {
    const n = (e.name || '').toLowerCase();
    if (/frühstück|fruehstueck|morgen|breakfast/.test(n)) return 'fruehstueck';
    if (/mittag|lunch|mensa/.test(n)) return 'mittag';
    if (/abend|dinner|nacht/.test(n)) return 'abend';
    if (/snack|pause|zwischen|nachmittag|kaffee|süß|cola|schok/.test(n)) return 'snack';
    const t = e.zeit;
    return t < 630 ? 'fruehstueck' : t >= 690 && t <= 870 ? 'mittag' : t >= 1050 ? 'abend' : 'snack';
  }
  const FENSTER = {
    fruehstueck: { von: 330, bis: 630, maxVerschiebung: 60 },   // 05:30–10:30
    mittag: { von: 660, bis: 870, maxVerschiebung: 60 },        // 11:00–14:30
    abend: { von: 1050, bis: 1290, maxVerschiebung: 60 },       // 17:30–21:30
    snack: { von: 360, bis: 1290, maxVerschiebung: 90 }         // 06:00–21:30
  };
  function zeitfenster(e) { return FENSTER[mahlzeitArt(e)]; }
  // Hauptmahlzeiten behalten ihre Reihenfolge (Frühstück < Mittag < Abend)
  const RANG = { fruehstueck: 0, mittag: 1, abend: 2 };
  function reihenfolgeOk(essen, e, t) {
    const r = RANG[mahlzeitArt(e)];
    if (r == null) return true;
    return essen.every(x => {
      if (x.id === e.id) return true;
      const rx = RANG[mahlzeitArt(x)];
      if (rx == null) return true;
      return rx < r ? x.zeit < t - 120 : rx > r ? x.zeit > t + 120 : true; // mind. 2 h Abstand zur nächsten Hauptmahlzeit
    });
  }

  // ---------- Vorschläge ----------
  function bewerte(plan, profil, opt) {
    const sim = S.simuliere(plan, profil, opt);
    return { sim, score: S.bewertung(sim, profil), st: S.statistik(sim, profil) };
  }

  function vorschlaege(eintraege, profil, opt) {
    const basis = bewerte(eintraege, profil, opt);
    const essen = eintraege.filter(e => e.typ === 'essen' && e.summe);
    const sport = eintraege.filter(e => e.typ === 'sport');
    const kand = [];
    const plus = (typ, ziel, titelText, text, plan) => kand.push({ typ, ziel, titel: titelText, text, plan });

    // 1) Mahlzeiten verschieben – nur in realistischen Zeitfenstern
    for (const e of essen) {
      if (e.summe.kh < 10) continue;
      const f = zeitfenster(e);
      for (const d of [-90, -60, -30, 30, 60, 90]) {
        const t = e.zeit + d;
        if (Math.abs(d) > f.maxVerschiebung || t < f.von || t > f.bis) continue;
        if (!reihenfolgeOk(essen, e, t)) continue;
        const plan = klon(eintraege); plan.find(x => x.id === e.id).zeit = t;
        const vorSport = sport.find(s => t <= s.zeit && s.zeit - t <= 90);
        const nachbar = essen.find(x => x.id !== e.id && Math.abs(x.zeit - e.zeit) < 150);
        const text = vorSport
          ? 'Dann arbeiten die Muskeln beim ' + vorSport.art + ' genau, wenn die Glukose aus dieser Mahlzeit ins Blut kommt.'
          : nachbar && Math.abs(nachbar.zeit - t) > Math.abs(nachbar.zeit - e.zeit)
            ? 'Mit mehr Abstand zu „' + titel(nachbar) + '“ überlagern sich die beiden Blutzuckeranstiege nicht mehr.'
            : 'Zu diesem Zeitpunkt addiert sich der Anstieg weniger mit anderen Einflüssen des Tages.';
        plus('verschieben', e.id, '„' + titel(e) + '“ auf ' + hhmm(t) + ' verschieben', text, plan);
      }
    }
    // 2) Spaziergang nach dem Essen
    for (const e of essen) {
      if (e.summe.kh < 20) continue;
      if (sport.some(s => s.zeit >= e.zeit && s.zeit - e.zeit <= 60)) continue;
      if (e.zeit + 15 > 1290) continue; // nicht mitten in der Nacht spazieren
      const plan = klon(eintraege);
      plan.push({ id: neueId(), typ: 'sport', art: 'Spazieren', dauer: 20, intensitaet: 'leicht', zeit: Math.min(1400, e.zeit + 15) });
      plus('spaziergang', e.id, 'Nach „' + titel(e) + '“ 20 Minuten spazieren',
        'Arbeitende Muskeln holen sich Glukose über GLUT4-Transporter aus dem Blut, auch ohne Insulin. Das dämpft die Spitze.', plan);
    }
    // 3) Sport nach eine Mahlzeit legen
    for (const s of sport) for (const e of essen) {
      if (e.summe.kh < 20) continue;
      const t = e.zeit + 30;
      // Sport nur um max. 2 h verlegen und nicht vor 6 Uhr bzw. nach 21:30 beginnen
      if (Math.abs(t - s.zeit) < 20 || Math.abs(t - s.zeit) > 120 || t < 360 || t + (s.dauer || 30) > 1290) continue;
      const plan = klon(eintraege); plan.find(x => x.id === s.id).zeit = t;
      plus('sport', s.id, '„' + titel(s) + '“ auf ' + hhmm(t) + ' legen (nach „' + titel(e) + '“)',
        'Kurz nach dem Essen verbrauchen die Muskeln die frisch aufgenommene Glukose, statt dass sie den Blutzucker hochtreibt.', plan);
    }
    // 4) Typ 1: Insulin
    if (profil === 'typ1') {
      const schnell = eintraege.filter(e => e.typ === 'insulin' && e.art !== 'lang');
      if (!eintraege.some(e => e.typ === 'insulin' && e.art === 'lang')) {
        const plan = klon(eintraege); plan.push({ id: neueId(), typ: 'insulin', art: 'lang', einheiten: 16, zeit: 1320 });
        plus('insulin', 'basal', 'Langzeitinsulin spritzen (16 IE um 22:00)',
          'Langzeitinsulin ersetzt die ständige Grundausschüttung der Beta-Zellen und bremst die Zuckerabgabe der Leber.', plan);
      }
      for (const e of essen) {
        if (e.summe.kh < 10) continue;
        const bol = schnell.find(i => i.zeit >= e.zeit - 45 && i.zeit <= e.zeit + 20);
        if (!bol) {
          const ie = Math.max(1, Math.round(e.summe.kh / 10));
          const plan = klon(eintraege); plan.push({ id: neueId(), typ: 'insulin', art: 'schnell', einheiten: ie, zeit: Math.max(0, e.zeit - 15) });
          plus('insulin', e.id, ie + ' IE Insulin für „' + titel(e) + '“ spritzen',
            'Ohne eigenes Insulin bleibt die Glukose im Blut. Das gespritzte Insulin übernimmt die Aufgabe der Beta-Zellen.', plan);
        } else {
          for (const d of [-1, 1, 2]) {
            const ie = bol.einheiten + d;
            if (ie < 1) continue;
            const plan = klon(eintraege); plan.find(x => x.id === bol.id).einheiten = ie;
            plus('dosis', bol.id, 'Insulin zu „' + titel(e) + '“ auf ' + ie + ' IE ' + (d < 0 ? 'senken' : 'erhöhen'),
              d < 0 ? 'Etwas weniger Insulin verhindert, dass der Blutzucker danach zu tief fällt.' : 'Mehr Insulin bringt mehr Glukose aus dieser Mahlzeit in Muskel- und Fettzellen.', plan);
          }
          if (bol.zeit > e.zeit - 15) {
            const plan = klon(eintraege); plan.find(x => x.id === bol.id).zeit = e.zeit - 20;
            plus('dosis', bol.id + 'z', 'Insulin 20 Minuten vor „' + titel(e) + '“ spritzen',
              'Gespritztes Insulin braucht Zeit bis es wirkt. Mit Vorlauf trifft es auf die ankommende Glukose.', plan);
          }
        }
      }
      for (const s of sport) {
        const plan = klon(eintraege);
        plan.push({ id: neueId(), typ: 'essen', name: 'Traubenzucker', zeit: Math.max(0, s.zeit - 10),
          zutaten: [{ name: 'Traubenzucker', gramm: 16, kh: 14.6, zucker: 14.6, ballaststoffe: 0, fett: 0, protein: 0, kcal: 59, gi: 100 }],
          summe: { kh: 14.6, zucker: 14.6, ballaststoffe: 0, fett: 0, protein: 0, kcal: 59, gi: 100, gl: 14.6, gramm: 16 } });
        plus('snack', s.id, 'Vor „' + titel(s) + '“ 15 g Traubenzucker essen',
          'Beim Sport nehmen die Muskeln viel Glukose auf. Bei Typ 1 lässt sich gespritztes Insulin nicht drosseln, deshalb droht Unterzucker.', plan);
      }
    }

    // bewerten
    const ergebnisse = [];
    for (const k of kand) {
      const r = bewerte(k.plan, profil, opt);
      const effekt = {
        score: basis.score - r.score,
        spitze: r.st.max - basis.st.max,
        ueber: r.st.ueberMin - basis.st.ueberMin,
        unter: r.st.unterMin - basis.st.unterMin,
        ziel: r.st.zielProzent - basis.st.zielProzent
      };
      ergebnisse.push(Object.assign(k, { effekt, sim: r.sim }));
    }
    const schwelle = Math.max(1, basis.score * 0.03);
    const spuerbar = ef => ef.spitze <= -5 || ef.ueber <= -10 || ef.unter < 0 || ef.ziel >= 2;
    const nichtsSchlechter = ef => ef.spitze <= 0 && ef.ueber <= 0 && ef.unter <= 0;
    const gut = ergebnisse.filter(r => r.effekt.score > schwelle && nichtsSchlechter(r.effekt) && spuerbar(r.effekt));
    gut.sort((a, b) => b.effekt.score - a.effekt.score);
    const genutzt = new Set(), res = [];
    for (const r of gut) {
      const schluessel = r.ziel + '|' + (r.typ === 'verschieben' || r.typ === 'sport' ? 'zeit' : r.typ);
      if (genutzt.has(r.ziel) || genutzt.has(schluessel)) continue;
      genutzt.add(r.ziel); genutzt.add(schluessel);
      res.push({ id: neueId(), quelle: 'modell', titel: r.titel, text: r.text, effekt: r.effekt, plan: r.plan, sim: r.sim });
      if (res.length >= 3) break;
    }
    return { basis, vorschlaege: res };
  }

  function effektText(ef) {
    const t = [];
    if (ef.danach) t.push('Nach „' + ef.nachName + '“ ' + (ef.danach > 0 ? '+' : '−') + Math.abs(ef.danach) + ' mg/dl');
    if (ef.spitze) t.push('Tagesspitze ' + (ef.spitze > 0 ? '+' : '−') + Math.abs(ef.spitze) + ' mg/dl');
    if (ef.ueber) t.push((ef.ueber < 0 ? '−' : '+') + Math.abs(ef.ueber) + ' min zu hoch');
    if (ef.unter) t.push((ef.unter < 0 ? '−' : '+') + Math.abs(ef.unter) + ' min Unterzucker');
    return t;
  }

  // ---------- Texte ----------
  const PROFIL_TEXT = {
    gesund: 'Gesunder Stoffwechsel: Die Beta-Zellen der Bauchspeicheldrüse schütten automatisch passend Insulin aus.',
    typ1: 'Diabetes Typ 1: Die Beta-Zellen sind durch eine Autoimmunreaktion zerstört, es wird kein eigenes Insulin gebildet. Insulin muss gespritzt werden.',
    typ2: 'Diabetes Typ 2: Insulin wird gebildet, wirkt aber schwächer (Insulinresistenz). Die Ausschüttung ist verzögert und begrenzt.'
  };

  function mahlzeitVor(eintraege, t) {
    return eintraege.filter(e => e.typ === 'essen' && e.summe && e.zeit <= t && t - e.zeit <= 200)
      .sort((a, b) => b.summe.gl / (1 + (t - b.zeit) / 90) - a.summe.gl / (1 + (t - a.zeit) / 90))[0];
  }

  function erstesUnter(sim, grenze) { for (let t = 0; t < sim.G.length; t++) if (sim.G[t] < grenze) return t; return -1; }

  function lokaleErklaerung(eintraege, profil, sim, st) {
    const abs = [];
    const insulin = eintraege.filter(e => e.typ === 'insulin');
    if (profil === 'gesund') {
      abs.push('Bei einem **gesunden Stoffwechsel** messen die **Beta-Zellen** der Bauchspeicheldrüse den Blutzucker ständig. Steigt er, schütten sie sofort **Insulin** aus (hier bis ' + st.insulinMax + ' µU/ml). Muskel- und Fettzellen nehmen dann Glukose auf, die **Leber** speichert sie als **Glykogen**. Deshalb bleibt die Kurve zwischen ' + st.min + ' und ' + st.max + ' mg/dl.');
    } else if (profil === 'typ1') {
      if (!insulin.length) abs.push('Bei **Typ 1** bildet die Bauchspeicheldrüse kein Insulin. Ohne gespritztes Insulin kann die Glukose nicht in die Zellen, und die **Leber** gibt zusätzlich Zucker ab. Der Blutzucker bleibt deshalb den ganzen Tag hoch (Ø ' + st.mittel + ' mg/dl). Nur die **Niere** scheidet ab etwa 180 mg/dl Zucker mit dem Urin aus.');
      else abs.push('Bei **Typ 1** fehlen die **Beta-Zellen**. Das gespritzte **Langzeitinsulin** ersetzt die Grundausschüttung, das **schnelle Insulin** fängt die Mahlzeiten ab. Weil es unter die Haut gespritzt wird, wirkt es verzögert und lässt sich nicht automatisch an den Blutzucker anpassen.');
    } else {
      abs.push('Bei **Typ 2** reagieren die Zellen schwächer auf Insulin (**Insulinresistenz**). Die Bauchspeicheldrüse schüttet deshalb mehr Insulin aus (bis ' + st.insulinMax + ' µU/ml), trotzdem ist schon der Nüchternwert erhöht (' + Math.round(sim.G[0]) + ' mg/dl) und der Blutzucker sinkt nach dem Essen nur langsam.');
    }
    const m = mahlzeitVor(eintraege, st.maxT);
    if (m) {
      let s = 'Die höchste Spitze (' + st.max + ' mg/dl um ' + hhmm(st.maxT) + ') kommt von „' + titel(m) + '“ mit ' + Math.round(m.summe.kh) + ' g Kohlenhydraten und einem **glykämischen Index** von ' + m.summe.gi + '.';
      if (m.summe.gi >= 65) s += ' Ein hoher GI heißt: Die Stärke bzw. der Zucker wird im Darm schnell zu Glukose und gelangt rasch ins Blut.';
      else if (m.summe.fett + m.summe.ballaststoffe > 20) s += ' Fett und Ballaststoffe verlangsamen die Magenentleerung, deshalb steigt die Kurve eher flach an.';
      if (profil === 'typ1' && !insulin.some(i => i.art !== 'lang' && i.zeit >= m.zeit - 45 && i.zeit <= m.zeit + 20)) s += ' Für diese Mahlzeit wurde kein Insulin gespritzt.';
      abs.push(s);
    }
    const sp = eintraege.filter(e => e.typ === 'sport').sort((a, b) => a.zeit - b.zeit)[0];
    if (sp) {
      const vor = sim.G[sp.zeit], nach = sim.G[Math.min(1440, sp.zeit + sp.dauer)];
      let s = 'Beim ' + sp.art + ' um ' + hhmm(sp.zeit) + ' sinkt der Blutzucker von ' + Math.round(vor) + ' auf ' + Math.round(nach) + ' mg/dl: Arbeitende Muskeln bauen **GLUT4**-Transporter in die Zellmembran ein und nehmen Glukose auch ohne Insulin auf.';
      if (profil === 'gesund') s += ' Gleichzeitig sinkt die Insulinausschüttung und die Leber gibt Glukose ab, damit es keinen Unterzucker gibt.';
      if (profil === 'typ1') s += ' Das gespritzte Insulin wirkt dabei weiter, deshalb ist das Unterzucker-Risiko bei Typ 1 höher.';
      abs.push(s);
    }
    if (st.unterMin > 0) {
      const t = erstesUnter(sim, 70);
      abs.push('Ab ' + hhmm(t) + ' liegt der Wert unter 70 mg/dl (**Unterzucker**, insgesamt ' + st.unterMin + ' min). Das Gegenhormon **Glukagon** lässt die Leber Glykogen abbauen' + (profil === 'typ1' ? ', wirkt bei Typ 1 aber oft zu schwach.' : '.'));
    }
    return abs.join('\n\n');
  }

  function lokalerVergleich(ergebnisse) {
    const g = ergebnisse.gesund.st, t1 = ergebnisse.typ1.st, t2 = ergebnisse.typ2.st;
    return [
      '**Gesund:** Die Kurve bleibt flach (Spitze ' + g.max + ' mg/dl), weil die **Beta-Zellen** schnell und genau so viel Insulin ausschütten wie nötig.',
      '**Typ 1:** ' + (ergebnisse.typ1.autoInsulin ? 'Mit der Standard-Therapie aus gespritztem Insulin' : 'Mit dem eingetragenen Insulin') + ' erreicht die Kurve ' + t1.max + ' mg/dl. Gespritztes Insulin wirkt verzögert und reagiert nicht selbst auf den Blutzucker, deshalb schwankt die Kurve stärker' + (t1.unterMin ? ' und rutscht zeitweise in den Unterzucker.' : '.'),
      '**Typ 2:** Schon nüchtern erhöht, Spitze ' + t2.max + ' mg/dl und nur ' + t2.zielProzent + ' % der Zeit im Zielbereich. Die **Insulinresistenz** zwingt die Bauchspeicheldrüse zu mehr Insulin (bis ' + t2.insulinMax + ' statt ' + g.insulinMax + ' µU/ml), trotzdem wird die Glukose langsamer aus dem Blut geholt.',
      'Fazit: Derselbe Tag wirkt je nach Stoffwechsel völlig unterschiedlich, entscheidend ist, wie viel Insulin wann wirkt.'
    ].join('\n\n');
  }

  function stuendlich(sim) { const a = []; for (let h = 0; h <= 24; h++) a.push(h + 'h:' + Math.round(sim.G[Math.min(1440, h * 60)])); return a.join(', '); }

  function planText(eintraege, profil) {
    return eintraege.slice().sort((a, b) => a.zeit - b.zeit).map(e => {
      if (e.typ === 'essen') return '- ' + hhmm(e.zeit) + ' Mahlzeit „' + titel(e) + '“ (id ' + e.id + '): ' +
        (e.zutaten || []).map(z => z.name + ' ' + z.gramm + ' g').join(', ') + '; gesamt ' + e.summe.kh + ' g KH, Zucker ' + e.summe.zucker + ' g, GI ' + e.summe.gi +
        ', Fett ' + e.summe.fett + ' g, Eiweiß ' + e.summe.protein + ' g, Ballaststoffe ' + e.summe.ballaststoffe + ' g';
      if (e.typ === 'sport') return '- ' + hhmm(e.zeit) + ' Sport: ' + e.art + ', ' + e.dauer + ' min, Intensität ' + e.intensitaet;
      if (profil !== 'typ1') return null;
      return '- ' + hhmm(e.zeit) + ' Insulin ' + (e.art === 'lang' ? 'lang wirkend' : 'schnell wirkend') + ': ' + e.einheiten + ' IE';
    }).filter(Boolean).join('\n');
  }

  function zusammenfassung(eintraege, profil, sim, st) {
    const sp = S.spitzen(sim, 15).map(p => hhmm(p.t) + ' ' + p.wert + ' mg/dl (+' + p.anstieg + ')').join('; ');
    return [
      'Profil: ' + PROFIL_TEXT[profil],
      'Tagesablauf:', planText(eintraege, profil) || '- (keine Einträge)',
      'Simulationsergebnis (vereinfachtes Modell):',
      '- Wert um 0:00: ' + Math.round(sim.G[0]) + ' mg/dl; Zielbereich ' + st.ziel[0] + '–' + st.ziel[1] + ' mg/dl',
      '- Höchster Wert ' + st.max + ' mg/dl um ' + hhmm(st.maxT) + '; tiefster ' + st.min + ' mg/dl um ' + hhmm(st.minT) + '; Durchschnitt ' + st.mittel,
      '- Deutliche Anstiege: ' + (sp || 'keine'),
      '- Zeit im Zielbereich ' + st.zielProzent + ' %, über dem Ziel ' + st.ueberMin + ' min, unter 70 mg/dl ' + st.unterMin + ' min',
      '- Insulin im Blut: maximal ' + st.insulinMax + ' µU/ml um ' + hhmm(st.insulinMaxT) + ' (gesund nüchtern ca. 10)',
      '- Blutzucker stündlich: ' + stuendlich(sim)
    ].join('\n');
  }

  function vergleichZusammenfassung(eintraege, ergebnisse) {
    const z = ['Derselbe Tagesablauf für drei Stoffwechsel-Profile:', planText(eintraege, 'gesund') || '- (keine Einträge)'];
    for (const p of ['gesund', 'typ1', 'typ2']) {
      const r = ergebnisse[p], st = r.st;
      z.push('', PROFIL_TEXT[p] + (p === 'typ1' ? (r.autoInsulin ? ' (Simulation mit Standard-Insulintherapie: Langzeitinsulin + 1 IE pro 10 g KH)' : ' (mit dem eingetragenen Insulin)') : ''),
        '- Höchster Wert ' + st.max + ' mg/dl um ' + hhmm(st.maxT) + ', tiefster ' + st.min + ', Durchschnitt ' + st.mittel + ', im Zielbereich ' + st.zielProzent + ' %, Unterzucker ' + st.unterMin + ' min, Insulin max ' + st.insulinMax + ' µU/ml',
        '- stündlich: ' + stuendlich(r.sim));
    }
    return z.join('\n');
  }

  root.Optimierer = { vorschlaege, effektText, autoInsulin, neueId, klon, titel, hhmm };
  root.Texte = { lokaleErklaerung, lokalerVergleich, zusammenfassung, vergleichZusammenfassung, planText, PROFIL_TEXT };
})(window);
