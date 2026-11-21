// Y2K-Overlay fuer das Claude-Fenster (Windows).
// Ein durchsichtiges, durchklickbares Fenster, das dem Claude-Fenster als
// "Besitzer" zugeordnet wird: liegt immer direkt ueber Claude, wandert mit,
// verschwindet beim Minimieren mit. Alle Klicks gehen an Claude durch.
// Geschrieben fuer den C#-5-Compiler von Windows PowerShell 5.1.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

namespace Y2KOverlay
{
    internal static class Native
    {
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; public POINT(int x, int y) { X = x; Y = y; } }
        [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int CX, CY; public SIZE(int x, int y) { CX = x; CY = y; } }
        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        public struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAPINFOHEADER
        {
            public int biSize, biWidth, biHeight; public short biPlanes, biBitCount;
            public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
        }

        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
        [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
        [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v);
        [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
        [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h, int id);
        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
        [DllImport("user32.dll")]
        public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
            IntPtr hdcSrc, ref POINT pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
        [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    }

    internal class Sparkle
    {
        public float X, Y, Size, Age, Life; public Color Tint;
    }

    // Feuerwerk: eine Rakete steigt auf und zerplatzt bei Burst in Funken
    internal class Rocket
    {
        public float X, Y, VX, VY, BurstY; public Color Tint;
    }

    // Seifenblase: steigt schwankend auf und platzt am Ende
    internal class Bubble
    {
        public float X0, Y, R, VY, Phase, Sway, Age, Life;
        public float X(float t) { return X0 + (float)Math.Sin(Phase + t * 1.3) * Sway; }
    }

    internal class FireSpark
    {
        public float X, Y, PX, PY, VX, VY, Age, Life, Size; public Color Tint; public bool Twinkle;
    }

    // ---------- Anker: echte Bedienelemente der Claude-App (Windows UI Automation) ----------

    internal enum AnchorKind { Running, Unread, Waiting, Menu }

    internal class Anchor
    {
        public AnchorKind Kind; public Rectangle Rect; // Bildschirm-Koordinaten (physische Pixel)
        public Anchor(AnchorKind k, Rectangle r) { Kind = k; Rect = r; }
    }

    // Ein Knopf der Kopfleiste, ueber den das Overlay ein eigenes Symbol legt.
    // Rel ist relativ zur linken oberen Fensterecke: so wandert das Symbol beim Verschieben ohne Verzoegerung mit.
    internal class IconAnchor
    {
        public string Kind; public Rectangle Rel; public bool Enabled;
        public IconAnchor(string k, Rectangle r, bool en) { Kind = k; Rel = r; Enabled = en; }
    }

    internal class Scan
    {
        public readonly List<Anchor> Anchors = new List<Anchor>();
        public readonly List<IconAnchor> Icons = new List<IconAnchor>();
        public bool Working;            // "Stopp"-Knopf ist da: Claude arbeitet
        public Rectangle Input = Rectangle.Empty; // Eingabebereich (Feld + Knoepfe)
    }

    // Liest im Hintergrund alle 0,6 s die Knoepfe und das Eingabefeld des Claude-Fensters.
    // Die Namen sind die der deutschen Oberflaeche.
    internal class AnchorScanner
    {
        IntPtr target = IntPtr.Zero;
        volatile Scan latest = new Scan();
        volatile bool stop;
        readonly object gate = new object();

        public void SetTarget(IntPtr t) { lock (gate) target = t; }
        public Scan Latest { get { return latest; } }
        public void Stop() { stop = true; }

        public void Start()
        {
            Thread th = new Thread(Loop);
            th.IsBackground = true;
            th.Name = "Y2K-Anker";
            th.Start();
        }

        void Loop()
        {
            try { Native.SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
            CacheRequest cr = new CacheRequest();
            cr.Add(AutomationElement.NameProperty);
            cr.Add(AutomationElement.BoundingRectangleProperty);
            cr.Add(AutomationElement.ControlTypeProperty);
            cr.Add(AutomationElement.IsOffscreenProperty);
            cr.Add(AutomationElement.IsEnabledProperty);
            cr.TreeScope = TreeScope.Element;
            System.Windows.Automation.Condition cond = new OrCondition(
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button),
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Menu));

            while (!stop)
            {
                IntPtr t;
                lock (gate) t = target;
                if (t != IntPtr.Zero)
                {
                    try { latest = Read(t, cr, cond); }
                    catch { latest = new Scan(); }
                }
                Thread.Sleep(600);
            }
        }

        // Name des Knopfs in der deutschen Oberflaeche -> eigenes Symbol
        static readonly Dictionary<string, string> HeaderIcons = new Dictionary<string, string>
        {
            { "Menü", "menu" }, { "Seitenleiste ausblenden", "sidebar" }, { "Seitenleiste einblenden", "sidebar" },
            { "Zurück", "back" }, { "Vorwärts", "forward" },
            { "Sitzungsleiste", "list" }, { "Terminal", "terminal" }, { "Änderungen", "diff" },
            { "Browser", "globe" }, { "Dateien", "folder" }, { "Optionen anzeigen", "dots" },
            { "Minimieren", "min" }, { "Maximieren", "max" }, { "Wiederherstellen", "restore" }, { "Schließen", "close" }
        };

        static Scan Read(IntPtr t, CacheRequest cr, System.Windows.Automation.Condition cond)
        {
            Scan s = new Scan();
            AutomationElementCollection all;
            using (cr.Activate())
            {
                AutomationElement root = AutomationElement.FromHandle(t);
                all = root.FindAll(TreeScope.Descendants, cond);
            }
            Rectangle edit = Rectangle.Empty;
            List<Rectangle> parts = new List<Rectangle>();
            // Fensterecke und Skalierung zum Zeitpunkt des Scans, fuer die relativen Symbol-Positionen
            Native.RECT wr;
            if (Native.DwmGetWindowAttribute(t, 9, out wr, Marshal.SizeOf(typeof(Native.RECT))) != 0) Native.GetWindowRect(t, out wr);
            float sc = Math.Max(1f, Native.GetDpiForWindow(t) / 96f);
            foreach (AutomationElement e in all)
            {
                string name; System.Windows.Rect r; ControlType ct; bool off;
                try
                {
                    name = (e.GetCachedPropertyValue(AutomationElement.NameProperty) as string) ?? "";
                    r = (System.Windows.Rect)e.GetCachedPropertyValue(AutomationElement.BoundingRectangleProperty);
                    ct = e.GetCachedPropertyValue(AutomationElement.ControlTypeProperty) as ControlType;
                    off = (bool)e.GetCachedPropertyValue(AutomationElement.IsOffscreenProperty);
                }
                catch { continue; }
                if (off || r.IsEmpty || r.Width < 2 || r.Height < 2 || ct == null) continue;
                Rectangle rr = new Rectangle((int)r.X, (int)r.Y, (int)r.Width, (int)r.Height);

                if (ct == ControlType.Menu) { s.Anchors.Add(new Anchor(AnchorKind.Menu, rr)); continue; }
                if (ct == ControlType.Edit) { if (name == "Prompt") edit = rr; continue; }

                // Knoepfe der Kopfleiste (nur ganz oben im Fenster, damit gleichnamige Knoepfe anderswo nicht zaehlen)
                string kind;
                if (HeaderIcons.TryGetValue(name, out kind) && rr.Bottom - wr.Top < 44 * sc)
                {
                    bool en = true;
                    try { en = (bool)e.GetCachedPropertyValue(AutomationElement.IsEnabledProperty); } catch { }
                    s.Icons.Add(new IconAnchor(kind, new Rectangle(rr.X - wr.Left, rr.Y - wr.Top, rr.Width, rr.Height), en));
                    continue;
                }

                if (name == "Stopp") { s.Working = true; parts.Add(rr); continue; }
                if (name == "Hinzufügen" || name == "Zum Aufnehmen gedrückt halten" || name == "Senden"
                    || name.StartsWith("Modell:") || name.StartsWith("Nutzung:")) { parts.Add(rr); continue; }

                // Sitzungen in der Seitenleiste: breite, flache Knoepfe mit Status im Namen
                if (rr.Width >= 250 && rr.Width <= 520 && rr.Height >= 24 && rr.Height <= 40)
                {
                    if (name.Contains(" Läuft")) s.Anchors.Add(new Anchor(AnchorKind.Running, rr));
                    else if (name.Contains("Ungelesene Antwort")) s.Anchors.Add(new Anchor(AnchorKind.Unread, rr));
                    else if (name.Contains("Warte auf Eingabe")) s.Anchors.Add(new Anchor(AnchorKind.Waiting, rr));
                }
            }
            if (!edit.IsEmpty)
            {
                Rectangle u = edit;
                int cy = edit.Top + edit.Height / 2;
                foreach (Rectangle p in parts)
                {
                    int py = p.Top + p.Height / 2;
                    if (Math.Abs(py - cy) < 90 && p.Left > edit.Left - 200 && p.Right < edit.Right + 200)
                        u = Rectangle.Union(u, p);
                }
                u.Inflate(14, 12);
                s.Input = u;
            }
            else s.Working = false;
            return s;
        }
    }

    public class OverlayForm : Form
    {
        const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80,
                  WS_EX_NOACTIVATE = 0x8000000, WS_EX_TOPMOST = 0x8;
        const int WM_HOTKEY = 0x312, GWLP_HWNDPARENT = -8, DWMWA_EXTENDED_FRAME_BOUNDS = 9;

        static readonly Color[] Palette = {
            Color.FromArgb(255, 255, 92, 205),   // pink
            Color.FromArgb(255, 120, 230, 255),  // cyan
            Color.FromArgb(255, 200, 255, 140),  // lime
            Color.FromArgb(255, 190, 150, 255),  // lavendel
            Color.FromArgb(255, 255, 92, 205)
        };

        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly Stopwatch clock = Stopwatch.StartNew();
        readonly Random rnd = new Random();
        readonly List<Sparkle> sparkles = new List<Sparkle>();
        readonly NotifyIcon tray = new NotifyIcon();
        readonly string pulseFile;
        DateTime lastPulse = DateTime.MinValue;
        double lastPulseCheck, lastFind, lastTime;

        IntPtr target = IntPtr.Zero;
        IntPtr memDC = IntPtr.Zero, dib = IntPtr.Zero, oldObj = IntPtr.Zero, bits = IntPtr.Zero;
        Bitmap canvas; int cw, ch;

        bool showOverlay = true, showSparkles = true, showScanlines = false, showBadge = true;
        bool showInputGlow = true, showSessionMarks = true, showFrame = true, showHeaderIcons = true;
        string badgePos = "oben-mitte"; // oben-mitte, oben-links, unten-mitte, unten-links
        string settingsFile; DateTime lastSettings = DateTime.MinValue; double lastSettingsCheck = -10;

        // Uebergaenge: fade laeuft weich auf 1 (sichtbar) oder 0 (aus); Beenden blendet erst aus.
        float fade = 0f;
        bool wasShown, quitting;
        double quitAt;
        string commandFile, aliveFile;
        DateTime lastCommand = DateTime.MinValue;

        // Pixel-Banner in der Chat-Mitte (Raster vom Mod in banner.txt: '#' Pixel, '.' leer)
        readonly List<Rocket> rockets = new List<Rocket>();
        readonly List<FireSpark> fireSparks = new List<FireSpark>();
        readonly List<double> launchQueue = new List<double>();
        bool showFireworks;
        double fireworkEvery = 45, nextAutoFirework = 20;
        float fireworkAmount = 1f, bubbleAmount = 1f; // 1 = 100 %
        bool showBubbles;
        int bubbleBurstLeft;
        readonly List<Bubble> bubbles = new List<Bubble>();
        readonly List<Sparkle> pops = new List<Sparkle>(); // kurze Ringe beim Platzen (X, Y, Size = Radius)

        List<string> bannerRows = new List<string>();
        double bannerStart = -100, bannerUntil = -100;
        bool bannerBurst;
        double lastAlive = -10;
        bool hiddenNow = true;

        readonly AnchorScanner scanner = new AnchorScanner();
        Scan scan = new Scan();
        bool wasWorking;
        int originX, originY;

        public OverlayForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Bounds = new Rectangle(-10, -10, 1, 1);
            Text = "Y2K-Overlay";

            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "y2k-overlay");
            try { Directory.CreateDirectory(dir); } catch { }
            pulseFile = Path.Combine(dir, "pulse");
            settingsFile = Path.Combine(dir, "settings.json");
            commandFile = Path.Combine(dir, "command");
            aliveFile = Path.Combine(dir, "alive");
            // Was beim Start schon in der Warteschlange steht, ist alt und wird uebersprungen.
            try
            {
                if (File.Exists(commandFile))
                {
                    lastCommand = File.GetLastWriteTimeUtc(commandFile);
                    foreach (KeyValuePair<long, string[]> entry in ParseQueue(commandFile)) lastSeq = Math.Max(lastSeq, entry.Key);
                }
            }
            catch { }
            try { if (File.Exists(pulseFile)) lastPulse = File.GetLastWriteTimeUtc(pulseFile); } catch { }

            BuildTray();
            timer.Interval = 40;
            timer.Tick += delegate
            {
                // Ein Fehler beim Zeichnen darf das Overlay nicht anhalten; er landet einmal je Meldung in error.log.
                try { Tick(); }
                catch (Exception ex) { LogError(ex); }
            };
        }

        readonly HashSet<string> loggedErrors = new HashSet<string>();

        void LogError(Exception ex)
        {
            string key = ex.GetType().Name + ex.Message;
            if (!loggedErrors.Add(key)) return;
            try
            {
                string file = Path.Combine(Path.GetDirectoryName(pulseFile), "error.log");
                File.AppendAllText(file, DateTime.Now.ToString("s") + " " + ex + Environment.NewLine + Environment.NewLine);
            }
            catch { }
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
                cp.ExStyle &= ~WS_EX_TOPMOST;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.RegisterHotKey(Handle, 1, 0x1 | 0x2 | 0x4000, (uint)'Y'); // Strg+Alt+Y, ohne Wiederholung
            scanner.Start();
            timer.Start();
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY) { ToggleOverlay(); return; }
            base.WndProc(ref m);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            timer.Stop();
            scanner.Stop();
            try { File.Delete(aliveFile); } catch { }
            Native.UnregisterHotKey(Handle, 1);
            tray.Visible = false; tray.Dispose();
            FreeCanvas();
            base.OnFormClosed(e);
        }

        // ---------- Taskleisten-Symbol ----------

        void BuildTray()
        {
            using (Bitmap b = new Bitmap(32, 32))
            using (Graphics g = Graphics.FromImage(b))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (LinearGradientBrush br = new LinearGradientBrush(new Rectangle(0, 0, 32, 32), Palette[0], Palette[1], 45f))
                    g.FillEllipse(br, 2, 2, 28, 28);
                DrawStar(g, 16, 16, 11, Color.White, 255);
                IntPtr hIcon = b.GetHicon();
                tray.Icon = (Icon)Icon.FromHandle(hIcon).Clone();
                Native.DestroyIcon(hIcon);
            }
            tray.Text = "Y2K-Overlay (Strg+Alt+Y)";
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add(MakeToggle("Overlay anzeigen (Strg+Alt+Y)", delegate { return showOverlay; }, delegate { ToggleOverlay(); }));
            menu.Items.Add(MakeToggle("Chrom-Rahmen", delegate { return showFrame; }, delegate { showFrame = !showFrame; }));
            menu.Items.Add(MakeToggle("Glitzer", delegate { return showSparkles; }, delegate { showSparkles = !showSparkles; }));
            menu.Items.Add(MakeToggle("Scanlines", delegate { return showScanlines; }, delegate { showScanlines = !showScanlines; }));
            menu.Items.Add(MakeToggle("Namensschild", delegate { return showBadge; }, delegate { showBadge = !showBadge; }));
            menu.Items.Add(MakeToggle("Leuchten ums Eingabefeld, während Claude arbeitet", delegate { return showInputGlow; }, delegate { showInputGlow = !showInputGlow; }));
            menu.Items.Add(MakeToggle("Sterne an Sitzungen in der Seitenleiste", delegate { return showSessionMarks; }, delegate { showSessionMarks = !showSessionMarks; }));
            menu.Items.Add(MakeToggle("Eigene Symbole in der Kopfleiste", delegate { return showHeaderIcons; }, delegate { showHeaderIcons = !showHeaderIcons; }));
            menu.Items.Add(new ToolStripMenuItem("Glitzer-Regen testen", null, delegate { Burst(); }));
            menu.Items.Add(new ToolStripMenuItem("Feuerwerk zünden", null, delegate { QueueFireworks(); }));
            menu.Items.Add(new ToolStripMenuItem("Seifenblasen pusten", null, delegate { bubbleBurstLeft += (int)(30 * bubbleAmount) + 5; }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Beenden", null, delegate { BeginQuit(); }));
            menu.Opening += delegate
            {
                foreach (ToolStripItem it in menu.Items)
                {
                    ToolStripMenuItem mi = it as ToolStripMenuItem;
                    if (mi != null && mi.Tag is Func<bool>) mi.Checked = ((Func<bool>)mi.Tag)();
                }
            };
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { ToggleOverlay(); };
            tray.Visible = true;
        }

        ToolStripMenuItem MakeToggle(string text, Func<bool> state, Action toggle)
        {
            ToolStripMenuItem mi = new ToolStripMenuItem(text);
            mi.Tag = state;
            mi.Click += delegate { toggle(); };
            return mi;
        }

        // Einstellungen aus der Y2K-Einstellungsleiste des Mods (~/.claude/y2k-overlay/settings.json).
        // Nur bei Aenderung der Datei; Schalter im Taskleisten-Menue gelten bis zur naechsten Aenderung.
        void ReadSettings()
        {
            try
            {
                if (!File.Exists(settingsFile)) return;
                DateTime t = File.GetLastWriteTimeUtc(settingsFile);
                if (t == lastSettings) return;
                lastSettings = t;
                string json = File.ReadAllText(settingsFile);
                showOverlay = Flag(json, "aktiv", showOverlay);
                showFrame = Flag(json, "rahmen", showFrame);
                showSparkles = Flag(json, "glitzer", showSparkles);
                showScanlines = Flag(json, "scanlines", showScanlines);
                showBadge = Flag(json, "schild", showBadge);
                System.Text.RegularExpressions.Match pm = System.Text.RegularExpressions.Regex.Match(
                    json, "\"schildpos\"\\s*:\\s*\"([a-z-]+)\"");
                if (pm.Success) badgePos = pm.Groups[1].Value;
                showInputGlow = Flag(json, "eingabe", showInputGlow);
                showSessionMarks = Flag(json, "sitzungen", showSessionMarks);
                showHeaderIcons = Flag(json, "kopfleiste", showHeaderIcons);
                bool fw = Flag(json, "feuerwerk", showFireworks);
                if (fw && !showFireworks) nextAutoFirework = clock.Elapsed.TotalSeconds + 2; // gleich eins zur Begruessung
                showFireworks = fw;
                System.Text.RegularExpressions.Match fm = System.Text.RegularExpressions.Regex.Match(json, "\"feuerwerkalle\"\\s*:\\s*(\\d+)");
                if (fm.Success) fireworkEvery = Math.Max(5, int.Parse(fm.Groups[1].Value));
                showBubbles = Flag(json, "seifenblasen", showBubbles);
                fireworkAmount = Percent(json, "feuerwerkmenge", fireworkAmount);
                bubbleAmount = Percent(json, "blasenmenge", bubbleAmount);
            }
            catch { }
        }

        // Prozentwert (z. B. "feuerwerkmenge": 150) als Faktor, begrenzt auf 10 % bis 400 %
        static float Percent(string json, string key, float fallback)
        {
            System.Text.RegularExpressions.Match m = System.Text.RegularExpressions.Regex.Match(json, "\"" + key + "\"\\s*:\\s*(\\d+)");
            return m.Success ? Math.Max(0.1f, Math.Min(4f, int.Parse(m.Groups[1].Value) / 100f)) : fallback;
        }

        static bool Flag(string json, string key, bool fallback)
        {
            System.Text.RegularExpressions.Match m = System.Text.RegularExpressions.Regex.Match(
                json, "\"" + key + "\"\\s*:\\s*(true|false)");
            return m.Success ? m.Groups[1].Value == "true" : fallback;
        }

        void ToggleOverlay()
        {
            showOverlay = !showOverlay; // das Aus- und Einblenden uebernimmt Tick ueber fade
        }

        // Beenden mit Abschied: Glitzer-Schwall, ausblenden, dann schliessen.
        void BeginQuit()
        {
            if (quitting) return;
            quitting = true;
            quitAt = clock.Elapsed.TotalSeconds + (hiddenNow ? 0.0 : 1.1);
            if (!hiddenNow) Burst();
        }

        // Befehle aus der Einstellungsleiste (~/.claude/y2k-overlay/command): "quit"
        // Warteschlange: jede Zeile "<nummer> <befehl> [werte]"; abgearbeitet wird jede Zeile,
        // deren Nummer groesser ist als die zuletzt gesehene, in aufsteigender Reihenfolge.
        long lastSeq = -1;

        static List<KeyValuePair<long, string[]>> ParseQueue(string path)
        {
            List<KeyValuePair<long, string[]>> list = new List<KeyValuePair<long, string[]>>();
            if (!File.Exists(path)) return list;
            foreach (string raw in File.ReadAllLines(path))
            {
                string[] parts = raw.Trim().Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                long seq;
                if (parts.Length >= 2 && long.TryParse(parts[0], out seq)) list.Add(new KeyValuePair<long, string[]>(seq, parts));
            }
            list.Sort(delegate (KeyValuePair<long, string[]> a, KeyValuePair<long, string[]> b) { return a.Key.CompareTo(b.Key); });
            return list;
        }

        void ReadCommand()
        {
            try
            {
                if (!File.Exists(commandFile)) return;
                DateTime t = File.GetLastWriteTimeUtc(commandFile);
                if (t == lastCommand) return;
                lastCommand = t;
                foreach (KeyValuePair<long, string[]> entry in ParseQueue(commandFile))
                {
                    if (entry.Key <= lastSeq) continue;
                    lastSeq = entry.Key;
                    RunCommand(entry.Value);
                }
            }
            catch (Exception ex) { LogError(ex); }
        }

        void RunCommand(string[] parts)
        {
            string cmd = parts[1];
            double n = clock.Elapsed.TotalSeconds;
            if (cmd == "quit") BeginQuit();
            else if (cmd == "feuerwerk") QueueFireworks();
            else if (cmd == "blasen") bubbleBurstLeft += (int)(30 * bubbleAmount) + 5;
            else if (cmd == "banner-aus") { if (bannerUntil > n + 0.5) bannerUntil = n + 0.5; }
            else if (cmd == "banner")
            {
                // "<nr> banner <sekunden> <reihe|reihe|...>"; 0 Sekunden = bleibt, bis "banner-aus" kommt
                double secs = 7;
                if (parts.Length >= 3) double.TryParse(parts[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out secs);
                if (parts.Length >= 4) bannerRows = new List<string>(parts[3].Split('|'));
                else
                {
                    string file = Path.Combine(Path.GetDirectoryName(commandFile), "banner.txt");
                    if (File.Exists(file)) bannerRows = new List<string>(File.ReadAllLines(file));
                }
                bannerStart = n;
                bannerUntil = secs <= 0 ? double.MaxValue : n + secs;
                bannerBurst = true;
            }
        }

        // ---------- Claude-Fenster verfolgen ----------

        IntPtr FindClaude()
        {
            foreach (Process p in Process.GetProcessesByName("claude"))
            {
                try
                {
                    IntPtr h = p.MainWindowHandle;
                    if (h != IntPtr.Zero && Native.IsWindowVisible(h)) return h;
                }
                catch { }
            }
            return IntPtr.Zero;
        }

        void Tick()
        {
            double now = clock.Elapsed.TotalSeconds;
            double dt = Math.Min(0.2, now - lastTime);
            lastTime = now;

            // Lebenszeichen fuer die Einstellungsleiste: "laeuft" solange diese Datei frisch ist
            if (now - lastAlive > 1.0)
            {
                lastAlive = now;
                try { File.WriteAllText(aliveFile, Process.GetCurrentProcess().Id + "\n"); } catch { }
            }

            if (now - lastSettingsCheck > 1.0)
            {
                lastSettingsCheck = now;
                ReadSettings();
            }

            if (now - lastPulseCheck > 0.5)
            {
                lastPulseCheck = now;
                ReadCommand();
                try
                {
                    if (File.Exists(pulseFile))
                    {
                        DateTime t = File.GetLastWriteTimeUtc(pulseFile);
                        if (t != lastPulse) { lastPulse = t; Burst(); }
                    }
                }
                catch { }
            }

            if (quitting && now >= quitAt) { Close(); return; }

            if (target == IntPtr.Zero || !Native.IsWindow(target))
            {
                target = IntPtr.Zero;
                if (now - lastFind > 1.0)
                {
                    lastFind = now;
                    target = FindClaude();
                    if (target != IntPtr.Zero) Native.SetWindowLongPtr(Handle, GWLP_HWNDPARENT, target);
                    scanner.SetTarget(target);
                }
                if (target == IntPtr.Zero) { HideOverlay(); return; }
            }

            if (Native.IsIconic(target) || !Native.IsWindowVisible(target)) { HideOverlay(); return; }

            // Weich ein- und ausblenden; beim Ein- und Ausschalten ein Glitzer-Schwall
            bool wantVisible = showOverlay && !quitting;
            float speed = (float)dt / 0.45f;
            fade = wantVisible ? Math.Min(1f, fade + speed) : Math.Max(0f, fade - speed);
            if (wantVisible && !wasShown) { Burst(); wasShown = true; }
            else if (!wantVisible && wasShown) { if (!quitting) Burst(); wasShown = false; }
            if (fade <= 0f) { HideOverlay(); return; }

            Native.RECT r;
            if (Native.DwmGetWindowAttribute(target, DWMWA_EXTENDED_FRAME_BOUNDS, out r, Marshal.SizeOf(typeof(Native.RECT))) != 0)
                Native.GetWindowRect(target, out r);
            int w = r.Right - r.Left, h = r.Bottom - r.Top;
            if (w < 40 || h < 40) { HideOverlay(); return; }

            float scale = Math.Max(1f, Native.GetDpiForWindow(target) / 96f);
            originX = r.Left; originY = r.Top;
            scan = scanner.Latest;
            // Antwort fertig: der Stopp-Knopf ist verschwunden -> Glitzer am Eingabefeld
            if (wasWorking && !scan.Working && !scan.Input.IsEmpty && showInputGlow) BurstAround(Local(scan.Input), scale);
            wasWorking = scan.Working;
            EnsureCanvas(w, h);
            Step((float)dt, w, h, scale);
            StepFireworks((float)dt, now, w, h, scale);
            StepBubbles((float)dt, w, h, scale);
            Render((float)now, w, h, scale, Native.IsZoomed(target));
            Present(r.Left, r.Top, w, h, (byte)(255 * fade));
            hiddenNow = false;
        }

        void HideOverlay()
        {
            if (hiddenNow) return;
            hiddenNow = true;
            if (canvas != null)
            {
                using (Graphics g = Graphics.FromImage(canvas)) g.Clear(Color.Transparent);
                Present(-10, -10, cw, ch, 0);
            }
        }

        // ---------- Zeichenflaeche (DIB mit Alpha pro Pixel) ----------

        void EnsureCanvas(int w, int h)
        {
            if (canvas != null && w == cw && h == ch) return;
            FreeCanvas();
            Native.BITMAPINFOHEADER bi = new Native.BITMAPINFOHEADER();
            bi.biSize = Marshal.SizeOf(typeof(Native.BITMAPINFOHEADER));
            bi.biWidth = w; bi.biHeight = -h; bi.biPlanes = 1; bi.biBitCount = 32;
            IntPtr screen = Native.GetDC(IntPtr.Zero);
            memDC = Native.CreateCompatibleDC(screen);
            dib = Native.CreateDIBSection(screen, ref bi, 0, out bits, IntPtr.Zero, 0);
            Native.ReleaseDC(IntPtr.Zero, screen);
            oldObj = Native.SelectObject(memDC, dib);
            canvas = new Bitmap(w, h, w * 4, PixelFormat.Format32bppPArgb, bits);
            cw = w; ch = h;
        }

        void FreeCanvas()
        {
            if (canvas != null) { canvas.Dispose(); canvas = null; }
            if (memDC != IntPtr.Zero) { Native.SelectObject(memDC, oldObj); Native.DeleteDC(memDC); memDC = IntPtr.Zero; }
            if (dib != IntPtr.Zero) { Native.DeleteObject(dib); dib = IntPtr.Zero; }
        }

        void Present(int x, int y, int w, int h, byte alpha)
        {
            Native.POINT dst = new Native.POINT(x, y), src = new Native.POINT(0, 0);
            Native.SIZE size = new Native.SIZE(w, h);
            Native.BLENDFUNCTION bf = new Native.BLENDFUNCTION();
            bf.BlendOp = 0; bf.SourceConstantAlpha = alpha; bf.AlphaFormat = 1; // AC_SRC_ALPHA
            IntPtr screen = Native.GetDC(IntPtr.Zero);
            Native.UpdateLayeredWindow(Handle, screen, ref dst, ref size, memDC, ref src, 0, ref bf, 2); // ULW_ALPHA
            Native.ReleaseDC(IntPtr.Zero, screen);
        }

        // ---------- Glitzer ----------

        void Spawn(int w, int h, float scale, bool anywhereNearEdge)
        {
            Sparkle s = new Sparkle();
            float band = (anywhereNearEdge ? 60f : 22f) * scale;
            switch (rnd.Next(4))
            {
                case 0: s.X = (float)rnd.NextDouble() * w; s.Y = (float)rnd.NextDouble() * band; break;
                case 1: s.X = (float)rnd.NextDouble() * w; s.Y = h - (float)rnd.NextDouble() * band; break;
                case 2: s.X = (float)rnd.NextDouble() * band; s.Y = (float)rnd.NextDouble() * h; break;
                default: s.X = w - (float)rnd.NextDouble() * band; s.Y = (float)rnd.NextDouble() * h; break;
            }
            s.Size = (4f + (float)rnd.NextDouble() * 7f) * scale;
            s.Life = 0.8f + (float)rnd.NextDouble() * 1.6f;
            s.Tint = Palette[rnd.Next(4)];
            sparkles.Add(s);
        }

        int burstLeft;
        void Burst() { burstLeft = 70; }

        // ---------- Feuerwerk ----------

        // Eine Salve: 4 bis 6 Raketen, leicht versetzt
        void QueueFireworks()
        {
            double n = clock.Elapsed.TotalSeconds;
            int count = Math.Max(1, (int)Math.Round((4 + rnd.Next(3)) * fireworkAmount));
            for (int i = 0; i < count; i++) launchQueue.Add(n + i * (0.25 + rnd.NextDouble() * 0.35));
        }

        void LaunchRocket(int w, int h)
        {
            Rocket r = new Rocket();
            r.X = w * (0.15f + (float)rnd.NextDouble() * 0.7f);
            r.Y = h + 10;
            r.BurstY = h * (0.18f + (float)rnd.NextDouble() * 0.3f);
            // Startgeschwindigkeit so, dass die Rakete etwa an BurstY den Scheitel erreicht
            float g = h * 0.9f;
            r.VY = -(float)Math.Sqrt(2 * g * (r.Y - r.BurstY)) * 1.02f;
            r.VX = (float)(rnd.NextDouble() - 0.5) * w * 0.08f;
            r.Tint = Palette[rnd.Next(4)];
            rockets.Add(r);
        }

        void Explode(Rocket r, int h, float scale)
        {
            int n = 60 + rnd.Next(40);
            bool ring = rnd.NextDouble() < 0.35;
            Color second = Palette[rnd.Next(4)];
            for (int i = 0; i < n; i++)
            {
                double ang = (i / (double)n) * Math.PI * 2 + rnd.NextDouble() * 0.1;
                float speed = h * (ring ? 0.32f : 0.12f + (float)rnd.NextDouble() * 0.26f);
                FireSpark s = new FireSpark();
                s.X = s.PX = r.X; s.Y = s.PY = r.Y;
                s.VX = (float)Math.Cos(ang) * speed; s.VY = (float)Math.Sin(ang) * speed;
                s.Life = 1.1f + (float)rnd.NextDouble() * 0.9f;
                s.Size = (1.6f + (float)rnd.NextDouble() * 1.4f) * scale;
                s.Tint = rnd.NextDouble() < 0.25 ? Color.White : (rnd.NextDouble() < 0.7 ? r.Tint : second);
                s.Twinkle = rnd.NextDouble() < 0.4;
                fireSparks.Add(s);
            }
        }

        void StepFireworks(float dt, double now, int w, int h, float scale)
        {
            if (showFireworks && now >= nextAutoFirework)
            {
                QueueFireworks();
                // mehr Menge = auch oefter
                nextAutoFirework = now + fireworkEvery / Math.Max(0.5, Math.Sqrt(fireworkAmount));
            }
            for (int i = launchQueue.Count - 1; i >= 0; i--)
                if (now >= launchQueue[i]) { LaunchRocket(w, h); launchQueue.RemoveAt(i); }

            float g = h * 0.9f;
            for (int i = rockets.Count - 1; i >= 0; i--)
            {
                Rocket r = rockets[i];
                r.VY += g * dt; r.X += r.VX * dt; r.Y += r.VY * dt;
                if (r.VY >= -h * 0.04f || r.Y <= r.BurstY) { Explode(r, h, scale); rockets.RemoveAt(i); }
            }
            float drag = (float)Math.Exp(-dt * 1.6);
            for (int i = fireSparks.Count - 1; i >= 0; i--)
            {
                FireSpark s = fireSparks[i];
                s.Age += dt;
                if (s.Age >= s.Life) { fireSparks.RemoveAt(i); continue; }
                s.PX = s.X; s.PY = s.Y;
                s.VX *= drag; s.VY = s.VY * drag + h * 0.32f * dt;
                s.X += s.VX * dt; s.Y += s.VY * dt;
            }
        }

        // ---------- Seifenblasen ----------

        void SpawnBubble(int w, int h, float scale)
        {
            Bubble b = new Bubble();
            b.X0 = w * (0.05f + (float)rnd.NextDouble() * 0.9f);
            b.R = (10f + (float)rnd.NextDouble() * 28f) * scale;
            b.Y = h + b.R;
            b.VY = -h * (0.06f + (float)rnd.NextDouble() * 0.08f);
            b.Phase = (float)(rnd.NextDouble() * Math.PI * 2);
            b.Sway = (8f + (float)rnd.NextDouble() * 22f) * scale;
            b.Life = 5f + (float)rnd.NextDouble() * 7f;
            bubbles.Add(b);
        }

        void StepBubbles(float dt, int w, int h, float scale)
        {
            // Grundmenge: im Schnitt eine Blase alle 1,6 Sekunden, mal Menge
            if (showBubbles && bubbles.Count < 60 && rnd.NextDouble() < dt * 0.6 * bubbleAmount) SpawnBubble(w, h, scale);
            for (int i = 0; i < 2 && bubbleBurstLeft > 0; i++, bubbleBurstLeft--) SpawnBubble(w, h, scale);
            for (int i = bubbles.Count - 1; i >= 0; i--)
            {
                Bubble b = bubbles[i];
                b.Age += dt; b.Y += b.VY * dt;
                if (b.Age >= b.Life || b.Y < -b.R * 2)
                {
                    if (b.Y > 0)
                    {
                        Sparkle p = new Sparkle();
                        p.X = b.X(b.Age); p.Y = b.Y; p.Size = b.R; p.Life = 0.35f; p.Tint = Palette[rnd.Next(4)];
                        pops.Add(p);
                    }
                    bubbles.RemoveAt(i);
                }
            }
            for (int i = pops.Count - 1; i >= 0; i--) { pops[i].Age += dt; if (pops[i].Age >= pops[i].Life) pops.RemoveAt(i); }
        }

        void DrawBubbles(Graphics g, double now)
        {
            foreach (Bubble b in bubbles)
            {
                float x = b.X(b.Age), r = b.R;
                float k = Math.Min(1f, b.Age / 0.6f) * Math.Min(1f, (b.Life - b.Age) / 0.4f + 0.3f);
                RectangleF box = new RectangleF(x - r, b.Y - r, r * 2, r * 2);
                // zarte Fuellung mit Regenbogen-Schimmer
                using (GraphicsPath gp = new GraphicsPath())
                {
                    gp.AddEllipse(box);
                    using (PathGradientBrush pb = new PathGradientBrush(gp))
                    {
                        pb.CenterColor = Color.FromArgb((int)(8 * k), 255, 255, 255);
                        pb.SurroundColors = new Color[] { Color.FromArgb((int)(70 * k), Palette[(int)(b.Phase * 2) % 4]) };
                        g.FillPath(pb, gp);
                    }
                }
                // irisierender Rand
                using (LinearGradientBrush rb = new LinearGradientBrush(new RectangleF(box.X - 1, box.Y - 1, box.Width + 2, box.Height + 2),
                    Color.FromArgb((int)(200 * k), Palette[1]), Color.FromArgb((int)(200 * k), Palette[0]), (float)(now * 40 + b.Phase * 57) % 360f))
                using (Pen p = new Pen(rb, Math.Max(1f, r * 0.07f)))
                    g.DrawEllipse(p, box);
                // Glanzlicht oben links
                using (Pen hl = new Pen(Color.FromArgb((int)(220 * k), 255, 255, 255), Math.Max(1.2f, r * 0.12f)))
                {
                    hl.StartCap = LineCap.Round; hl.EndCap = LineCap.Round;
                    g.DrawArc(hl, x - r * 0.62f, b.Y - r * 0.62f, r * 1.24f, r * 1.24f, 200, 50);
                }
                using (SolidBrush dot = new SolidBrush(Color.FromArgb((int)(200 * k), 255, 255, 255)))
                    g.FillEllipse(dot, x + r * 0.28f, b.Y + r * 0.3f, r * 0.14f, r * 0.14f);
            }
            foreach (Sparkle p in pops)
            {
                float t = p.Age / p.Life, rr = p.Size * (1f + t * 0.8f);
                using (Pen pen = new Pen(Color.FromArgb((int)(200 * (1 - t)), p.Tint), 1.5f))
                {
                    pen.DashStyle = DashStyle.Dash;
                    g.DrawEllipse(pen, p.X - rr, p.Y - rr, rr * 2, rr * 2);
                }
            }
        }

        void DrawFireworks(Graphics g, double now, float scale)
        {
            foreach (Rocket r in rockets)
            {
                using (Pen trail = new Pen(Color.FromArgb(150, r.Tint), 2f * scale))
                    g.DrawLine(trail, r.X, r.Y, r.X - r.VX * 0.05f, r.Y - r.VY * 0.05f);
                using (SolidBrush head = new SolidBrush(Color.White))
                    g.FillEllipse(head, r.X - 2 * scale, r.Y - 2 * scale, 4 * scale, 4 * scale);
            }
            foreach (FireSpark s in fireSparks)
            {
                float k = 1f - s.Age / s.Life;
                if (s.Twinkle && ((int)(now * 18 + s.X) % 3 == 0)) k *= 0.25f;
                int a = (int)(255 * Math.Min(1f, k * 1.4f));
                if (a <= 4) continue;
                using (Pen streak = new Pen(Color.FromArgb(a, s.Tint), s.Size))
                {
                    streak.StartCap = LineCap.Round; streak.EndCap = LineCap.Round;
                    // Schweif: von der vorigen Position aus, etwas verlaengert
                    g.DrawLine(streak, s.X, s.Y, s.PX - (s.X - s.PX) * 1.5f, s.PY - (s.Y - s.PY) * 1.5f);
                }
                using (SolidBrush glow = new SolidBrush(Color.FromArgb(a / 4, s.Tint)))
                    g.FillEllipse(glow, s.X - s.Size * 2, s.Y - s.Size * 2, s.Size * 4, s.Size * 4);
            }
        }

        Rectangle Local(Rectangle screen) { return new Rectangle(screen.X - originX, screen.Y - originY, screen.Width, screen.Height); }

        // Glitzer auf dem Rand eines Rechtecks (z. B. ums Eingabefeld)
        void SpawnAround(RectangleF a, float scale)
        {
            Sparkle s = new Sparkle();
            float p = (float)rnd.NextDouble() * 2 * (a.Width + a.Height);
            if (p < a.Width) { s.X = a.X + p; s.Y = a.Y; }
            else if (p < a.Width + a.Height) { s.X = a.Right; s.Y = a.Y + p - a.Width; }
            else if (p < 2 * a.Width + a.Height) { s.X = a.Right - (p - a.Width - a.Height); s.Y = a.Bottom; }
            else { s.X = a.X; s.Y = a.Bottom - (p - 2 * a.Width - a.Height); }
            s.X += (float)(rnd.NextDouble() - 0.5) * 10 * scale;
            s.Y += (float)(rnd.NextDouble() - 0.5) * 10 * scale;
            s.Size = (4f + (float)rnd.NextDouble() * 6f) * scale;
            s.Life = 0.6f + (float)rnd.NextDouble() * 1.2f;
            s.Tint = Palette[rnd.Next(4)];
            sparkles.Add(s);
        }

        void BurstAround(Rectangle a, float scale)
        {
            for (int i = 0; i < 45; i++) SpawnAround(a, scale);
        }

        bool CoveredByMenu(Rectangle screen)
        {
            foreach (Anchor m in scan.Anchors)
                if (m.Kind == AnchorKind.Menu && m.Rect.IntersectsWith(screen)) return true;
            return false;
        }

        void Step(float dt, int w, int h, float scale)
        {
            for (int i = sparkles.Count - 1; i >= 0; i--)
            {
                sparkles[i].Age += dt;
                if (sparkles[i].Age >= sparkles[i].Life) sparkles.RemoveAt(i);
            }
            if (showSparkles && sparkles.Count < 16 && rnd.NextDouble() < 0.25) Spawn(w, h, scale, false);
            for (int i = 0; i < 6 && burstLeft > 0; i++, burstLeft--) Spawn(w, h, scale, true);
            if (showInputGlow && scan.Working && !scan.Input.IsEmpty && sparkles.Count < 40 && rnd.NextDouble() < 0.35)
                SpawnAround(Local(scan.Input), scale);
        }

        // ---------- Zeichnen ----------

        static GraphicsPath RoundRect(RectangleF r, float rad)
        {
            GraphicsPath p = new GraphicsPath();
            if (rad <= 0.5f) { p.AddRectangle(r); return p; }
            float d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        static void DrawStar(Graphics g, float cx, float cy, float size, Color c, int alpha)
        {
            float t = size * 0.22f;
            PointF[] pts = {
                new PointF(cx, cy - size), new PointF(cx + t, cy - t), new PointF(cx + size, cy), new PointF(cx + t, cy + t),
                new PointF(cx, cy + size), new PointF(cx - t, cy + t), new PointF(cx - size, cy), new PointF(cx - t, cy - t)
            };
            using (SolidBrush b = new SolidBrush(Color.FromArgb(alpha, c))) g.FillPolygon(b, pts);
        }

        LinearGradientBrush ChromeBrush(int w, int h, float now, int alpha)
        {
            LinearGradientBrush br = new LinearGradientBrush(new Rectangle(0, 0, w, h), Color.White, Color.White, (now * 35f) % 360f);
            ColorBlend cb = new ColorBlend(Palette.Length);
            Color[] cols = new Color[Palette.Length];
            float[] pos = new float[Palette.Length];
            for (int i = 0; i < Palette.Length; i++)
            {
                cols[i] = Color.FromArgb(alpha, Palette[i]);
                pos[i] = i / (float)(Palette.Length - 1);
            }
            cb.Colors = cols; cb.Positions = pos;
            br.InterpolationColors = cb;
            return br;
        }

        // ---------- Symbole der Kopfleiste ----------

        // Glyphe im 24er-Raster (wie die meisten Symbolsaetze), als Linienzug
        static GraphicsPath Glyph(string kind)
        {
            GraphicsPath p = new GraphicsPath();
            switch (kind)
            {
                case "menu":
                    p.AddLine(6, 7, 18, 7); p.StartFigure(); p.AddLine(6, 12, 18, 12); p.StartFigure(); p.AddLine(6, 17, 18, 17);
                    break;
                case "sidebar":
                    p.AddPath(RoundRect(new RectangleF(5, 6, 14, 12), 2.5f), false); p.StartFigure(); p.AddLine(10, 6.5f, 10, 17.5f);
                    break;
                case "back":
                    p.AddLines(new PointF[] { new PointF(14, 7), new PointF(9, 12), new PointF(14, 17) });
                    break;
                case "forward":
                    p.AddLines(new PointF[] { new PointF(10, 7), new PointF(15, 12), new PointF(10, 17) });
                    break;
                case "list":
                    for (int i = 0; i < 3; i++)
                    {
                        float y = 7 + i * 5;
                        p.StartFigure(); p.AddEllipse(6.2f, y - 0.8f, 1.6f, 1.6f);
                        p.StartFigure(); p.AddLine(10, y, 18, y);
                    }
                    break;
                case "terminal":
                    p.AddLines(new PointF[] { new PointF(6, 8), new PointF(10, 12), new PointF(6, 16) });
                    p.StartFigure(); p.AddLine(12, 16.5f, 18, 16.5f);
                    break;
                case "diff":
                    p.AddPath(RoundRect(new RectangleF(5, 5, 14, 14), 3f), false);
                    p.StartFigure(); p.AddLine(12, 7.5f, 12, 11.5f);
                    p.StartFigure(); p.AddLine(10, 9.5f, 14, 9.5f);
                    p.StartFigure(); p.AddLine(10, 15, 14, 15);
                    break;
                case "globe":
                    p.AddEllipse(5, 5, 14, 14); p.StartFigure(); p.AddEllipse(9, 5, 6, 14);
                    p.StartFigure(); p.AddLine(5, 12, 19, 12);
                    break;
                case "folder":
                    p.AddPolygon(new PointF[] { new PointF(4.5f, 7.5f), new PointF(9.5f, 7.5f), new PointF(11, 9.5f),
                        new PointF(19.5f, 9.5f), new PointF(19.5f, 17.5f), new PointF(4.5f, 17.5f) });
                    break;
                case "dots":
                    for (int i = 0; i < 3; i++) { p.StartFigure(); p.AddEllipse(5.2f + i * 6, 11.2f, 1.6f, 1.6f); }
                    break;
                case "min":
                    p.AddLine(7, 12, 17, 12);
                    break;
                case "max":
                    p.AddRectangle(new RectangleF(7, 7, 10, 10));
                    break;
                case "restore":
                    p.AddRectangle(new RectangleF(6, 9, 9, 9));
                    p.StartFigure(); p.AddLines(new PointF[] { new PointF(9, 9), new PointF(9, 6), new PointF(18, 6), new PointF(18, 15), new PointF(15, 15) });
                    break;
                case "close":
                    p.AddLine(7, 7, 17, 17); p.StartFigure(); p.AddLine(17, 7, 7, 17);
                    break;
            }
            return p;
        }

        // Chromperlen-Chip: deckt das Original-Symbol ab, Klicks gehen trotzdem an den Knopf darunter
        void DrawHeaderIcon(Graphics g, IconAnchor ic, bool hover, float now, float scale)
        {
            Rectangle r = ic.Rel;
            bool caption = ic.Kind == "min" || ic.Kind == "max" || ic.Kind == "restore" || ic.Kind == "close";
            // Knapp so gross wie das Original-Symbol, damit es verdeckt ist, aber nicht wuchtig wirkt
            float side = caption ? Math.Min(Math.Min(r.Width, r.Height) * 0.6f, 20f * scale)
                                 : Math.Min(Math.Min(r.Width, r.Height) * 0.84f, 22f * scale);
            float cx = r.X + r.Width / 2f, cy = r.Y + r.Height / 2f;
            RectangleF chip = new RectangleF(cx - side / 2f, cy - side / 2f, side, side);
            float rad = side * 0.32f;

            Color top = hover ? Color.FromArgb(255, 78, 36, 118) : Color.FromArgb(255, 46, 24, 76);
            Color bottom = hover ? Color.FromArgb(255, 42, 16, 74) : Color.FromArgb(255, 22, 12, 40);
            if (hover && ic.Kind == "close") { top = Color.FromArgb(255, 236, 30, 128); bottom = Color.FromArgb(255, 150, 10, 84); }

            using (GraphicsPath p = RoundRect(chip, rad))
            {
                using (LinearGradientBrush bg = new LinearGradientBrush(chip, top, bottom, 90f)) g.FillPath(bg, p);
                // Glanzlicht in der oberen Haelfte
                RectangleF gl = new RectangleF(chip.X + side * 0.12f, chip.Y + side * 0.07f, side * 0.76f, side * 0.4f);
                using (GraphicsPath gp = RoundRect(gl, side * 0.18f))
                using (LinearGradientBrush gb = new LinearGradientBrush(new RectangleF(gl.X, gl.Y - 1, gl.Width, gl.Height + 2),
                    Color.FromArgb(hover ? 90 : 60, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 90f))
                    g.FillPath(gb, gp);
                // irisierender Rand, dreht sich langsam
                using (LinearGradientBrush rb = new LinearGradientBrush(new RectangleF(chip.X - 1, chip.Y - 1, chip.Width + 2, chip.Height + 2),
                    Palette[0], Palette[1], (now * 60f + r.X) % 360f))
                using (Pen rp = new Pen(rb, (hover ? 1.3f : 0.9f) * scale))
                    g.DrawPath(rp, p);
            }

            float u = side / 24f;
            Color ink = ic.Enabled ? Color.White : Color.FromArgb(120, 190, 175, 215);
            Color glow = hover ? Palette[1] : Palette[0];
            using (GraphicsPath gl = Glyph(ic.Kind))
            using (Matrix m = new Matrix())
            {
                m.Translate(chip.X, chip.Y); m.Scale(u, u);
                gl.Transform(m);
                if (ic.Enabled)
                {
                    using (Pen gp = new Pen(Color.FromArgb(hover ? 140 : 70, glow), 3.6f * u))
                    {
                        gp.LineJoin = LineJoin.Round; gp.StartCap = LineCap.Round; gp.EndCap = LineCap.Round;
                        g.DrawPath(gp, gl);
                    }
                }
                using (Pen ip = new Pen(ink, 1.9f * u))
                {
                    ip.LineJoin = LineJoin.Round; ip.StartCap = LineCap.Round; ip.EndCap = LineCap.Round;
                    g.DrawPath(ip, gl);
                }
            }
        }

        // ---------- Pixel-Banner ----------

        // Farbe je Reihe innerhalb einer Textzeile (0-6): oben weiss, dann Eisblau, Elektroblau, unten Pink
        static readonly Color[] BannerRamp = {
            Color.FromArgb(255, 255, 255, 255), Color.FromArgb(255, 205, 235, 255), Color.FromArgb(255, 140, 200, 255),
            Color.FromArgb(255, 90, 140, 255), Color.FromArgb(255, 70, 90, 235), Color.FromArgb(255, 150, 70, 230),
            Color.FromArgb(255, 235, 70, 190)
        };

        static Color Shade(Color c, float k, int alpha)
        {
            return Color.FromArgb(alpha, (int)(c.R * k), (int)(c.G * k), (int)(c.B * k));
        }

        void DrawBanner(Graphics g, float now, int w, int h, float scale)
        {
            if (bannerRows.Count == 0 || now > bannerUntil) return;
            int rows = bannerRows.Count, cols = 0;
            foreach (string r in bannerRows) cols = Math.Max(cols, r.Length);
            if (cols == 0) return;

            // Mitte des Chat-Bereichs: ueber dem Eingabefeld, sonst Fenstermitte
            float chatCx = w / 2f, chatW = w * 0.7f;
            if (!scan.Input.IsEmpty)
            {
                Rectangle li = Local(scan.Input);
                chatCx = li.X + li.Width / 2f;
                chatW = Math.Min(w, Math.Max(li.Width * 1.6f, w * 0.45f));
            }
            float cell = Math.Min(14f * scale, chatW * 0.9f / (cols + 4));
            cell = (float)Math.Max(3, Math.Floor(cell));
            float bw = cols * cell, bh = rows * cell;
            float bx = chatCx - bw / 2f, by = h * 0.38f - bh / 2f;

            // Ein- und Ausblenden; Pixel erscheinen in einem Wisch von links nach rechts
            float age = (float)(now - bannerStart);
            float a = Math.Min(1f, age / 0.35f);
            if (bannerUntil != double.MaxValue) a = Math.Min(a, (float)Math.Max(0, (bannerUntil - now) / 0.5));
            float sweep = Math.Min(1f, age / 0.7f) * (cols + 6) - 3;
            int A = (int)(255 * a);
            if (A <= 0) return;

            RectangleF panel = new RectangleF(bx - cell * 2, by - cell * 2, bw + cell * 4.5f, bh + cell * 4.5f);
            if (bannerBurst) { BurstAround(Rectangle.Round(panel), scale); bannerBurst = false; }
            using (GraphicsPath pp = RoundRect(panel, cell * 1.5f))
            {
                using (SolidBrush bg = new SolidBrush(Color.FromArgb((int)(225 * a), 10, 6, 22))) g.FillPath(bg, pp);
                using (LinearGradientBrush br = ChromeBrush(w, h, now * 2f, (int)(230 * a)))
                using (Pen p = new Pen(br, 2f * scale)) g.DrawPath(p, pp);
            }

            float sub = cell / 2f;
            // Schatten zuerst (rechts unten versetzt), dann die Pixel mit Verlauf und Dither wie bei ANSI-Kunst
            for (int pass = 0; pass < 2; pass++)
            {
                for (int r = 0; r < rows; r++)
                {
                    string row = bannerRows[r];
                    int inLine = r % 8;
                    Color baseC = BannerRamp[Math.Min(6, inLine)];
                    for (int c = 0; c < row.Length; c++)
                    {
                        if (row[c] != '#' || c > sweep) continue;
                        float x = bx + c * cell, y = by + r * cell;
                        if (pass == 0)
                        {
                            using (SolidBrush sb = new SolidBrush(Color.FromArgb((int)(200 * a), 70, 20, 120)))
                                g.FillRectangle(sb, x + cell * 0.45f, y + cell * 0.45f, cell, cell);
                            continue;
                        }
                        // 2x2 Unterfelder: im Schachbrett heller und dunkler, unten staerker (wie ▓ und ▒)
                        for (int sy = 0; sy < 2; sy++)
                            for (int sx = 0; sx < 2; sx++)
                            {
                                bool dark = ((c * 2 + sx + r * 2 + sy) % 2) == 1;
                                float k = !dark ? 1f : inLine <= 1 ? 0.92f : inLine <= 4 ? 0.72f : 0.55f;
                                using (SolidBrush pb = new SolidBrush(Shade(baseC, k, A)))
                                    g.FillRectangle(pb, x + sx * sub, y + sy * sub, sub + 0.5f, sub + 0.5f);
                            }
                        // Glanzkante oben an jeder Form
                        if (r == 0 || bannerRows[r - 1].Length <= c || bannerRows[r - 1][c] != '#')
                            using (SolidBrush hl = new SolidBrush(Color.FromArgb((int)(170 * a), 255, 255, 255)))
                                g.FillRectangle(hl, x, y, cell, Math.Max(1f, cell * 0.18f));
                    }
                }
            }
        }

        void Render(float now, int w, int h, float scale, bool maximized)
        {
            using (Graphics g = Graphics.FromImage(canvas))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.AntiAlias;
                g.CompositingQuality = CompositingQuality.HighSpeed;

                float rad = maximized ? 0f : 8f * scale;

                if (showScanlines)
                {
                    using (Pen sl = new Pen(Color.FromArgb(14, 0, 0, 0), 1f))
                        for (int y = 0; y < h; y += 3) g.DrawLine(sl, 0, y, w, y);
                }

                // Leuchtender Chrom-Rahmen: aussen kraeftig, nach innen verblassend
                float edge = 3f * scale;
                for (int i = 6; i >= 0 && showFrame; i--)
                {
                    int a = i == 0 ? 235 : (int)(70 * Math.Pow(0.62, i));
                    float inset = edge * 0.5f + i * 2f * scale;
                    using (LinearGradientBrush br = ChromeBrush(w, h, now, a))
                    using (Pen p = new Pen(br, i == 0 ? edge : 2f * scale))
                    using (GraphicsPath path = RoundRect(new RectangleF(inset, inset, w - 2 * inset, h - 2 * inset), Math.Max(0, rad - inset * 0.3f)))
                        g.DrawPath(p, path);
                }
                // feiner weisser Glanz
                if (showFrame)
                using (Pen shine = new Pen(Color.FromArgb(120, 255, 255, 255), Math.Max(1f, scale)))
                using (GraphicsPath path = RoundRect(new RectangleF(edge + 0.5f, edge + 0.5f, w - 2 * edge - 1, h - 2 * edge - 1), Math.Max(0, rad - edge)))
                    g.DrawPath(shine, path);

                Rectangle win = new Rectangle(originX, originY, w, h);

                // Eingabefeld: kreisender Chrom-Ring, solange Claude arbeitet
                if (showInputGlow && scan.Working && !scan.Input.IsEmpty && win.IntersectsWith(scan.Input) && !CoveredByMenu(scan.Input))
                {
                    // am Fensterrand abschneiden: der Bereich schliesst die Modellzeile ganz unten mit ein
                    Rectangle clipped = Rectangle.Intersect(scan.Input, Rectangle.Inflate(win, -(int)(4 * scale), -(int)(4 * scale)));
                    Rectangle li = Local(clipped);
                    float pulse = 0.65f + 0.35f * (float)Math.Sin(now * 4.0);
                    float ir = 14f * scale;
                    for (int i = 5; i >= 0; i--)
                    {
                        int a = i == 0 ? (int)(255 * pulse) : (int)(90 * pulse * Math.Pow(0.6, i));
                        float grow = i * 2.5f * scale;
                        RectangleF rr = new RectangleF(li.X - grow, li.Y - grow, li.Width + 2 * grow, li.Height + 2 * grow);
                        using (LinearGradientBrush br = ChromeBrush(w, h, now * 4f, a))
                        using (Pen p = new Pen(br, i == 0 ? 2.5f * scale : 2.5f * scale))
                        using (GraphicsPath gp = RoundRect(rr, ir + grow))
                            g.DrawPath(p, gp);
                    }
                }

                // Sitzungen in der Seitenleiste: Sterne je nach Status
                if (showSessionMarks)
                {
                    foreach (Anchor an in scan.Anchors)
                    {
                        if (an.Kind == AnchorKind.Menu || !win.Contains(an.Rect) || CoveredByMenu(an.Rect)) continue;
                        Rectangle la = Local(an.Rect);
                        float cx = la.Right - 44f * scale, cy = la.Y + la.Height / 2f;
                        if (an.Kind == AnchorKind.Running)
                        {
                            // kreiselnder Stern, Farbe wandert durch die Palette
                            float spin = (float)(now * 2.5 + an.Rect.Y * 0.01);
                            Color c = Palette[(int)(now * 2 + an.Rect.Y) % 4];
                            float sz = 7f * scale;
                            using (SolidBrush glow = new SolidBrush(Color.FromArgb(70, c)))
                                g.FillEllipse(glow, cx - sz, cy - sz, sz * 2, sz * 2);
                            GraphicsState st = g.Save();
                            g.TranslateTransform(cx, cy); g.RotateTransform(spin * 57.3f);
                            DrawStar(g, 0, 0, sz, c, 255);
                            DrawStar(g, 0, 0, sz * 0.5f, Color.White, 255);
                            g.Restore(st);
                        }
                        else if (an.Kind == AnchorKind.Unread)
                        {
                            // pinker, pulsierender Punkt
                            float k = 0.5f + 0.5f * (float)Math.Sin(now * 5 + an.Rect.Y);
                            float sz = (4f + 2.5f * k) * scale;
                            using (SolidBrush glow = new SolidBrush(Color.FromArgb((int)(60 + 60 * k), Palette[0])))
                                g.FillEllipse(glow, cx - sz * 1.8f, cy - sz * 1.8f, sz * 3.6f, sz * 3.6f);
                            using (SolidBrush dot = new SolidBrush(Palette[0]))
                                g.FillEllipse(dot, cx - sz * 0.8f, cy - sz * 0.8f, sz * 1.6f, sz * 1.6f);
                        }
                        else if (an.Kind == AnchorKind.Waiting)
                        {
                            // gelber, blinkender Stern: wartet auf dich
                            float k = (float)Math.Abs(Math.Sin(now * 3 + an.Rect.Y));
                            Color yel = Color.FromArgb(255, 255, 214, 60);
                            DrawStar(g, cx, cy, (5f + 3f * k) * scale, yel, (int)(120 + 135 * k));
                            DrawStar(g, cx, cy, (2.5f + 1.5f * k) * scale, Color.White, (int)(120 + 135 * k));
                        }
                    }
                }

                // Eigene Y2K-Symbole ueber den Knoepfen der Kopfleiste
                if (showHeaderIcons && scan.Icons.Count > 0)
                {
                    Native.POINT cur; Native.GetCursorPos(out cur);
                    Point mouse = new Point(cur.X - originX, cur.Y - originY);
                    foreach (IconAnchor ic in scan.Icons)
                    {
                        Rectangle screenRect = new Rectangle(ic.Rel.X + originX, ic.Rel.Y + originY, ic.Rel.Width, ic.Rel.Height);
                        if (ic.Rel.Right > w || ic.Rel.Bottom > h || ic.Rel.X < 0 || ic.Rel.Y < 0 || CoveredByMenu(screenRect)) continue;
                        DrawHeaderIcon(g, ic, ic.Rel.Contains(mouse), now, scale);
                    }
                }

                DrawBubbles(g, now);
                DrawFireworks(g, now, scale);
                DrawBanner(g, now, w, h, scale);

                // Glitzer
                foreach (Sparkle s in sparkles)
                {
                    float k = (float)Math.Sin(Math.PI * s.Age / s.Life);
                    int a = (int)(255 * k);
                    float sz = s.Size * (0.6f + 0.4f * k);
                    using (SolidBrush glow = new SolidBrush(Color.FromArgb((int)(70 * k), s.Tint)))
                        g.FillEllipse(glow, s.X - sz * 0.9f, s.Y - sz * 0.9f, sz * 1.8f, sz * 1.8f);
                    DrawStar(g, s.X, s.Y, sz, s.Tint, a);
                    DrawStar(g, s.X, s.Y, sz * 0.55f, Color.White, a);
                }

                // Namensschild unten links
                if (showBadge)
                {
                    using (Font f = new Font("Segoe UI Semibold", 11f * scale, FontStyle.Regular, GraphicsUnit.Pixel))
                    {
                        string label = "✧ Y2K OVERLAY ✧";
                        SizeF ts = g.MeasureString(label, f);
                        // Position aus der Einstellungsleiste; oben Mitte liegt kein Bedienelement
                        float bh = ts.Height + 4f * scale, bw = ts.Width + 14f * scale;
                        float bx = (w - bw) / 2f, by = 10f * scale;
                        if (badgePos == "unten-links") { bx = 14f * scale; by = h - bh - 12f * scale; }
                        else if (badgePos == "unten-mitte") { by = h - bh - 6f * scale; }
                        else if (badgePos == "oben-links") { bx = 200f * scale; }
                        float bob = (float)Math.Sin(now * 2.2) * 1.5f * scale;
                        RectangleF pill = new RectangleF(bx, by + bob, bw, bh);
                        using (GraphicsPath pp = RoundRect(pill, bh / 2))
                        {
                            using (LinearGradientBrush br = ChromeBrush(w, h, now * 3f, 255)) g.FillPath(br, pp);
                            using (Pen p = new Pen(Color.FromArgb(220, 255, 255, 255), Math.Max(1f, scale))) g.DrawPath(p, pp);
                        }
                        using (SolidBrush shadow = new SolidBrush(Color.FromArgb(110, 60, 0, 90)))
                            g.DrawString(label, f, shadow, bx + 7f * scale + 1, by + bob + 2f * scale + 1);
                        using (SolidBrush tb = new SolidBrush(Color.White))
                            g.DrawString(label, f, tb, bx + 7f * scale, by + bob + 2f * scale);
                    }
                }
            }
        }
    }

    public static class App
    {
        public static void Run()
        {
            bool created;
            using (Mutex m = new Mutex(true, "Local\\Y2KOverlayForClaude", out created))
            {
                if (!created) { MessageBox.Show("Das Y2K-Overlay laeuft schon (Symbol im Infobereich).", "Y2K-Overlay"); return; }
                try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
                try { Native.SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
                Application.EnableVisualStyles();
                Application.Run(new OverlayForm());
            }
        }
    }
}