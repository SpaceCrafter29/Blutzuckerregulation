/* KI – Gemini API direkt aus dem Browser, mit Cache in localStorage */
(function (root) {
  'use strict';
  const CACHE_KEY = 'glukosim-ki-cache';
  const MAX_CACHE = 80;
  const ERSATZ_MODELLE = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash'];

  function hash(s) { // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  function ladeCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; } }
  function speichereCache(c) {
    const keys = Object.keys(c);
    if (keys.length > MAX_CACHE) keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - MAX_CACHE).forEach(k => delete c[k]);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* voll */ }
  }

  function parseJSON(text) {
    let t = String(text || '').replace(/```(?:json)?/gi, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    const a2 = t.indexOf('['), b2 = t.lastIndexOf(']');
    if (a2 !== -1 && (a === -1 || a2 < a)) t = t.slice(a2, b2 + 1);
    else if (a !== -1) t = t.slice(a, b + 1);
    return JSON.parse(t);
  }

  class KIFehler extends Error {
    constructor(msg, art) { super(msg); this.art = art; }
  }

  async function einmal(modell, key, body) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modell) + ':generateContent';
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    } catch (e) {
      throw new KIFehler('Keine Verbindung zur Gemini API. Prüfe das Internet.', 'netz');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = (data.error && data.error.message) || ('HTTP ' + res.status);
      if (res.status === 404) throw new KIFehler('Modell „' + modell + '“ nicht gefunden.', 'modell');
      if (res.status === 400 && /api key/i.test(m)) throw new KIFehler('Der API-Key ist ungültig. Prüfe ihn in den Einstellungen.', 'key');
      if (res.status === 403) throw new KIFehler('Zugriff verweigert. Prüfe den API-Key in den Einstellungen.', 'key');
      if (res.status === 429) throw new KIFehler('Zu viele Anfragen. Warte kurz und versuche es erneut.', 'limit');
      throw new KIFehler('Gemini-Fehler: ' + m, 'api');
    }
    const kand = data.candidates && data.candidates[0];
    const text = kand && kand.content && (kand.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
    if (!text) throw new KIFehler('Gemini hat keine Antwort geliefert. Versuche es erneut.', 'leer');
    return text;
  }

  /** anfrage({prompt, system, json, bild:{mime, data}}) -> Text */
  async function anfrage(cfg, einst) {
    const key = (einst.apiKey || '').trim();
    if (!key) throw new KIFehler('Kein Gemini-API-Key hinterlegt. Trage ihn in den Einstellungen ein.', 'kein-key');
    const modell = (einst.modell || ERSATZ_MODELLE[0]).trim();
    const cacheId = hash(modell + '|' + (cfg.system || '') + '|' + cfg.prompt + '|' + (cfg.bild ? cfg.bild.data.length + cfg.bild.data.slice(-300) : ''));
    const cache = ladeCache();
    if (cache[cacheId]) return cache[cacheId].v;

    const parts = [{ text: cfg.prompt }];
    if (cfg.bild) parts.push({ inline_data: { mime_type: cfg.bild.mime, data: cfg.bild.data } });
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: Object.assign({ temperature: cfg.temperatur != null ? cfg.temperatur : 0.3 },
        cfg.json ? { responseMimeType: 'application/json' } : {})
    };
    if (cfg.system) body.systemInstruction = { parts: [{ text: cfg.system }] };

    const liste = [modell].concat(ERSATZ_MODELLE.filter(m => m !== modell));
    let letzter;
    for (const m of liste) {
      try {
        const text = await einmal(m, key, body);
        cache[cacheId] = { v: text, t: Date.now() };
        speichereCache(cache);
        return text;
      } catch (e) {
        letzter = e;
        if (e.art !== 'modell') throw e;
      }
    }
    throw letzter;
  }

  const r1 = x => Math.round((Number(x) || 0) * 10) / 10;
  function saeubereZutaten(arr) {
    return (arr || []).map(z => ({
      name: String(z.name || 'Zutat').slice(0, 60),
      gramm: Math.max(0, Math.round(Number(z.gramm) || 0)),
      kh: r1(z.kh), zucker: r1(z.zucker), ballaststoffe: r1(z.ballaststoffe),
      fett: r1(z.fett), protein: r1(z.protein), kcal: Math.round(Number(z.kcal) || 0),
      gi: Math.max(0, Math.min(110, Math.round(Number(z.gi) || 0)))
    })).filter(z => z.gramm > 0 || z.kh > 0);
  }

  const NAEHRWERT_SYSTEM = 'Du bist eine präzise Nährwertdatenbank für deutsche Lebensmittel. Antworte ausschließlich mit gültigem JSON.';
  const NAEHRWERT_SCHEMA = '{"name":"kurzer Name der Mahlzeit","zutaten":[{"name":"Zutat","gramm":0,"kh":0,"zucker":0,"ballaststoffe":0,"fett":0,"protein":0,"kcal":0,"gi":0}]}';
  const NAEHRWERT_REGELN = [
    'Regeln:',
    '- Übernimm die Grammangaben des Nutzers. Nur wenn keine Menge genannt ist, schätze eine übliche Portion.',
    '- Alle Nährwerte gelten FÜR DIESE MENGE, nicht pro 100 g.',
    '- kh = verwertbare Kohlenhydrate (ohne Ballaststoffe), alles in Gramm.',
    '- gi = glykämischer Index der Zutat (Glukose = 100), 0 bei Zutaten ohne Kohlenhydrate.',
    '- Flüssigkeiten: 1 ml = 1 g.',
    'Antworte NUR mit JSON in genau diesem Format: ' + NAEHRWERT_SCHEMA
  ].join('\n');

  async function naehrwerte(text, einst) {
    const antwort = await anfrage({
      system: NAEHRWERT_SYSTEM, json: true, temperatur: 0.1,
      prompt: 'Analysiere diese Mahlzeit:\n' + text + '\n\n' + NAEHRWERT_REGELN
    }, einst);
    const j = parseJSON(antwort);
    const zutaten = saeubereZutaten(j.zutaten);
    if (!zutaten.length) throw new KIFehler('Gemini konnte keine Lebensmittel erkennen. Formuliere genauer, z. B. „Reis 200 g“.', 'leer');
    return { name: String(j.name || '').slice(0, 40), zutaten };
  }

  async function naehrwerteBild(bild, zusatz, einst) {
    const antwort = await anfrage({
      system: NAEHRWERT_SYSTEM, json: true, temperatur: 0.2, bild,
      prompt: 'Erkenne alle Lebensmittel auf dem Foto und schätze die Menge jeder Zutat in Gramm anhand von Tellergröße und Portion.' +
        (zusatz ? '\nHinweis des Nutzers: ' + zusatz : '') + '\n\n' + NAEHRWERT_REGELN
    }, einst);
    const j = parseJSON(antwort);
    const zutaten = saeubereZutaten(j.zutaten);
    if (!zutaten.length) throw new KIFehler('Auf dem Foto wurde kein Essen erkannt.', 'leer');
    return { name: String(j.name || '').slice(0, 40), zutaten };
  }

  const ERKLAER_SYSTEM = 'Du bist Biologielehrer und erklärst Schülerinnen und Schülern (Klasse 9–12) den Blutzuckerstoffwechsel. ' +
    'Du schreibst klar, anschaulich und fachlich korrekt auf Deutsch. Du gibst keine medizinischen Therapieempfehlungen.';

  async function erklaere(zusammenfassung, einst) {
    return anfrage({
      system: ERKLAER_SYSTEM, temperatur: 0.4,
      prompt: zusammenfassung + '\n\nAufgabe: Erkläre in 120–180 Wörtern, warum die Blutzuckerkurve so verläuft. ' +
        'Gehe auf 2–3 auffällige Stellen mit Uhrzeit ein und nenne die passenden biologischen Mechanismen ' +
        '(z. B. Beta-Zellen, Insulin, Glukagon, Leber und Glykogen, GLUT4 im Muskel, Insulinresistenz, Niere). ' +
        'Keine Einleitung, keine Überschrift. Kurze Absätze. Markiere Fachbegriffe mit **fett**.'
    }, einst);
  }

  async function vergleicheErklaeren(zusammenfassung, einst) {
    return anfrage({
      system: ERKLAER_SYSTEM, temperatur: 0.4,
      prompt: zusammenfassung + '\n\nAufgabe: Vergleiche die drei Kurven in 150–200 Wörtern. Erkläre, warum sich Gesund, Typ 1 und Typ 2 ' +
        'bei demselben Tagesablauf so unterscheiden (Ursache der jeweiligen Stoffwechsellage, Insulinspiegel, Höhe und Dauer der Spitzen). ' +
        'Keine Einleitung, keine Überschrift. Ein kurzer Absatz pro Profil und ein Fazit-Satz. Fachbegriffe **fett**.'
    }, einst);
  }

  async function tauschVorschlaege(beschreibung, einst) {
    const antwort = await anfrage({
      system: NAEHRWERT_SYSTEM, json: true, temperatur: 0.4,
      prompt: 'Tagesplan:\n' + beschreibung + '\n\nSchlage bis zu 2 alltagstaugliche Zutaten-Tausche vor, die den Blutzuckeranstieg senken ' +
        '(niedrigerer GI, mehr Ballaststoffe/Eiweiß, weniger Zucker), bei ähnlicher Sättigung. Wähle die Mahlzeiten mit dem größten Effekt.\n' +
        'Gib für die neue Mahlzeit ALLE Zutaten mit Nährwerten für die jeweilige Menge an.\n' +
        'Antworte NUR mit JSON: {"vorschlaege":[{"eintragId":"id aus dem Plan","titel":"max. 6 Wörter","text":"1 Satz Begründung mit Biologie",' +
        '"mahlzeit":' + NAEHRWERT_SCHEMA + '}]}'
    }, einst);
    const j = parseJSON(antwort);
    return (j.vorschlaege || []).map(v => ({
      eintragId: String(v.eintragId || ''), titel: String(v.titel || 'Zutat tauschen'), text: String(v.text || ''),
      mahlzeit: { name: String((v.mahlzeit && v.mahlzeit.name) || ''), zutaten: saeubereZutaten(v.mahlzeit && v.mahlzeit.zutaten) }
    })).filter(v => v.eintragId && v.mahlzeit.zutaten.length);
  }

  async function testen(einst) {
    const cfgEinst = Object.assign({}, einst);
    const t = await anfrage({ prompt: 'Antworte nur mit dem Wort OK. (' + Date.now() + ')', temperatur: 0 }, cfgEinst);
    return t.trim();
  }

  function cacheLeeren() { localStorage.removeItem(CACHE_KEY); }

  root.KI = { anfrage, naehrwerte, naehrwerteBild, erklaere, vergleicheErklaeren, tauschVorschlaege, testen, parseJSON, cacheLeeren, KIFehler };
})(window);
