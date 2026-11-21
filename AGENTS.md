# AGENTS.md – Y2K-Studio für Claude

Anleitung für Agenten (und Menschen), die dieses Projekt bauen, ausliefern oder ändern.
Alles hier ist in echten Sitzungen entstanden und erprobt; die Fallstricke am Ende sind echte.

## Was das Projekt ist

Ein **Mod für die Claude-Desktop-App** (Claude Code, Code-Tab) im Y2K-Stil plus ein **Overlay-Programm**:

| Teil | Wo | Was es tut |
|---|---|---|
| Mod (Plugin `y2k`) | `y2k/` | Farbschema, bewegter SVG-Hintergrund, Chromperlen an Werkzeug-Zeilen, Schild, Einstellungsleiste „Y2K-Studio“, Befehl `/y2k …`, startet und steuert das Overlay |
| Overlay Windows | `y2k/overlay/Y2KOverlay.cs` | C#-Programm (Windows Forms, .NET Framework 4, kompiliert zur Laufzeit von PowerShell 5.1): durchklickbares Fenster über Claude mit Rahmen, Glitzer, Ankern an Bedienelementen, Feuerwerk, Seifenblasen, Pixel-Banner |
| Overlay Mac | `y2k/overlay/mac/Y2KOverlay.swift` | Grundfassung in Swift/AppKit, gleiches Dateiprotokoll; noch ohne Anker |
| Marktplatz | `.claude-plugin/marketplace.json` | macht das Repo mit `claude plugin marketplace add` installierbar |
| Werkzeuge | `werkzeuge/` | `render.py` (Vorschaubilder ohne App), `aufnahme.py` (echtes Fenster aufnehmen), `paket.py` (ZIP), `neu-laden.ps1` |

Sprache im Projekt: Deutsch (Texte, Kommentare, Commits).

## Architektur in einem Bild

```
Claude-Desktop-App
 ├─ Mod (y2k/hooks/register.tsx) ── läuft im Plugin-Host der App
 │    ├─ $.theme.set(...)            Farben + Hintergrund-Szene (scene.ts, reines SVG)
 │    ├─ ui.render Pane              Leiste „Y2K-Studio“
 │    ├─ command.run /y2k            Befehle
 │    ├─ turn.complete               schreibt „pulse“ (Glitzer-Regen)
 │    └─ $.process.run               startet das Overlay
 │
 └─ ~/.claude/y2k-overlay/  ◄── Dateiprotokoll ──►  Overlay (Windows: C#, Mac: Swift)
```

Mod und Overlay reden **nur über Dateien** in `~/.claude/y2k-overlay/` (Windows: `%USERPROFILE%\.claude\y2k-overlay\`):

| Datei | Schreibt | Inhalt |
|---|---|---|
| `settings.json` | Mod | `aktiv, rahmen, glitzer, scanlines, schild, eingabe, sitzungen, kopfleiste, feuerwerk, seifenblasen` (bool), `schildpos` (`oben-mitte`, `oben-links`, `unten-mitte`, `unten-links`), `feuerwerkalle` (s), `feuerwerkmenge`, `blasenmenge` (Prozent 10–400) |
| `command` | Mod | Warteschlange, je Zeile `<nummer> <befehl> [werte]`; Nummer = Mikrosekunden seit 1970, streng steigend; die letzten 30 Zeilen bleiben stehen. Befehle: `quit`, `feuerwerk`, `blasen`, `banner <sekunden> <reihe|reihe|…>` (0 s = bleibt), `banner-aus` |
| `pulse` | Mod | Änderungszeit zählt: neu geschrieben = Glitzer-Regen |
| `alive` | Overlay | jede Sekunde neu (PID); frisch (< 4 s) heißt „läuft“; beim Beenden gelöscht |
| `error.log` | Overlay (Windows) | Fehler beim Zeichnen/Lesen, je Meldung einmal |
| `build.log`, `Y2KOverlay-mac` | Mac | Bau-Ausgabe von `start.sh` und das gebaute Programm |

Das Overlay liest Einstellungen jede Sekunde, Befehle und Puls jede halbe Sekunde (nur bei geänderter Datei). Beim Start überspringt es alles, was schon in `command` steht.

## Bauen, prüfen, ausliefern (Windows, das erprobte Verfahren)

Voraussetzungen: Claude-Desktop-App mit Claude Code, Node.js (für `npx typescript`), PowerShell 5.1.

1. **Version erhöhen – an zwei Stellen gleich:** `y2k/.claude-plugin/plugin.json` (`"version"`) und `y2k/hooks/scene.ts` (`export const VERSION`). Die Version steckt im Szenen-Namen; ohne neue Version zeichnet die App den Hintergrund nicht neu.
2. **Mod prüfen:**
   ```powershell
   claude plugin validate y2k
   cd y2k; npx -y -p typescript@5.9.3 tsc -p . --noEmit
   ```
   Erwartet: „Validation passed (with warnings)“ und `tsc` ohne Ausgabe. Bekannte, harmlose Warnungen: `ContextMenu` (ältere CLI kennt die Komponente nicht, die Desktop-App schon), fehlendes Icon.
3. **Overlay kompilieren (ohne zu starten):**
   ```powershell
   Add-Type -Path y2k\overlay\Y2KOverlay.cs -ReferencedAssemblies System.Windows.Forms, System.Drawing, UIAutomationClient, UIAutomationTypes, WindowsBase -OutputAssembly $env:TEMP\y2kcheck.dll -OutputType Library
   ```
   Achtung: C# 5 (Compiler von PowerShell 5.1) – keine `$"…"`-Strings, kein `?.`, keine `=>`-Member.
4. **Installieren / aktualisieren** (die App liest eine Kopie im Plugin-Cache, nicht den Ordner):
   ```powershell
   claude plugin marketplace update <marktplatz>
   claude plugin update y2k@<marktplatz>
   claude plugin list          # Status muss „enabled“ sein
   ```
   Danach in der App `/reload-plugins`. „0 hooks“ in der Meldung ist normal (Mods zählen dort nicht).
5. **Overlay neu starten:** Befehl `quit` in die Warteschlange schreiben (oder in der Leiste „Neu starten“), warten bis `alive` verschwindet, dann `y2k/overlay/Start-Y2KOverlay.ps1` aus dem **Cache-Ordner der neuen Version** starten (`~/.claude/plugins/cache/<marktplatz>/y2k/<version>/overlay/`). Der Mod macht genau das über `$.process.run` mit `Start-Process` (löst das Overlay vom Mod).
6. **Sichtprüfung:** Bildschirmfoto des Claude-Fensters (Prozess per-Monitor-DPI-bewusst machen, sonst stimmen die Koordinaten nicht). Wartezeit nach dem Start ≥ 7 s (Kompilieren + Einblenden).

### Mac

- Voraussetzung: Xcode-Befehlszeilenwerkzeuge (`xcode-select --install`).
- `sh y2k/overlay/mac/start.sh` baut beim ersten Mal (`swiftc -O`) nach `~/.claude/y2k-overlay/Y2KOverlay-mac` und startet im Hintergrund; der Mod ruft das ebenfalls auf (`uname -s` = Darwin).
- **Stand: ungetestet** – geschrieben auf Windows, wo AppKit fehlt. Erster Lauf auf einem Mac: `build.log` lesen, Fehler beheben.
- Lage: `CGWindowListCopyWindowInfo` (Eigentümer „Claude“, Ebene 0) – braucht keine Freigabe. Sichtbar nur, solange Claude die aktive App ist (Fensterebene `.floating`).
- **Offen für den Mac:** Anker über die Accessibility-API (`AXUIElement`: Eingabefeld „Prompt“, Knopf „Stopp“, Sitzungsknöpfe) – braucht Freigabe unter Datenschutz & Sicherheit → Bedienungshilfen; Tastenkürzel (Carbon `RegisterEventHotKey`); Kopfleisten-Symbole.

## Wo was im Code steht

| Datei | Inhalt |
|---|---|
| `y2k/hooks/register.tsx` | Einstellungen (`Settings`, `loadSettings`, `saveSettings` → `$.store` + `settings.json`), Look (`lookFor`, `sceneName`), Overlay-Steuerung (`startOverlay`, `sendOverlayCommand`, `runOverlayAction`), Befehle (`effectCommand`, `sweepCommand`, `/y2k`-Hook), Leiste (`ui.render` Pane, Karten über `section`/`switchRow`), `COMMAND_HELP` |
| `y2k/hooks/scene.ts` | Hintergrund-SVG mit CSS-Animationen; `sceneFor(label, sweep)`, `sweepRules` (Lichtstreifen-Takt) |
| `y2k/hooks/banner.ts` | eigene 5×7-Pixel-Schrift; `bannerGrid` (Raster fürs Overlay), `bannerAscii` (Blockzeichen für den Chat) |
| `y2k/hooks/icons.ts` | Chromperlen vor Werkzeug-Aufrufen |
| `y2k/hooks/make-colors.js` | Hilfsdatei aus dem Claude-Code-Mod-Baukasten (Farbschema aus wenigen Farben). Nicht ändern |
| `y2k/overlay/Y2KOverlay.cs` | `AnchorScanner` (UI Automation, Hintergrund-Thread, 0,6 s), `OverlayForm` (`Tick`, `Render`, Effekte, Warteschlange `ReadCommand`/`RunCommand`, `ReadSettings`), `App.Run` |

## Rezepte

- **Neue Einstellung:** Feld in `Settings`/`OverlaySettings` + Standard + `loadSettings` + ggf. `OVERLAY_LABELS` → Schalter in der Leiste → in `writeOverlaySettings` mitschreiben → im Overlay in `ReadSettings` (Windows: `Flag`/`Percent`; Mac: `Settings.read`) lesen.
- **Neuer Overlay-Effekt:** Befehl in `RunCommand` (C#) und `run` (Swift) → Funktion im Mod, die `sendOverlayCommand($, '<befehl>')` ruft → Knopf in der Leiste + Unterbefehl in `/y2k` + Zeile in `COMMAND_HELP`.
- **Neuer Anker (Windows):** Namen des Bedienelements per UI Automation finden (siehe Fallstricke), in `AnchorScanner.Read` erkennen, in `Render` zeichnen; Koordinaten relativ zum Fenster speichern, wenn das Element mitwandern soll.
- **Etwas in der Szene ändern:** `scene.ts`; alles, was sich ändern soll, muss im Szenen-Namen stecken (`sceneName`), sonst zeichnet die App nicht neu.

## Fallstricke (alle echt passiert)

- **Hilfsfunktionen, die `$` bekommen, müssen auf oberster Ebene stehen** (`function name($: Engine)`), nicht als Konstante in `register` – sonst lehnt `claude plugin validate` ab. Typ: `import type { EngineInterface as Engine } from 'claude-code'`.
- **Parameter nicht `on` nennen** – überschattet `on(...)`; der Validator lehnt ab.
- **BOM:** PowerShell 5.1 `Set-Content -Encoding UTF8` schreibt ein BOM → `plugin.json` ungültig. Immer `[IO.File]::WriteAllText(p, t, (New-Object Text.UTF8Encoding $false))`.
- **PowerShell und deutsche Anführungszeichen:** „ “ ‚ ‘ zählen in PowerShell als Anführungszeichen. Texte mit solchen Zeichen nicht in PowerShell-Strings ersetzen, sondern mit einem Datei-Editor.
- **`R` ist in PowerShell ein Alias** (`Invoke-History`) – keine Hilfsfunktion so nennen.
- **Relative Pfade in .NET-Aufrufen** (`[IO.File]::…`) beziehen sich auf das Prozess-Verzeichnis, nicht auf `Set-Location`. Absolute Pfade nehmen.
- **Plugin nach Update deaktiviert:** Nach einem Update kann `enabledPlugins` auf `false` stehen („0 hooks“, `/y2k` fehlt). Prüfen mit `claude plugin list`, einschalten mit `claude plugin enable y2k@<marktplatz>`.
- **Szene zeichnet nicht neu:** Szenen-Name unverändert (Version vergessen oder neue Option nicht im Namen).
- **Befehle gingen verloren**, als jeder die Datei überschrieb (Overlay liest nur jede halbe Sekunde) → deshalb die nummerierte Warteschlange. Nie wieder einzelne Befehle überschreiben.
- **Anker außerhalb des Fensters:** Der Eingabebereich (Feld + Modellzeile) ragte 3 px über den Fensterrand und wurde verworfen → am Fenster abschneiden statt `Contains` prüfen.
- **UI-Automation-Namen sind deutsch** („Prompt“, „Stopp“, „Läuft“, „Ungelesene Antwort“, „Warte auf Eingabe“, „Menü“, „Schließen“ …). Andere App-Sprache = Anker greifen nicht. Namen nachsehen: `AutomationElement.FromHandle(<Claude-Fenster>).FindAll(Descendants, …)`; Chromium schaltet die Barrierefreiheit erst nach dem ersten Zugriff ein (einmal kurz warten und erneut lesen).
- **Kopfleisten-Symbole nur oberste Zeile** (`Bottom − Fensteroben < 44 px × DPI`), sonst bekommen gleichnamige Knöpfe in Unterleisten (z. B. „Schließen“ einer Leiste) auch Chips.
- **Bildschirmfotos:** Liegt ein anderes Fenster vor Claude, sieht man das Overlay nicht (es hängt als besessenes Fenster direkt über Claude, nicht über allem). Das ist gewollt.
- **Kein Swift auf Windows bauen:** AppKit gibt es nur auf macOS.

## Veröffentlichen

- Vor dem Öffentlichmachen die **ganze Geschichte** prüfen (`git grep` über `git rev-list --all`) auf Schlüssel, private Links, Mailadressen, Pfade und Namen Dritter; Bilder aus `werkzeuge/aufnahme.py` zeigen das echte Fenster und gehören nicht ins Repo (`docs/bilder/*-app.*` ist ausgeschlossen).
- Commits mit GitHub-Noreply-Adresse; nie Force-Push.

## Fahrplan

- Mac: erster echter Bau und Test, dann Anker (AX-API), Tastenkürzel, Kopfleisten-Symbole.
- Anker sprachunabhängig machen (z. B. über Rollen und Lage statt Namen, oder Namenslisten je Sprache).
- Autostart des Overlays mit Windows bzw. als Anmeldeobjekt auf dem Mac.
- Effekte: weitere (Schnee, Konfetti, Laser), Effekt bei bestimmten Ereignissen (Tool-Fehler, langer Lauf fertig).
