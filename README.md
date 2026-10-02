# GlukoSim – Blutzucker-Simulator (Bio-Projekt)

Web-App (PWA) zum Planen eines Tages mit Mahlzeiten, Sport und Insulin. Die Blutzuckerkurve wird live für
Gesund, Diabetes Typ 1 und Typ 2 simuliert. Gemini ermittelt Nährwerte und schreibt Erklärungen.

## Auf GitHub Pages veröffentlichen
1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `glukosim`.
2. „Add file“ → „Upload files“ → **alle Dateien** hochladen (nicht die ZIP selbst) → „Commit changes“.
3. Repo → **Settings** → **Pages** → Source: „Deploy from a branch“, Branch: `main`, Ordner: `/ (root)` → Save.
4. Nach 1–2 Minuten ist die App unter `https://DEINNAME.github.io/glukosim/` erreichbar.

## Auf dem Android-Handy installieren
1. Link in **Chrome** öffnen.
2. Menü (⋮) → **App installieren** bzw. **Zum Startbildschirm hinzufügen** (oder Einstellungen → „App installieren“ in GlukoSim).
3. Danach startet GlukoSim ohne Browserleiste wie eine normale App und funktioniert auch offline.

## Gemini-API-Key (optional)
- Kostenlos unter https://aistudio.google.com → „Get API key“.
- In GlukoSim unter **Einstellungen → Gemini** eintragen und „Verbindung testen“.
- Der Key wird nur im Browser des Geräts gespeichert. **Nie in das Repository hochladen.**
- Standardmodell: `gemini-flash-latest` (in den Einstellungen änderbar).

Ohne Key funktioniert: Beispieltag inkl. Erklärungen, eingebaute Lebensmittel-Liste (~55 Lebensmittel),
automatische Erklärungen aus dem Modell, „Tag optimieren“, Vergleich.
Mit Key zusätzlich: beliebige Mahlzeiten, Foto-Erkennung (experimentell), ausführliche KI-Erklärungen, Zutaten-Tauschvorschläge.

## Für die Präsentation
- Einstellungen → „Beispieltag laden“: funktioniert komplett ohne Internet.
- Vergleich-Tab: derselbe Tag für alle drei Profile übereinander.
- Snack um 15:30 zum Mittagessen ziehen → Spitzen addieren sich. Bei Typ 1: Insulin anzeigen lassen.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche |
| `style.css` | Design |
| `app.js` | App-Logik (Plan, Drag & Drop, Sheets, Vergleich, Einstellungen) |
| `sim.js` | Simulationsmodell – **alle Parameter oben in `PARAM` und `PROFILE`** |
| `lebensmittel.js` | Offline-Lebensmittel-Liste + Texterkennung |
| `ki.js` | Gemini-Anbindung, Prompts, Cache |
| `optimierer.js` | Lokale Tipps + automatische Erklärungen |
| `demo.js` | Beispieltag mit vorab geschriebenen Erklärungen |
| `chart.js` | Diagramm |
| `sw.js`, `manifest.json`, `icon-*.png` | Installierbarkeit & Offline |

**Nach Änderungen am Code** in `sw.js` die Zeile `const CACHE = 'glukosim-v1.0.0'` hochzählen (z. B. `v1.0.1`),
sonst zeigt das Handy noch die alte Version.

## Das Modell (vereinfacht)
Pro Minute wird berechnet: Glukose aus dem Darm (abhängig von Kohlenhydraten, GI, Fett, Eiweiß, Ballaststoffen),
Abgabe der Leber (gebremst durch Insulin, verstärkt durch Glukagon bei Unterzucker), Verbrauch des Gehirns,
Aufnahme in Muskel/Fett (Insulin × Insulinempfindlichkeit), Muskelarbeit beim Sport (GLUT4, insulinunabhängig),
Ausscheidung über die Niere ab 180 mg/dl.
- **Gesund:** Beta-Zellen schütten schnell und passend Insulin aus.
- **Typ 1:** Kein eigenes Insulin, nur gespritztes (schnell: Wirkmaximum ~1 h; lang: ~24 h gleichmäßig).
- **Typ 2:** Insulinresistenz (Muskel und Leber), verzögerte und begrenzte Ausschüttung.

Plausibilitäts-Check: Zuckertest mit 75 g Glukose → gesund Spitze ~168 mg/dl, nach 2 h wieder normal;
Typ 2 nach 2 h ~200 mg/dl. Schulprojekt, keine medizinische Beratung.
