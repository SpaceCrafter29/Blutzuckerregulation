/* Beispieltag für die Präsentation – funktioniert ohne API-Key und ohne Internet */
(function (root) {
  'use strict';
  function mahlzeit(id, zeit, name, text) {
    const z = root.Lebensmittel.parse(text).zutaten;
    return { id, typ: 'essen', zeit, name, eingabe: text, quelle: 'Beispiel', zutaten: z, summe: root.Lebensmittel.summe(z) };
  }

  function eintraege() {
    return [
      mahlzeit('demo1', 450, 'Frühstück', 'Haferflocken 60 g, Banane 120 g, Milch 200 ml'),
      mahlzeit('demo2', 600, 'Pausensnack', 'Apfel 150 g'),
      mahlzeit('demo3', 765, 'Mittagessen', 'Nudeln 250 g, Tomatensoße 150 g'),
      mahlzeit('demo4', 930, 'Cola und Schokolade', 'Cola 330 ml, Schokolade 40 g'),
      { id: 'demo5', typ: 'sport', zeit: 1020, art: 'Joggen', dauer: 30, intensitaet: 'mittel' },
      mahlzeit('demo6', 1140, 'Abendbrot', 'Vollkornbrot 100 g, Käse 40 g, Salat 100 g'),
      { id: 'demo7', typ: 'insulin', art: 'lang', einheiten: 16, zeit: 1320 },
      { id: 'demo8', typ: 'insulin', art: 'schnell', einheiten: 6, zeit: 435 },
      { id: 'demo9', typ: 'insulin', art: 'schnell', einheiten: 7, zeit: 750 },
      { id: 'demo10', typ: 'insulin', art: 'schnell', einheiten: 4, zeit: 1125 }
    ];
  }

  const texte = {
    gesund: 'Über den ganzen Tag bleibt der Blutzucker zwischen etwa 80 und 115 mg/dl, obwohl über 250 g Kohlenhydrate gegessen werden. Der Grund sind die **Beta-Zellen** der Bauchspeicheldrüse: Sie messen den Blutzucker und schütten sofort **Insulin** aus, sobald er steigt.\n\n' +
      'Nach dem Frühstück (7:30) und dem Mittagessen (12:45) steigt die Kurve nur sanft. Haferflocken enthalten viele **Ballaststoffe**, die Stärke wird im Darm langsam zu Glukose abgebaut. Insulin sorgt dafür, dass Muskel- und Fettzellen die Glukose aufnehmen und die **Leber** sie als **Glykogen** speichert.\n\n' +
      'Cola und Schokolade um 15:30 bringen schnell viel Zucker ins Blut, gegen 16:20 erreicht die Kurve ihren Tageshöchstwert. Beim Joggen ab 17:00 fällt sie auf etwa 82 mg/dl, denn arbeitende Muskeln nehmen Glukose über **GLUT4** auch ohne Insulin auf. Gleichzeitig drosseln die Beta-Zellen das Insulin und **Glukagon** lässt die Leber Glukose nachliefern. So entsteht kein Unterzucker.',
    typ1: 'Bei **Typ 1** hat das Immunsystem die **Beta-Zellen** zerstört. Das **Langzeitinsulin** um 22:00 ersetzt die Grundversorgung und bremst die Zuckerabgabe der **Leber**. Vor den Hauptmahlzeiten wird **schnelles Insulin** gespritzt, deshalb bleiben Frühstück und Mittagessen im Zielbereich.\n\n' +
      'Auffällig ist der Anstieg nach Cola und Schokolade um 15:30: Dafür wurde kein Insulin gespritzt. Die Glukose gelangt ins Blut, kann aber kaum in die Zellen. Die Kurve steigt bis knapp 190 mg/dl.\n\n' +
      'Das Joggen um 17:00 holt den Wert schnell herunter, weil Muskeln Glukose über **GLUT4** auch ohne Insulin aufnehmen. Anders als beim Gesunden lässt sich das gespritzte Insulin dabei nicht drosseln. Wäre für den Snack zusätzlich Insulin gespritzt worden, hätte der Sport zu **Unterzucker** führen können, ein typisches Problem im Alltag mit Typ 1.',
    typ2: 'Bei **Typ 2** wird Insulin gebildet, aber Muskel-, Fett- und Leberzellen reagieren schwächer darauf (**Insulinresistenz**). Schon nachts liegt der Blutzucker bei etwa 145 mg/dl, weil die **Leber** weiter Glukose abgibt, obwohl mehr Insulin im Blut ist als beim Gesunden.\n\n' +
      'Nach jeder Hauptmahlzeit steigt die Kurve über 180 mg/dl, nach dem Mittagessen gegen 14:00 bis etwa 210 mg/dl. Die Bauchspeicheldrüse reagiert verzögert und kann nur begrenzt nachlegen. Das Insulin erreicht seinen Höchstwert erst, wenn der Blutzucker schon lange erhöht ist.\n\n' +
      'Deutlich wirkt das Joggen um 17:00: Der Wert fällt auf rund 115 mg/dl. Bewegung aktiviert **GLUT4** in den Muskelzellen unabhängig vom Insulin und verbessert danach für einige Stunden die **Insulinempfindlichkeit**.',
    vergleich: '**Gesund:** Die Kurve bleibt den ganzen Tag flach (höchstens etwa 115 mg/dl). Die **Beta-Zellen** schütten innerhalb von Minuten genau so viel Insulin aus, wie gebraucht wird.\n\n' +
      '**Typ 1:** Es gibt kein eigenes Insulin, es wird gespritzt. Solange die Dosis zur Mahlzeit passt, ähnelt die Kurve der gesunden. Der Snack ohne Insulin treibt sie aber auf fast 190 mg/dl. Gespritztes Insulin wirkt verzögert und passt sich nicht selbst an.\n\n' +
      '**Typ 2:** Die Kurve liegt insgesamt am höchsten: nüchtern etwa 145 mg/dl, nach dem Essen über 200 mg/dl. Obwohl die Bauchspeicheldrüse fast doppelt so viel Insulin ausschüttet wie beim Gesunden, holen die Zellen wegen der **Insulinresistenz** die Glukose nur langsam aus dem Blut.\n\n' +
      'Fazit: Derselbe Tag ergibt drei völlig verschiedene Kurven. Entscheidend ist nicht nur, was man isst, sondern wie gut Insulin gebildet wird und wirkt.'
  };

  root.Demo = { eintraege, texte };
})(window);
