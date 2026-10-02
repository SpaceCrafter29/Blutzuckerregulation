/* Kleine Offline-Datenbank (Werte pro 100 g, gerundete Richtwerte).
 * Wird genutzt, wenn kein Gemini-API-Key hinterlegt ist oder keine Verbindung besteht.
 * kh = verwertbare Kohlenhydrate, bs = Ballaststoffe, gi = glykämischer Index */
(function (root) {
  'use strict';
  // [Name, [Suchbegriffe], kh, zucker, bs, fett, protein, kcal, gi]
  const ROH = [
    ['Haferflocken', ['haferflocken', 'hafer', 'porridge', 'oats'], 58.7, 0.7, 10, 7, 13.5, 370, 55],
    ['Müsli', ['müsli', 'muesli', 'granola', 'knuspermüsli'], 60, 20, 8, 8, 9, 370, 57],
    ['Cornflakes', ['cornflakes', 'flakes', 'frühstücksflocken'], 83, 8, 3, 0.9, 7, 375, 81],
    ['Vollkornbrot', ['vollkornbrot', 'schwarzbrot', 'roggenbrot', 'vollkorn'], 39, 3, 7.5, 1.5, 7, 215, 55],
    ['Brot', ['brot', 'mischbrot', 'graubrot'], 45, 2.5, 5, 1.3, 7.5, 235, 65],
    ['Toastbrot', ['toast', 'weißbrot', 'weissbrot', 'baguette'], 48, 4, 3, 3.5, 8, 260, 75],
    ['Brötchen', ['brötchen', 'broetchen', 'semmel', 'schrippe'], 50, 3, 3, 1.5, 8.5, 255, 70],
    ['Croissant', ['croissant'], 44, 8, 2, 21, 8, 400, 67],
    ['Nudeln (gekocht)', ['nudeln', 'pasta', 'spaghetti', 'penne', 'makkaroni', 'fusilli', 'tagliatelle'], 26, 0.5, 1.8, 0.8, 5, 140, 50],
    ['Vollkornnudeln (gekocht)', ['vollkornnudeln', 'vollkornpasta'], 24, 0.8, 4, 1, 5.5, 135, 42],
    ['Nudeln (roh)', ['nudeln roh', 'pasta roh', 'spaghetti roh'], 70, 3, 4.5, 1.5, 12.5, 355, 50],
    ['Reis (gekocht)', ['reis', 'basmati', 'jasminreis', 'milchreis'], 28, 0.1, 0.4, 0.3, 2.7, 130, 73],
    ['Vollkornreis (gekocht)', ['vollkornreis', 'naturreis'], 23, 0.4, 1.8, 0.9, 2.6, 112, 55],
    ['Kartoffeln (gekocht)', ['kartoffel', 'kartoffeln', 'salzkartoffeln', 'pellkartoffeln'], 15, 0.8, 1.8, 0.1, 2, 72, 78],
    ['Kartoffelpüree', ['püree', 'kartoffelpüree', 'kartoffelbrei'], 14, 1.2, 1.2, 4, 2, 100, 85],
    ['Pommes', ['pommes', 'fritten', 'pommes frites'], 35, 0.3, 3.2, 14, 3.4, 290, 75],
    ['Pizza Margherita', ['pizza'], 28, 3, 2, 9, 11, 240, 60],
    ['Döner', ['döner', 'doener', 'kebab'], 20, 2, 1.5, 11, 13, 230, 55],
    ['Burger', ['burger', 'hamburger', 'cheeseburger'], 25, 5, 1.5, 12, 13, 260, 60],
    ['Tomatensoße', ['tomatensoße', 'tomatensosse', 'tomatensauce', 'soße', 'sosse', 'sauce'], 7, 5, 1.5, 2, 1.5, 55, 45],
    ['Linsen (gekocht)', ['linsen', 'dal'], 16, 1, 7, 0.4, 9, 115, 30],
    ['Kichererbsen (gekocht)', ['kichererbsen', 'hummus', 'falafel'], 16, 2, 7, 2.6, 8, 140, 28],
    ['Banane', ['banane', 'bananen'], 20, 17, 2, 0.2, 1.1, 88, 51],
    ['Apfel', ['apfel', 'äpfel'], 11.4, 10.3, 2.4, 0.2, 0.3, 54, 36],
    ['Orange', ['orange', 'mandarine', 'clementine'], 8.3, 8.3, 2.2, 0.2, 1, 47, 43],
    ['Erdbeeren', ['erdbeere', 'erdbeeren', 'beeren', 'himbeeren', 'heidelbeeren'], 5.5, 5, 2, 0.4, 0.7, 32, 40],
    ['Weintrauben', ['trauben', 'weintrauben'], 15, 15, 1.5, 0.3, 0.7, 70, 53],
    ['Karotte', ['karotte', 'karotten', 'möhre', 'möhren'], 6.8, 4.7, 2.8, 0.2, 0.9, 39, 35],
    ['Salat', ['salat', 'gurke', 'tomate', 'tomaten', 'paprika', 'gemüse'], 2.5, 2, 1.5, 0.2, 1, 20, 15],
    ['Brokkoli', ['brokkoli', 'broccoli', 'spinat', 'zucchini'], 2.7, 1.7, 3, 0.4, 3.5, 35, 15],
    ['Milch', ['milch', 'kakao'], 4.8, 4.8, 0, 3.5, 3.4, 64, 30],
    ['Joghurt (natur)', ['joghurt', 'jogurt', 'skyr'], 4, 4, 0, 3.5, 4, 65, 35],
    ['Quark', ['quark'], 4, 4, 0, 0.3, 12, 70, 30],
    ['Käse', ['käse', 'kaese', 'gouda', 'emmentaler', 'mozzarella', 'feta'], 0.1, 0.1, 0, 28, 25, 350, 0],
    ['Butter', ['butter', 'margarine'], 0.6, 0.6, 0, 83, 0.7, 740, 0],
    ['Ei', ['ei', 'eier', 'rührei', 'spiegelei'], 0.7, 0.7, 0, 10, 13, 150, 0],
    ['Hähnchen', ['hähnchen', 'haehnchen', 'hühnchen', 'chicken', 'pute', 'putenbrust'], 0, 0, 0, 2, 23, 115, 0],
    ['Rindfleisch', ['rind', 'rindfleisch', 'hackfleisch', 'steak', 'schnitzel', 'schwein'], 0, 0, 0, 12, 21, 200, 0],
    ['Wurst', ['wurst', 'salami', 'schinken', 'würstchen'], 0.5, 0.5, 0, 25, 16, 300, 0],
    ['Lachs', ['lachs', 'fisch', 'thunfisch'], 0, 0, 0, 13, 20, 200, 0],
    ['Nüsse', ['nüsse', 'nuesse', 'mandeln', 'walnüsse', 'erdnüsse', 'cashew'], 7, 4, 10, 52, 22, 610, 15],
    ['Nuss-Nougat-Creme', ['nutella', 'nussnougatcreme', 'nuss-nougat'], 57, 56, 3, 31, 6, 540, 33],
    ['Honig', ['honig'], 80, 80, 0, 0, 0.4, 305, 60],
    ['Marmelade', ['marmelade', 'konfitüre', 'gelee'], 60, 58, 1, 0, 0.4, 250, 55],
    ['Zucker', ['zucker'], 100, 100, 0, 0, 0, 400, 65],
    ['Traubenzucker', ['traubenzucker', 'glukose', 'glucose', 'dextrose'], 91, 91, 0, 0, 0, 370, 100],
    ['Schokolade', ['schokolade', 'schoki', 'schokoriegel', 'snickers', 'mars'], 55, 52, 2, 30, 7, 535, 43],
    ['Gummibärchen', ['gummibärchen', 'gummibaerchen', 'haribo', 'fruchtgummi', 'süßigkeiten'], 77, 46, 0, 0.2, 6.9, 343, 78],
    ['Kekse', ['keks', 'kekse', 'cookies', 'butterkeks'], 70, 25, 2, 18, 7, 470, 60],
    ['Kuchen', ['kuchen', 'torte', 'muffin'], 50, 30, 1.5, 15, 5, 350, 65],
    ['Chips', ['chips'], 50, 1, 4, 33, 6, 530, 56],
    ['Eis', ['eis', 'eiscreme', 'speiseeis'], 24, 21, 0.5, 11, 3.5, 210, 60],
    ['Cola', ['cola', 'limo', 'limonade', 'fanta', 'sprite', 'softdrink'], 10.6, 10.6, 0, 0, 0, 42, 63],
    ['Orangensaft', ['orangensaft', 'saft', 'apfelsaft', 'o-saft'], 9, 8.5, 0.2, 0.2, 0.7, 43, 50],
    ['Eistee', ['eistee'], 7, 7, 0, 0, 0, 29, 60],
    ['Wasser', ['wasser', 'tee', 'kaffee', 'cola zero', 'cola light'], 0, 0, 0, 0, 0, 0, 0]
  ];
  const DB = ROH.map(r => ({ name: r[0], begriffe: r[1], kh: r[2], zucker: r[3], ballaststoffe: r[4], fett: r[5], protein: r[6], kcal: r[7], gi: r[8] }));

  // typisches Gewicht pro Stück/Scheibe
  const STUECK = { 'Ei': 60, 'Apfel': 150, 'Banane': 120, 'Orange': 130, 'Brötchen': 60, 'Toastbrot': 28,
    'Vollkornbrot': 50, 'Brot': 50, 'Croissant': 60, 'Karotte': 80, 'Kekse': 10, 'Muffin': 80, 'Burger': 220,
    'Döner': 350, 'Pizza Margherita': 350, 'Cola': 330, 'Schokolade': 25, 'Kuchen': 100, 'Käse': 25, 'Wurst': 15 };

  const norm = s => s.toLowerCase().replace(/ß/g, 'ss').replace(/[äöü]/g, c => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' })[c]).trim();

  function finde(text) {
    const t = ' ' + norm(text) + ' ';
    let best = null, bestLen = 0;
    for (const e of DB) for (const b of e.begriffe) {
      const nb = norm(b);
      const re = new RegExp('(^|[^a-z])' + nb.replace(/[-]/g, '\\-') + '(n|s|e|en)?([^a-z]|$)');
      if (re.test(t) && nb.length > bestLen) { best = e; bestLen = nb.length; }
    }
    return best;
  }

  // "Nudeln 250 g, Tomatensoße 150g + Cola 330 ml" -> Zutatenliste
  function parse(text) {
    const teile = text.split(/,|\+|;|\n|\bund\b|\bmit\b/i).map(s => s.trim()).filter(Boolean);
    const zutaten = [], unbekannt = [];
    for (const teil of teile) {
      const m = teil.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|ml|l|liter|stück|stk|scheiben?)?(?![a-zäöü])/i);
      const name = teil.replace(/(\d+(?:[.,]\d+)?)\s*(kg|g|gramm|ml|l|liter|stück|stk|scheiben?)?(?![a-zäöü])/i, '').trim();
      const e = finde(name || teil);
      if (!e) { unbekannt.push(teil); continue; }
      let gramm = STUECK[e.name] || 100;
      if (m) {
        const n = parseFloat(m[1].replace(',', '.'));
        const u = (m[2] || '').toLowerCase();
        if (u === 'kg' || u === 'l' || u === 'liter') gramm = n * 1000;
        else if (u === 'g' || u === 'gramm' || u === 'ml') gramm = n;
        else if (u || n <= 10) gramm = n * (STUECK[e.name] || 100); // "2 Eier", "3 Scheiben Toast"
        else gramm = n;
      }
      const f = gramm / 100, r1 = x => Math.round(x * f * 10) / 10;
      zutaten.push({
        name: e.name, gramm: Math.round(gramm), kh: r1(e.kh), zucker: r1(e.zucker),
        ballaststoffe: r1(e.ballaststoffe), fett: r1(e.fett), protein: r1(e.protein),
        kcal: Math.round(e.kcal * f), gi: e.gi
      });
    }
    return { zutaten, unbekannt };
  }

  // Summe einer Zutatenliste; GI als KH-gewichteter Mittelwert, GL = glykämische Last
  function summe(zutaten) {
    const s = { kh: 0, zucker: 0, ballaststoffe: 0, fett: 0, protein: 0, kcal: 0, gi: 0, gl: 0, gramm: 0 };
    for (const z of zutaten || []) {
      for (const k of ['kh', 'zucker', 'ballaststoffe', 'fett', 'protein', 'kcal', 'gramm']) s[k] += Number(z[k]) || 0;
      s.gl += (Number(z.kh) || 0) * (Number(z.gi) || 0) / 100;
    }
    s.gi = s.kh > 0 ? Math.round(100 * s.gl / s.kh) : 0;
    for (const k of ['kh', 'zucker', 'ballaststoffe', 'fett', 'protein', 'gl']) s[k] = Math.round(s[k] * 10) / 10;
    s.kcal = Math.round(s.kcal); s.gramm = Math.round(s.gramm);
    return s;
  }

  root.Lebensmittel = { DB, parse, finde, summe };
})(typeof window !== 'undefined' ? window : globalThis);
