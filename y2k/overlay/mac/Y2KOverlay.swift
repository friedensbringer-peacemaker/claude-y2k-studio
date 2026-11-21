// Y2K-Overlay für die Claude-Desktop-App auf dem Mac (Grundfassung).
//
// Ein randloses, durchsichtiges Fenster, das alle Klicks durchlässt (ignoresMouseEvents)
// und dem Claude-Fenster folgt. Die Lage kommt aus der Fensterliste von macOS
// (CGWindowListCopyWindowInfo); dafür ist keine Bedienungshilfen-Freigabe nötig.
// Sichtbar ist es nur, solange Claude die aktive App ist.
//
// Es spricht dasselbe Dateiprotokoll wie die Windows-Fassung (siehe AGENTS.md):
//   ~/.claude/y2k-overlay/settings.json  Schalter und Mengen
//   ~/.claude/y2k-overlay/command        Warteschlange "<nummer> <befehl> [werte]"
//   ~/.claude/y2k-overlay/pulse          geändert = Glitzer-Regen
//   ~/.claude/y2k-overlay/alive          Lebenszeichen (jede Sekunde)
//
// Bauen:  swiftc -O Y2KOverlay.swift -o Y2KOverlay-mac   (start.sh erledigt das)
//
// Anker (Eingabefeld-Ring, Sitzungs-Sterne, Kopfleisten-Symbole) liest es über die
// Accessibility-API von macOS. Dafür braucht es einmal die Freigabe unter
// Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen. Ohne Freigabe laufen
// Rahmen und Effekte trotzdem. Tastenkürzel: ⌃⌥Y blendet ein und aus.

import AppKit
import ApplicationServices
import Carbon

// MARK: - Dateien

let baseDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(".claude/y2k-overlay", isDirectory: true)

func path(_ name: String) -> String { baseDir.appendingPathComponent(name).path }

func modified(_ file: String) -> Date? {
    (try? FileManager.default.attributesOfItem(atPath: file))?[.modificationDate] as? Date
}

// MARK: - Farben und Formen

let palette: [NSColor] = [
    NSColor(srgbRed: 1.00, green: 0.36, blue: 0.80, alpha: 1), // Pink
    NSColor(srgbRed: 0.47, green: 0.90, blue: 1.00, alpha: 1), // Cyan
    NSColor(srgbRed: 0.78, green: 1.00, blue: 0.55, alpha: 1), // Lime
    NSColor(srgbRed: 0.75, green: 0.59, blue: 1.00, alpha: 1), // Lavendel
]

func randomTint() -> NSColor { palette[Int.random(in: 0..<4)] }

func rnd(_ a: CGFloat, _ b: CGFloat) -> CGFloat { CGFloat.random(in: a..<b) }

// Vierzackiger Stern wie in der Windows-Fassung
func starPath(_ cx: CGFloat, _ cy: CGFloat, _ size: CGFloat) -> CGPath {
    let t = size * 0.22
    let p = CGMutablePath()
    p.addLines(between: [
        CGPoint(x: cx, y: cy - size), CGPoint(x: cx + t, y: cy - t), CGPoint(x: cx + size, y: cy),
        CGPoint(x: cx + t, y: cy + t), CGPoint(x: cx, y: cy + size), CGPoint(x: cx - t, y: cy + t),
        CGPoint(x: cx - size, y: cy), CGPoint(x: cx - t, y: cy - t),
    ])
    p.closeSubpath()
    return p
}

// Farbverlauf entlang einer gestrichelten Linie: Pfad zur Kontur machen, clippen, Verlauf malen
func strokeGradient(_ ctx: CGContext, _ path: CGPath, width: CGFloat, colors: [NSColor], alpha: CGFloat, angle: CGFloat, in rect: CGRect) {
    ctx.saveGState()
    ctx.addPath(path)
    ctx.setLineWidth(width)
    ctx.replacePathWithStrokedPath()
    ctx.clip()
    let cg = colors.map { $0.withAlphaComponent(alpha).cgColor } as CFArray
    if let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: cg, locations: nil) {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = max(rect.width, rect.height) / 2
        let d = CGPoint(x: cos(angle) * r, y: sin(angle) * r)
        ctx.drawLinearGradient(grad, start: CGPoint(x: c.x - d.x, y: c.y - d.y), end: CGPoint(x: c.x + d.x, y: c.y + d.y), options: [])
    }
    ctx.restoreGState()
}

// MARK: - Einstellungen (aus der Einstellungsleiste des Mods)

struct Settings {
    var aktiv = true, rahmen = true, glitzer = true, scanlines = false, schild = true
    var feuerwerk = false, seifenblasen = false
    var eingabe = true, sitzungen = true, kopfleiste = true
    var schildpos = "oben-mitte"
    var feuerwerkAlle: Double = 45, feuerwerkMenge: CGFloat = 1, blasenMenge: CGFloat = 1

    mutating func read(_ json: [String: Any]) {
        func flag(_ k: String, _ v: inout Bool) { if let b = json[k] as? Bool { v = b } }
        flag("aktiv", &aktiv); flag("rahmen", &rahmen); flag("glitzer", &glitzer); flag("scanlines", &scanlines)
        flag("schild", &schild); flag("feuerwerk", &feuerwerk); flag("seifenblasen", &seifenblasen)
        flag("eingabe", &eingabe); flag("sitzungen", &sitzungen); flag("kopfleiste", &kopfleiste)
        if let s = json["schildpos"] as? String { schildpos = s }
        if let n = json["feuerwerkalle"] as? Double { feuerwerkAlle = max(5, n) }
        if let n = json["feuerwerkmenge"] as? Double { feuerwerkMenge = CGFloat(min(400, max(10, n)) / 100) }
        if let n = json["blasenmenge"] as? Double { blasenMenge = CGFloat(min(400, max(10, n)) / 100) }
    }
}

// MARK: - Teilchen

struct Sparkle { var x, y, size, age, life: CGFloat; var tint: NSColor }
struct Rocket { var x, y, vx, vy, burstY: CGFloat; var tint: NSColor }
struct FireSpark { var x, y, px, py, vx, vy, age, life, size: CGFloat; var tint: NSColor; var twinkle: Bool }
struct Bubble {
    var x0, y, r, vy, phase, sway, age, life: CGFloat
    var x: CGFloat { x0 + sin(phase + age * 1.3) * sway }
}

// MARK: - Anker: echte Bedienelemente der Claude-App (Accessibility-API)

enum AnchorKind { case running, unread, waiting, menu }

struct Anchor { let kind: AnchorKind; let rect: CGRect }      // Bildschirm-Koordinaten (oben links)
struct IconAnchor { let kind: String; let rel: CGRect; let enabled: Bool } // relativ zum Fenster

struct Scan {
    var anchors: [Anchor] = []
    var icons: [IconAnchor] = []
    var working = false          // Knopf „Stopp“ ist da: Claude arbeitet
    var input: CGRect = .null    // Eingabebereich (Feld + Knöpfe), Bildschirm-Koordinaten
}

// Liest im Hintergrund alle 0,6 s die Bedienelemente des Claude-Fensters.
// Die Namen sind die der deutschen Oberfläche, wie in der Windows-Fassung.
final class AnchorScanner {
    private let lock = NSLock()
    private var latestScan = Scan()
    private var pid: pid_t = 0
    private var window: CGRect = .zero
    private var primedPid: pid_t = 0

    var latest: Scan { lock.lock(); defer { lock.unlock() }; return latestScan }

    func update(pid: pid_t, window: CGRect) {
        lock.lock(); self.pid = pid; self.window = window; lock.unlock()
    }

    static let headerIcons: [String: String] = [
        "Menü": "menu", "Seitenleiste ausblenden": "sidebar", "Seitenleiste einblenden": "sidebar",
        "Zurück": "back", "Vorwärts": "forward",
        "Sitzungsleiste": "list", "Terminal": "terminal", "Änderungen": "diff",
        "Browser": "globe", "Dateien": "folder", "Optionen anzeigen": "dots",
    ]

    func start() {
        let thread = Thread { [weak self] in
            while let self {
                self.lock.lock(); let pid = self.pid; let window = self.window; self.lock.unlock()
                if pid != 0 && AXIsProcessTrusted() {
                    let scan = self.read(pid: pid, window: window)
                    self.lock.lock(); self.latestScan = scan; self.lock.unlock()
                }
                Thread.sleep(forTimeInterval: 0.6)
            }
        }
        thread.name = "Y2K-Anker"
        thread.start()
    }

    private static let keys = ["AXRole", "AXDescription", "AXTitle", "AXPosition", "AXSize", "AXChildren", "AXEnabled"] as CFArray

    private func read(pid: pid_t, window: CGRect) -> Scan {
        let app = AXUIElementCreateApplication(pid)
        // Electron baut seinen Barrierefreiheits-Baum erst auf Nachfrage
        if primedPid != pid {
            AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
            primedPid = pid
        }
        var scan = Scan()
        var edit = CGRect.null
        var parts: [CGRect] = []

        // Breitensuche ab der App, begrenzt, damit ein großer Chat nicht bremst
        var queue: [AXUIElement] = [app]
        var visited = 0
        while !queue.isEmpty && visited < 6000 {
            let element = queue.removeFirst()
            visited += 1
            var values: CFArray?
            guard AXUIElementCopyMultipleAttributeValues(element, AnchorScanner.keys, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
                  let list = values as? [AnyObject], list.count == 7 else { continue }

            if let children = list[5] as? [AXUIElement] { queue.append(contentsOf: children) }

            let role = list[0] as? String ?? ""
            let desc = list[1] as? String ?? ""
            let title = list[2] as? String ?? ""
            let name = desc.isEmpty ? title : desc
            guard let rect = AnchorScanner.frame(list[3], list[4]), rect.width > 1, rect.height > 1 else { continue }
            // Nur, was im Claude-Fenster liegt
            guard window.intersects(rect) else { continue }

            if role == "AXMenu" { scan.anchors.append(Anchor(kind: .menu, rect: rect)); continue }
            if role == "AXTextArea" || role == "AXTextField" {
                if name == "Prompt" { edit = rect }
                continue
            }
            guard role == "AXButton" else { continue }

            if let kind = AnchorScanner.headerIcons[name], rect.maxY - window.minY < 44 {
                let enabled = (list[6] as? Bool) ?? true
                scan.icons.append(IconAnchor(kind: kind, rel: rect.offsetBy(dx: -window.minX, dy: -window.minY), enabled: enabled))
                continue
            }
            if name == "Stopp" { scan.working = true; parts.append(rect); continue }
            if name == "Hinzufügen" || name == "Zum Aufnehmen gedrückt halten" || name == "Senden"
                || name.hasPrefix("Modell:") || name.hasPrefix("Nutzung:") { parts.append(rect); continue }

            // Sitzungen in der Seitenleiste: breite, flache Knöpfe mit Status im Namen
            if rect.width >= 250 && rect.width <= 520 && rect.height >= 24 && rect.height <= 40 {
                if name.contains(" Läuft") { scan.anchors.append(Anchor(kind: .running, rect: rect)) }
                else if name.contains("Ungelesene Antwort") { scan.anchors.append(Anchor(kind: .unread, rect: rect)) }
                else if name.contains("Warte auf Eingabe") { scan.anchors.append(Anchor(kind: .waiting, rect: rect)) }
            }
        }
        if !edit.isNull {
            var u = edit
            for p in parts where abs(p.midY - edit.midY) < 90 && p.minX > edit.minX - 200 && p.maxX < edit.maxX + 200 {
                u = u.union(p)
            }
            scan.input = u.insetBy(dx: -14, dy: -12)
        } else {
            scan.working = false
        }
        return scan
    }

    private static func frame(_ position: AnyObject, _ size: AnyObject) -> CGRect? {
        guard CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
        var p = CGPoint.zero, s = CGSize.zero
        guard AXValueGetValue(position as! AXValue, .cgPoint, &p), AXValueGetValue(size as! AXValue, .cgSize, &s) else { return nil }
        return CGRect(origin: p, size: s)
    }
}

// Glyphe im 24er-Raster für die Kopfleisten-Symbole (wie in der Windows-Fassung)
func glyph(_ kind: String) -> CGPath {
    let p = CGMutablePath()
    func line(_ a: CGPoint, _ b: CGPoint) { p.move(to: a); p.addLine(to: b) }
    func pts(_ list: [CGPoint]) { p.addLines(between: list) }
    switch kind {
    case "menu":
        line(CGPoint(x: 6, y: 7), CGPoint(x: 18, y: 7)); line(CGPoint(x: 6, y: 12), CGPoint(x: 18, y: 12)); line(CGPoint(x: 6, y: 17), CGPoint(x: 18, y: 17))
    case "sidebar":
        p.addRoundedRect(in: CGRect(x: 5, y: 6, width: 14, height: 12), cornerWidth: 2.5, cornerHeight: 2.5); line(CGPoint(x: 10, y: 6.5), CGPoint(x: 10, y: 17.5))
    case "back":
        pts([CGPoint(x: 14, y: 7), CGPoint(x: 9, y: 12), CGPoint(x: 14, y: 17)])
    case "forward":
        pts([CGPoint(x: 10, y: 7), CGPoint(x: 15, y: 12), CGPoint(x: 10, y: 17)])
    case "list":
        for i in 0..<3 {
            let y = CGFloat(7 + i * 5)
            p.addEllipse(in: CGRect(x: 6.2, y: y - 0.8, width: 1.6, height: 1.6)); line(CGPoint(x: 10, y: y), CGPoint(x: 18, y: y))
        }
    case "terminal":
        pts([CGPoint(x: 6, y: 8), CGPoint(x: 10, y: 12), CGPoint(x: 6, y: 16)]); line(CGPoint(x: 12, y: 16.5), CGPoint(x: 18, y: 16.5))
    case "diff":
        p.addRoundedRect(in: CGRect(x: 5, y: 5, width: 14, height: 14), cornerWidth: 3, cornerHeight: 3)
        line(CGPoint(x: 12, y: 7.5), CGPoint(x: 12, y: 11.5)); line(CGPoint(x: 10, y: 9.5), CGPoint(x: 14, y: 9.5)); line(CGPoint(x: 10, y: 15), CGPoint(x: 14, y: 15))
    case "globe":
        p.addEllipse(in: CGRect(x: 5, y: 5, width: 14, height: 14)); p.addEllipse(in: CGRect(x: 9, y: 5, width: 6, height: 14)); line(CGPoint(x: 5, y: 12), CGPoint(x: 19, y: 12))
    case "folder":
        pts([CGPoint(x: 4.5, y: 7.5), CGPoint(x: 9.5, y: 7.5), CGPoint(x: 11, y: 9.5), CGPoint(x: 19.5, y: 9.5), CGPoint(x: 19.5, y: 17.5), CGPoint(x: 4.5, y: 17.5)]); p.closeSubpath()
    case "dots":
        for i in 0..<3 { p.addEllipse(in: CGRect(x: 5.2 + CGFloat(i) * 6, y: 11.2, width: 1.6, height: 1.6)) }
    default: break
    }
    return p
}

// MARK: - Zeichenfläche

final class OverlayView: NSView {
    weak var app: Overlay?
    override var isFlipped: Bool { true } // y nach unten, wie unter Windows
    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext, let app else { return }
        app.draw(ctx, size: bounds.size)
    }
}

// MARK: - Das Overlay

final class Overlay: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let view = OverlayView()
    var settings = Settings()
    var clock = Date()
    var last = Date()
    var fade: CGFloat = 0
    var wasShown = false
    var quitting = false, quitAt: TimeInterval = 0

    var sparkles: [Sparkle] = [], burstLeft = 0
    var rockets: [Rocket] = [], fireSparks: [FireSpark] = [], launches: [TimeInterval] = []
    var nextAutoFirework: TimeInterval = 20
    var bubbles: [Bubble] = [], bubbleBurstLeft = 0
    var bannerRows: [String] = [], bannerStart: TimeInterval = -100, bannerUntil: TimeInterval = -100, bannerBurst = false

    var lastSettings: Date?, lastPulse: Date?, lastCommand: Date?, lastSeq: Int64 = -1
    var lastAlive: TimeInterval = -10, lastFileCheck: TimeInterval = -10
    var statusItem: NSStatusItem!

    let scanner = AnchorScanner()
    var scan = Scan()
    var wasWorking = false
    var origin = CGPoint.zero   // linke obere Ecke des Claude-Fensters (Bildschirm-Koordinaten)
    var hotKeyRef: EventHotKeyRef?

    var now: TimeInterval { Date().timeIntervalSince(clock) }

    func applicationDidFinishLaunching(_ note: Notification) {
        try? FileManager.default.createDirectory(at: baseDir, withIntermediateDirectories: true)
        // Schon in der Warteschlange stehende Befehle sind alt
        lastPulse = modified(path("pulse"))
        lastCommand = modified(path("command"))
        for (seq, _) in parseQueue() { lastSeq = max(lastSeq, seq) }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 10, height: 10), styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.level = .floating
        window.collectionBehavior = [.fullScreenAuxiliary, .stationary, .ignoresCycle]
        window.contentView = view
        view.app = self
        window.alphaValue = 0
        window.orderFrontRegardless()

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "✧"
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Feuerwerk zünden", action: #selector(menuFirework), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Seifenblasen pusten", action: #selector(menuBubbles), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Ein-/Ausblenden (⌃⌥Y)", action: #selector(menuToggle), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Bedienungshilfen freigeben …", action: #selector(menuAccessibility), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Y2K-Overlay beenden", action: #selector(menuQuit), keyEquivalent: ""))
        for item in menu.items { item.target = self }
        statusItem.menu = menu

        // Anker brauchen die Freigabe „Bedienungshilfen“; macOS fragt beim ersten Start einmal nach.
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary)
        scanner.start()
        registerHotKey()

        Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in self?.tick() }
    }

    // ⌃⌥Y (Control + Option + Y) blendet das Overlay ein und aus – wie Strg+Alt+Y unter Windows
    func registerHotKey() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let me = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, userData in
            guard let userData else { return noErr }
            let overlay = Unmanaged<Overlay>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { overlay.settings.aktiv.toggle() }
            return noErr
        }, 1, &spec, me, nil)
        let id = EventHotKeyID(signature: OSType(0x5932_4B21), id: 1) // "Y2K!"
        RegisterEventHotKey(UInt32(kVK_ANSI_Y), UInt32(controlKey | optionKey), id, GetApplicationEventTarget(), 0, &hotKeyRef)
    }

    @objc func menuAccessibility() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func menuFirework() { queueFireworks() }
    @objc func menuBubbles() { bubbleBurstLeft += Int(30 * settings.blasenMenge) + 5 }
    @objc func menuToggle() { settings.aktiv.toggle() }
    @objc func menuQuit() { beginQuit() }

    func applicationWillTerminate(_ note: Notification) { try? FileManager.default.removeItem(atPath: path("alive")) }

    // MARK: Claude-Fenster finden

    // Vorderstes normales Fenster der App "Claude" in Bildschirm-Koordinaten von macOS (oben links = 0,0)
    func claudeBounds() -> (rect: CGRect, pid: pid_t)? {
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
        for info in list {
            guard (info[kCGWindowOwnerName as String] as? String) == "Claude",
                  (info[kCGWindowLayer as String] as? Int) == 0,
                  let dict = info[kCGWindowBounds as String] as? NSDictionary,
                  let rect = CGRect(dictionaryRepresentation: dict),
                  rect.width > 200, rect.height > 200 else { continue }
            let pid = (info[kCGWindowOwnerPID as String] as? Int).map { pid_t($0) } ?? 0
            return (rect, pid)
        }
        return nil
    }

    func claudeIsFrontmost() -> Bool {
        let app = NSWorkspace.shared.frontmostApplication
        return app?.localizedName == "Claude" || (app?.bundleIdentifier?.contains("anthropic") ?? false)
    }

    // MARK: Takt

    func tick() {
        let n = now
        let dt = CGFloat(min(0.2, n - last.timeIntervalSince(clock)))
        last = Date()

        if n - lastAlive > 1 {
            lastAlive = n
            try? "\(ProcessInfo.processInfo.processIdentifier)\n".write(toFile: path("alive"), atomically: true, encoding: .utf8)
        }
        if n - lastFileCheck > 0.5 {
            lastFileCheck = n
            readSettings(); readPulse(); readCommands()
        }
        if quitting && n >= quitAt { NSApp.terminate(nil) }

        guard let found = claudeBounds(), claudeIsFrontmost() else {
            window.alphaValue = 0
            fade = 0
            return
        }
        let cg = found.rect
        origin = cg.origin
        scanner.update(pid: found.pid, window: cg)
        scan = scanner.latest
        // Antwort fertig: der Stopp-Knopf ist verschwunden -> Glitzer am Eingabefeld
        if wasWorking && !scan.working && !scan.input.isNull && settings.eingabe {
            for _ in 0..<45 { spawnAround(local(scan.input)) }
        }
        wasWorking = scan.working
        // macOS-Fensterliste: oben links; Cocoa: unten links auf dem Hauptbildschirm
        let primaryHeight = NSScreen.screens.first?.frame.height ?? cg.maxY
        let frame = NSRect(x: cg.minX, y: primaryHeight - cg.maxY, width: cg.width, height: cg.height)
        if window.frame != frame { window.setFrame(frame, display: false) }

        let want = settings.aktiv && !quitting
        fade = want ? min(1, fade + dt / 0.45) : max(0, fade - dt / 0.45)
        if want && !wasShown { burstLeft = 70; wasShown = true }
        else if !want && wasShown { if !quitting { burstLeft = 70 }; wasShown = false }
        window.alphaValue = fade
        if fade <= 0 { return }

        step(dt, w: cg.width, h: cg.height)
        view.needsDisplay = true
    }

    // MARK: Dateien lesen

    func readSettings() {
        let file = path("settings.json")
        guard let m = modified(file), m != lastSettings else { return }
        lastSettings = m
        guard let data = FileManager.default.contents(atPath: file),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        let hadFireworks = settings.feuerwerk
        settings.read(json)
        if settings.feuerwerk && !hadFireworks { nextAutoFirework = now + 2 }
    }

    func readPulse() {
        guard let m = modified(path("pulse")), m != lastPulse else { return }
        lastPulse = m
        burstLeft = 70
    }

    func parseQueue() -> [(Int64, [String])] {
        guard let text = try? String(contentsOfFile: path("command"), encoding: .utf8) else { return [] }
        return text.split(whereSeparator: \.isNewline).compactMap { line in
            let parts = line.split(separator: " ").map(String.init)
            guard parts.count >= 2, let seq = Int64(parts[0]) else { return nil }
            return (seq, parts)
        }.sorted { $0.0 < $1.0 }
    }

    func readCommands() {
        guard let m = modified(path("command")), m != lastCommand else { return }
        lastCommand = m
        for (seq, parts) in parseQueue() where seq > lastSeq {
            lastSeq = seq
            run(parts)
        }
    }

    func run(_ parts: [String]) {
        let n = now
        switch parts[1] {
        case "quit": beginQuit()
        case "feuerwerk": queueFireworks()
        case "blasen": bubbleBurstLeft += Int(30 * settings.blasenMenge) + 5
        case "banner-aus": if bannerUntil > n + 0.5 { bannerUntil = n + 0.5 }
        case "banner":
            let secs = parts.count >= 3 ? (Double(parts[2]) ?? 7) : 7
            if parts.count >= 4 { bannerRows = parts[3].split(separator: "|").map(String.init) }
            bannerStart = n
            bannerUntil = secs <= 0 ? .greatestFiniteMagnitude : n + secs
            bannerBurst = true
        default: break
        }
    }

    func beginQuit() {
        if quitting { return }
        quitting = true
        quitAt = now + (fade > 0 ? 1.1 : 0)
        if fade > 0 { burstLeft = 70 }
    }

    // MARK: Bewegung

    func spawnEdge(w: CGFloat, h: CGFloat, band: CGFloat) {
        var x: CGFloat, y: CGFloat
        switch Int.random(in: 0..<4) {
        case 0: x = rnd(0, w); y = rnd(0, band)
        case 1: x = rnd(0, w); y = h - rnd(0, band)
        case 2: x = rnd(0, band); y = rnd(0, h)
        default: x = w - rnd(0, band); y = rnd(0, h)
        }
        sparkles.append(Sparkle(x: x, y: y, size: rnd(4, 11), age: 0, life: rnd(0.8, 2.4), tint: randomTint()))
    }

    // Bildschirm-Koordinaten -> Koordinaten im Overlay-Fenster
    func local(_ r: CGRect) -> CGRect { r.offsetBy(dx: -origin.x, dy: -origin.y) }

    func coveredByMenu(_ r: CGRect) -> Bool {
        scan.anchors.contains { $0.kind == .menu && $0.rect.intersects(r) }
    }

    // Glitzer auf dem Rand eines Rechtecks (z. B. ums Eingabefeld)
    func spawnAround(_ a: CGRect) {
        let p = rnd(0, 2 * (a.width + a.height))
        var x: CGFloat, y: CGFloat
        if p < a.width { x = a.minX + p; y = a.minY }
        else if p < a.width + a.height { x = a.maxX; y = a.minY + p - a.width }
        else if p < 2 * a.width + a.height { x = a.maxX - (p - a.width - a.height); y = a.maxY }
        else { x = a.minX; y = a.maxY - (p - 2 * a.width - a.height) }
        sparkles.append(Sparkle(x: x + rnd(-5, 5), y: y + rnd(-5, 5), size: rnd(4, 10), age: 0, life: rnd(0.6, 1.8), tint: randomTint()))
    }

    func queueFireworks() {
        let count = max(1, Int(((4 + CGFloat(Int.random(in: 0...2))) * settings.feuerwerkMenge).rounded()))
        for i in 0..<count { launches.append(now + Double(i) * Double(rnd(0.25, 0.6))) }
    }

    func step(_ dt: CGFloat, w: CGFloat, h: CGFloat) {
        let n = now
        // Glitzer
        sparkles = sparkles.compactMap { var s = $0; s.age += dt; return s.age < s.life ? s : nil }
        if settings.glitzer && sparkles.count < 16 && Double.random(in: 0..<1) < 0.25 { spawnEdge(w: w, h: h, band: 22) }
        for _ in 0..<6 where burstLeft > 0 { spawnEdge(w: w, h: h, band: 60); burstLeft -= 1 }
        if settings.eingabe && scan.working && !scan.input.isNull && sparkles.count < 40 && Double.random(in: 0..<1) < 0.35 {
            spawnAround(local(scan.input))
        }

        // Feuerwerk
        if settings.feuerwerk && n >= nextAutoFirework {
            queueFireworks()
            nextAutoFirework = n + settings.feuerwerkAlle / max(0.5, sqrt(Double(settings.feuerwerkMenge)))
        }
        launches.removeAll { t in
            if n >= t {
                let burstY = h * rnd(0.18, 0.48)
                let y = h + 10
                rockets.append(Rocket(x: w * rnd(0.15, 0.85), y: y, vx: rnd(-0.04, 0.04) * w, vy: -sqrt(2 * h * 0.9 * (y - burstY)) * 1.02, burstY: burstY, tint: randomTint()))
                return true
            }
            return false
        }
        let g = h * 0.9
        rockets = rockets.compactMap { r in
            var r = r
            r.vy += g * dt; r.x += r.vx * dt; r.y += r.vy * dt
            if r.vy >= -h * 0.04 || r.y <= r.burstY { explode(r, h: h); return nil }
            return r
        }
        let drag = CGFloat(exp(-Double(dt) * 1.6))
        fireSparks = fireSparks.compactMap { s in
            var s = s
            s.age += dt
            if s.age >= s.life { return nil }
            s.px = s.x; s.py = s.y
            s.vx *= drag; s.vy = s.vy * drag + h * 0.32 * dt
            s.x += s.vx * dt; s.y += s.vy * dt
            return s
        }

        // Seifenblasen
        if settings.seifenblasen && bubbles.count < 60 && CGFloat.random(in: 0..<1) < dt * 0.6 * settings.blasenMenge { spawnBubble(w: w, h: h) }
        for _ in 0..<2 where bubbleBurstLeft > 0 { spawnBubble(w: w, h: h); bubbleBurstLeft -= 1 }
        bubbles = bubbles.compactMap { b in
            var b = b
            b.age += dt; b.y += b.vy * dt
            return (b.age < b.life && b.y > -b.r * 2) ? b : nil
        }
    }

    func explode(_ r: Rocket, h: CGFloat) {
        let count = Int.random(in: 60..<100)
        let ring = Double.random(in: 0..<1) < 0.35
        let second = randomTint()
        for i in 0..<count {
            let ang = Double(i) / Double(count) * .pi * 2 + Double.random(in: 0..<0.1)
            let speed = h * (ring ? 0.32 : rnd(0.12, 0.38))
            let tint: NSColor = Double.random(in: 0..<1) < 0.25 ? .white : (Double.random(in: 0..<1) < 0.7 ? r.tint : second)
            fireSparks.append(FireSpark(x: r.x, y: r.y, px: r.x, py: r.y, vx: CGFloat(cos(ang)) * speed, vy: CGFloat(sin(ang)) * speed,
                                        age: 0, life: rnd(1.1, 2.0), size: rnd(1.6, 3.0), tint: tint, twinkle: Bool.random()))
        }
    }

    func spawnBubble(w: CGFloat, h: CGFloat) {
        let r = rnd(10, 38)
        bubbles.append(Bubble(x0: w * rnd(0.05, 0.95), y: h + r, r: r, vy: -h * rnd(0.06, 0.14), phase: rnd(0, 6.28), sway: rnd(8, 30), age: 0, life: rnd(5, 12)))
    }

    // MARK: Zeichnen

    func draw(_ ctx: CGContext, size: CGSize) {
        let w = size.width, h = size.height, n = CGFloat(now)
        let full = CGRect(origin: .zero, size: size)

        if settings.scanlines {
            ctx.setFillColor(NSColor.black.withAlphaComponent(0.055).cgColor)
            var y: CGFloat = 0
            while y < h { ctx.fill(CGRect(x: 0, y: y, width: w, height: 1)); y += 3 }
        }

        // Leuchtender Chrom-Rahmen mit drehendem Farbverlauf
        if settings.rahmen {
            let colors = palette + [palette[0]]
            for i in stride(from: 6, through: 0, by: -1) {
                let inset = 1.5 + CGFloat(i) * 2
                let alpha: CGFloat = i == 0 ? 0.92 : 0.27 * pow(0.62, CGFloat(i))
                let rect = full.insetBy(dx: inset, dy: inset)
                let p = CGPath(roundedRect: rect, cornerWidth: 10, cornerHeight: 10, transform: nil)
                strokeGradient(ctx, p, width: i == 0 ? 3 : 2, colors: colors, alpha: alpha, angle: n * 0.6, in: full)
            }
        }

        drawAnchors(ctx, n, size: size)
        drawBubbles(ctx, n)
        drawFireworks(ctx, n)
        drawBanner(ctx, n, w: w, h: h)

        // Glitzer
        for s in sparkles {
            let k = sin(.pi * s.age / s.life)
            let sz = s.size * (0.6 + 0.4 * k)
            ctx.setFillColor(s.tint.withAlphaComponent(0.27 * k).cgColor)
            ctx.fillEllipse(in: CGRect(x: s.x - sz * 0.9, y: s.y - sz * 0.9, width: sz * 1.8, height: sz * 1.8))
            ctx.setFillColor(s.tint.withAlphaComponent(k).cgColor)
            ctx.addPath(starPath(s.x, s.y, sz)); ctx.fillPath()
            ctx.setFillColor(NSColor.white.withAlphaComponent(k).cgColor)
            ctx.addPath(starPath(s.x, s.y, sz * 0.55)); ctx.fillPath()
        }

        if settings.schild { drawBadge(ctx, n, w: w, h: h) }
    }

    // MARK: Anker zeichnen

    func drawAnchors(_ ctx: CGContext, _ n: CGFloat, size: CGSize) {
        let win = CGRect(origin: origin, size: size)

        // Eingabefeld: kreisender Chrom-Ring, solange Claude arbeitet
        if settings.eingabe && scan.working && !scan.input.isNull && win.intersects(scan.input) && !coveredByMenu(scan.input) {
            let li = local(scan.input.intersection(win.insetBy(dx: 4, dy: 4)))
            let pulse = 0.65 + 0.35 * sin(n * 4)
            for i in stride(from: 5, through: 0, by: -1) {
                let grow = CGFloat(i) * 2.5
                let alpha: CGFloat = i == 0 ? pulse : 0.35 * pulse * pow(0.6, CGFloat(i))
                let r = li.insetBy(dx: -grow, dy: -grow)
                let p = CGPath(roundedRect: r, cornerWidth: 14 + grow, cornerHeight: 14 + grow, transform: nil)
                strokeGradient(ctx, p, width: 2.5, colors: palette + [palette[0]], alpha: alpha, angle: n * 2.4, in: r)
            }
        }

        // Sitzungen in der Seitenleiste
        if settings.sitzungen {
            for a in scan.anchors where a.kind != .menu && win.contains(a.rect) && !coveredByMenu(a.rect) {
                let la = local(a.rect)
                let cx = la.maxX - 44, cy = la.midY
                switch a.kind {
                case .running:
                    let tint = palette[Int(n * 2 + a.rect.minY) % 4]
                    ctx.setFillColor(tint.withAlphaComponent(0.27).cgColor)
                    ctx.fillEllipse(in: CGRect(x: cx - 7, y: cy - 7, width: 14, height: 14))
                    ctx.saveGState()
                    ctx.translateBy(x: cx, y: cy); ctx.rotate(by: n * 2.5 + a.rect.minY * 0.01)
                    ctx.setFillColor(tint.cgColor); ctx.addPath(starPath(0, 0, 7)); ctx.fillPath()
                    ctx.setFillColor(NSColor.white.cgColor); ctx.addPath(starPath(0, 0, 3.5)); ctx.fillPath()
                    ctx.restoreGState()
                case .unread:
                    let k = 0.5 + 0.5 * sin(n * 5 + a.rect.minY)
                    let s = 4 + 2.5 * k
                    ctx.setFillColor(palette[0].withAlphaComponent(0.25 + 0.25 * k).cgColor)
                    ctx.fillEllipse(in: CGRect(x: cx - s * 1.8, y: cy - s * 1.8, width: s * 3.6, height: s * 3.6))
                    ctx.setFillColor(palette[0].cgColor)
                    ctx.fillEllipse(in: CGRect(x: cx - s * 0.8, y: cy - s * 0.8, width: s * 1.6, height: s * 1.6))
                case .waiting:
                    let k = abs(sin(n * 3 + a.rect.minY))
                    let yellow = NSColor(srgbRed: 1, green: 0.84, blue: 0.24, alpha: 0.47 + 0.53 * k)
                    ctx.setFillColor(yellow.cgColor); ctx.addPath(starPath(cx, cy, 5 + 3 * k)); ctx.fillPath()
                    ctx.setFillColor(NSColor.white.withAlphaComponent(0.47 + 0.53 * k).cgColor); ctx.addPath(starPath(cx, cy, 2.5 + 1.5 * k)); ctx.fillPath()
                case .menu: break
                }
            }
        }

        // Chrom-Chips über den Knöpfen der Kopfleiste; Klicks gehen an den Knopf darunter
        if settings.kopfleiste && !scan.icons.isEmpty {
            let mouseScreen = NSEvent.mouseLocation // Cocoa: unten links
            let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
            let mouse = CGPoint(x: mouseScreen.x - origin.x, y: primaryHeight - mouseScreen.y - origin.y)
            for icon in scan.icons where icon.rel.maxX <= size.width && icon.rel.minY >= 0 {
                if coveredByMenu(icon.rel.offsetBy(dx: origin.x, dy: origin.y)) { continue }
                drawHeaderIcon(ctx, icon, hover: icon.rel.contains(mouse), n)
            }
        }
    }

    func drawHeaderIcon(_ ctx: CGContext, _ icon: IconAnchor, hover: Bool, _ n: CGFloat) {
        let r = icon.rel
        let side = min(min(r.width, r.height) * 0.84, 22)
        let chip = CGRect(x: r.midX - side / 2, y: r.midY - side / 2, width: side, height: side)
        let path = CGPath(roundedRect: chip, cornerWidth: side * 0.32, cornerHeight: side * 0.32, transform: nil)
        let top = hover ? NSColor(srgbRed: 0.31, green: 0.14, blue: 0.46, alpha: 1) : NSColor(srgbRed: 0.18, green: 0.09, blue: 0.30, alpha: 1)
        let bottom = hover ? NSColor(srgbRed: 0.16, green: 0.06, blue: 0.29, alpha: 1) : NSColor(srgbRed: 0.09, green: 0.05, blue: 0.16, alpha: 1)
        ctx.saveGState()
        ctx.addPath(path); ctx.clip()
        if let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [top.cgColor, bottom.cgColor] as CFArray, locations: nil) {
            ctx.drawLinearGradient(g, start: CGPoint(x: chip.midX, y: chip.minY), end: CGPoint(x: chip.midX, y: chip.maxY), options: [])
        }
        // Glanzlicht in der oberen Hälfte
        ctx.setFillColor(NSColor.white.withAlphaComponent(hover ? 0.3 : 0.2).cgColor)
        ctx.fill(CGRect(x: chip.minX + side * 0.12, y: chip.minY + side * 0.07, width: side * 0.76, height: side * 0.32))
        ctx.restoreGState()
        strokeGradient(ctx, path, width: hover ? 1.3 : 0.9, colors: [palette[0], palette[1]], alpha: 1, angle: n * 1.05 + r.minX, in: chip)

        // Glyphe: erst ein farbiger Schein, dann die weiße Linie
        var transform = CGAffineTransform(translationX: chip.minX, y: chip.minY).scaledBy(x: side / 24, y: side / 24)
        guard let g = glyph(icon.kind).copy(using: &transform) else { return }
        ctx.setLineCap(.round); ctx.setLineJoin(.round)
        if icon.enabled {
            ctx.setStrokeColor((hover ? palette[1] : palette[0]).withAlphaComponent(hover ? 0.55 : 0.27).cgColor)
            ctx.setLineWidth(3.6 * side / 24); ctx.addPath(g); ctx.strokePath()
        }
        ctx.setStrokeColor(icon.enabled ? NSColor.white.cgColor : NSColor(srgbRed: 0.75, green: 0.69, blue: 0.84, alpha: 0.47).cgColor)
        ctx.setLineWidth(1.9 * side / 24); ctx.addPath(g); ctx.strokePath()
    }

    func drawBadge(_ ctx: CGContext, _ n: CGFloat, w: CGFloat, h: CGFloat) {
        let text = NSAttributedString(string: "✧ Y2K OVERLAY ✧", attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .semibold), .foregroundColor: NSColor.white,
        ])
        let ts = text.size()
        let bw = ts.width + 14, bh = ts.height + 4
        var x = (w - bw) / 2, y: CGFloat = 8
        switch settings.schildpos {
        case "unten-links": x = 14; y = h - bh - 12
        case "unten-mitte": y = h - bh - 6
        case "oben-links": x = 200
        default: break
        }
        y += sin(n * 2.2) * 1.5
        let pill = CGRect(x: x, y: y, width: bw, height: bh)
        let p = CGPath(roundedRect: pill, cornerWidth: bh / 2, cornerHeight: bh / 2, transform: nil)
        ctx.saveGState()
        ctx.addPath(p); ctx.clip()
        let cg = [palette[0].cgColor, palette[1].cgColor] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: cg, locations: nil) {
            ctx.drawLinearGradient(g, start: CGPoint(x: pill.minX, y: pill.minY), end: CGPoint(x: pill.maxX, y: pill.maxY), options: [])
        }
        ctx.restoreGState()
        ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.85).cgColor)
        ctx.setLineWidth(1); ctx.addPath(p); ctx.strokePath()
        NSGraphicsContext.saveGraphicsState()
        text.draw(at: CGPoint(x: x + 7, y: y + 2))
        NSGraphicsContext.restoreGraphicsState()
    }

    func drawBubbles(_ ctx: CGContext, _ n: CGFloat) {
        for b in bubbles {
            let k = min(1, b.age / 0.6) * min(1, (b.life - b.age) / 0.4 + 0.3)
            let box = CGRect(x: b.x - b.r, y: b.y - b.r, width: b.r * 2, height: b.r * 2)
            ctx.setFillColor(palette[Int(b.phase * 2) % 4].withAlphaComponent(0.12 * k).cgColor)
            ctx.fillEllipse(in: box)
            let ring = CGPath(ellipseIn: box, transform: nil)
            strokeGradient(ctx, ring, width: max(1, b.r * 0.07), colors: [palette[1], palette[0], palette[2]], alpha: 0.8 * k, angle: n * 0.7 + b.phase, in: box)
            ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.86 * k).cgColor)
            ctx.setLineWidth(max(1.2, b.r * 0.12)); ctx.setLineCap(.round)
            ctx.addArc(center: CGPoint(x: b.x, y: b.y), radius: b.r * 0.62, startAngle: .pi * 200 / 180, endAngle: .pi * 250 / 180, clockwise: false)
            ctx.strokePath()
        }
    }

    func drawFireworks(_ ctx: CGContext, _ n: CGFloat) {
        ctx.setLineCap(.round)
        for r in rockets {
            ctx.setStrokeColor(r.tint.withAlphaComponent(0.6).cgColor); ctx.setLineWidth(2)
            ctx.move(to: CGPoint(x: r.x, y: r.y)); ctx.addLine(to: CGPoint(x: r.x - r.vx * 0.05, y: r.y - r.vy * 0.05)); ctx.strokePath()
            ctx.setFillColor(NSColor.white.cgColor); ctx.fillEllipse(in: CGRect(x: r.x - 2, y: r.y - 2, width: 4, height: 4))
        }
        for s in fireSparks {
            var k = 1 - s.age / s.life
            if s.twinkle && Int(n * 18 + s.x) % 3 == 0 { k *= 0.25 }
            let a = min(1, k * 1.4)
            if a < 0.02 { continue }
            ctx.setStrokeColor(s.tint.withAlphaComponent(a).cgColor); ctx.setLineWidth(s.size)
            ctx.move(to: CGPoint(x: s.x, y: s.y))
            ctx.addLine(to: CGPoint(x: s.px - (s.x - s.px) * 1.5, y: s.py - (s.y - s.py) * 1.5)); ctx.strokePath()
            ctx.setFillColor(s.tint.withAlphaComponent(a / 4).cgColor)
            ctx.fillEllipse(in: CGRect(x: s.x - s.size * 2, y: s.y - s.size * 2, width: s.size * 4, height: s.size * 4))
        }
    }

    // Farbe je Reihe einer Textzeile (0-6): oben weiß, dann Eisblau, Elektroblau, unten Pink
    let bannerRamp: [NSColor] = [
        NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1), NSColor(srgbRed: 0.80, green: 0.92, blue: 1, alpha: 1),
        NSColor(srgbRed: 0.55, green: 0.78, blue: 1, alpha: 1), NSColor(srgbRed: 0.35, green: 0.55, blue: 1, alpha: 1),
        NSColor(srgbRed: 0.27, green: 0.35, blue: 0.92, alpha: 1), NSColor(srgbRed: 0.59, green: 0.27, blue: 0.90, alpha: 1),
        NSColor(srgbRed: 0.92, green: 0.27, blue: 0.75, alpha: 1),
    ]

    func drawBanner(_ ctx: CGContext, _ n: CGFloat, w: CGFloat, h: CGFloat) {
        let t = TimeInterval(n)
        guard !bannerRows.isEmpty, t <= bannerUntil else { return }
        let rows = bannerRows.count, cols = bannerRows.map(\.count).max() ?? 0
        if cols == 0 { return }
        let cell = max(3, floor(min(14, w * 0.6 / CGFloat(cols + 4))))
        let bw = CGFloat(cols) * cell, bh = CGFloat(rows) * cell
        let bx = (w - bw) / 2, by = h * 0.38 - bh / 2
        let age = CGFloat(t - bannerStart)
        var a = min(1, age / 0.35)
        if bannerUntil != .greatestFiniteMagnitude { a = min(a, CGFloat(max(0, (bannerUntil - t) / 0.5))) }
        if a <= 0 { return }
        let sweep = min(1, age / 0.7) * CGFloat(cols + 6) - 3

        let panel = CGRect(x: bx - cell * 2, y: by - cell * 2, width: bw + cell * 4.5, height: bh + cell * 4.5)
        if bannerBurst { burstLeft = 70; bannerBurst = false }
        let pp = CGPath(roundedRect: panel, cornerWidth: cell * 1.5, cornerHeight: cell * 1.5, transform: nil)
        ctx.setFillColor(NSColor(srgbRed: 0.04, green: 0.02, blue: 0.09, alpha: 0.88 * a).cgColor)
        ctx.addPath(pp); ctx.fillPath()
        strokeGradient(ctx, pp, width: 2, colors: palette + [palette[0]], alpha: 0.9 * a, angle: n * 1.2, in: panel)

        let sub = cell / 2
        for pass in 0..<2 {
            for (r, row) in bannerRows.enumerated() {
                let inLine = r % 8
                let base = bannerRamp[min(6, inLine)]
                for (c, ch) in row.enumerated() where ch == "#" && CGFloat(c) <= sweep {
                    let x = bx + CGFloat(c) * cell, y = by + CGFloat(r) * cell
                    if pass == 0 {
                        ctx.setFillColor(NSColor(srgbRed: 0.27, green: 0.08, blue: 0.47, alpha: 0.8 * a).cgColor)
                        ctx.fill(CGRect(x: x + cell * 0.45, y: y + cell * 0.45, width: cell, height: cell))
                        continue
                    }
                    // 2x2-Dither wie bei ANSI-Kunst: unten dunkler
                    for sy in 0..<2 {
                        for sx in 0..<2 {
                            let dark = (c * 2 + sx + r * 2 + sy) % 2 == 1
                            let k: CGFloat = !dark ? 1 : inLine <= 1 ? 0.92 : inLine <= 4 ? 0.72 : 0.55
                            let col = NSColor(srgbRed: base.redComponent * k, green: base.greenComponent * k, blue: base.blueComponent * k, alpha: a)
                            ctx.setFillColor(col.cgColor)
                            ctx.fill(CGRect(x: x + CGFloat(sx) * sub, y: y + CGFloat(sy) * sub, width: sub + 0.5, height: sub + 0.5))
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Start

// Läuft schon eins (frisches Lebenszeichen), nicht doppelt starten.
if let m = modified(path("alive")), Date().timeIntervalSince(m) < 3 { exit(0) }

let app = NSApplication.shared
let overlay = Overlay()
app.delegate = overlay
app.setActivationPolicy(.accessory) // kein Dock-Symbol, nur ✧ in der Menüleiste
app.run()
