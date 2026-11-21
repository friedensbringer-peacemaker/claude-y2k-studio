"""Rendert die Y2K-Szene als Standbilder und Zeitraffer-GIF.

Aufruf:  python -I render.py <version>
Ergebnis in docs/bilder/:
  <version>-dunkel.png, <version>-hell.png        Szene allein, 1600x900
  <version>-dunkel-ui.png, <version>-hell-ui.png  mit nachgestellter Chat-Oberfläche (Milchglas)
  <version>-dunkel.gif                            Zeitraffer der Animationen, 800x450

Die Szene kommt aus y2k/hooks/scene.ts (mit tsc nach JavaScript übersetzt).
Gerendert wird mit Edge headless; die Animationszeit setzt ein kleines Skript
über die Web-Animations-API, damit jedes Bild einen festen Zeitpunkt zeigt.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCENE_TS = ROOT / 'y2k' / 'hooks' / 'scene.ts'
ICONS_TS = ROOT / 'y2k' / 'hooks' / 'icons.ts'
OUT = ROOT / 'docs' / 'bilder'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

DARK_SWITCH = '@media (prefers-color-scheme: dark){'

# Nachgestellte Oberfläche: Seitenleiste, Gesprächsspalte, Eingabefeld, alles als Milchglas
# mit den Werten aus dem Look (blur 22, Deckkraft 0.62).
UI = {
    'dunkel': {'panel': 'rgba(26,16,48,.62)', 'text': '#fbefff', 'muted': '#b9a2c8', 'accent': '#ff5cc8', 'code': 'rgba(20,11,34,.7)'},
    'hell': {'panel': 'rgba(240,233,243,.62)', 'text': '#1d1426', 'muted': '#5e5169', 'accent': '#c8127f', 'code': 'rgba(247,242,248,.75)'},
}


def glass_values() -> tuple[float, float]:
    """Liest blur und opacity aus dem Look in register.tsx, damit die Vorschau dem Mod folgt."""
    src = (ROOT / 'y2k' / 'hooks' / 'register.tsx').read_text(encoding='utf-8')
    m = re.search(r'glass:\s*\{\s*blur:\s*([\d.]+),\s*opacity:\s*([\d.]+)', src)
    return (float(m.group(1)), float(m.group(2))) if m else (16.0, 0.6)


def ui_overlay(mode: str) -> str:
    # Aufteilung wie in der echten App (Aufnahme v0.11.0-app): Seitenleiste ca. 190 px unter Milchglas,
    # der Gesprächsbereich daneben ohne Glas (Szene scharf), Text in einer Spalte von ca. 760 px.
    c = UI[mode]
    blur, opacity = glass_values()
    base = c['panel'].rsplit(',', 1)[0]
    glass = f'background:{base},{opacity});backdrop-filter:blur({blur}px);-webkit-backdrop-filter:blur({blur}px)'
    return f'''
<div style="position:fixed;left:0;top:0;bottom:0;width:190px;{glass};border-right:1px solid rgba(255,255,255,.08);font:13px Segoe UI;color:{c["muted"]};padding:18px 16px;box-sizing:border-box">
  <div style="margin:6px 0">+ Neu</div><div style="margin:6px 0">Suchen</div><div style="margin:6px 0 18px">Plugins</div>
  <div style="color:{c["text"]};margin:8px 0;padding:4px 8px;background:rgba(255,255,255,.08);border-radius:6px">Claude Skin</div>
  <div style="margin:8px 0;padding:0 8px">ComfyUI Studio</div><div style="margin:8px 0;padding:0 8px">Quest-Build prüfen</div><div style="margin:8px 0;padding:0 8px">Tower Table Balancing</div>
</div>

<div style="position:fixed;left:calc(190px + (100vw - 190px - 760px) / 2);top:40px;width:760px;font:15px/1.6 Segoe UI;color:{c["text"]}">
  <p style="margin:0 0 14px">Der <b style="color:{c["accent"]}">Y2K-Look</b> ist geladen. Chromkugeln, Ringe und Seifenblasen bewegen sich langsam im Hintergrund.</p>
  <p style="margin:0 0 14px;color:{c["muted"]}">Zweiter Absatz in gedämpfter Schrift, um den Kontrast über dem Hintergrund zu prüfen.</p>
  <pre style="background:{c["code"]};border-radius:10px;padding:14px 16px;font:13px/1.5 Cascadia Code,Consolas,monospace;margin:0;color:{c["text"]}"><span style="color:{c["accent"]}">export const</span> register = on =&gt; {{
  on(<span style="color:#3fbf3a">'session.start'</span>, async ($, e, next) =&gt; {{
    <span style="color:{c["accent"]}">await</span> $.theme.set(LOOK)
  }})
}}</pre>
</div>
<div style="position:fixed;left:calc(190px + (100vw - 190px - 760px) / 2);bottom:24px;width:760px;height:64px;background:{c["code"]};border:1px solid rgba(255,255,255,.12);border-radius:12px;font:14px Segoe UI;color:{c["muted"]};padding:14px 18px;box-sizing:border-box">Enter zum Senden …</div>'''


def page(svg: str, mode: str, with_ui: bool) -> str:
    if mode == 'dunkel':
        svg = svg.replace(DARK_SWITCH, '@media all{')
    else:
        svg = svg.replace(DARK_SWITCH, '@media (max-width:1px){')
    svg = svg.replace('<svg ', '<svg style="position:fixed;inset:0;width:100vw;height:100vh;display:block" ', 1)
    script = '''<script>
const t = Number(location.hash.slice(1) || 0) * 1000;
for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; }
</script>'''
    overlay = ui_overlay(mode) if with_ui else ''
    return f'<!doctype html><html><body style="margin:0;overflow:hidden">{svg}{overlay}{script}</body></html>'


def shot(html: Path, png: Path, t: float, w: int = 1600, h: int = 900) -> None:
    subprocess.run([
        EDGE, '--headless=new', '--hide-scrollbars', '--disable-gpu-vsync',
        f'--window-size={w},{h}', '--virtual-time-budget=1500',
        f'--screenshot={png}', f'{html.as_uri()}#{t}',
    ], check=True, capture_output=True)


def compile_scene(tmp: Path) -> str:
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    subprocess.run([npx, '-y', '-p', 'typescript@5.6.3', 'tsc', str(SCENE_TS), '--outDir', str(tmp),
                    '--target', 'es2022', '--module', 'es2022'], check=True, capture_output=True)
    js = tmp / 'scene.js'
    mjs = tmp / 'scene.mjs'
    js.replace(mjs)
    out = subprocess.run(['node', '-e', f'import({json.dumps(mjs.as_uri())}).then(m=>process.stdout.write(m.SCENE))'],
                         check=True, capture_output=True, text=True, encoding='utf-8')
    return out.stdout


def icon_sheet(tmp: Path) -> str:
    """Übersicht der Tool-Icons (ruhend, laufend, Fehler) auf dunklem und hellem Grund."""
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    subprocess.run([npx, '-y', '-p', 'typescript@5.6.3', 'tsc', str(ICONS_TS), '--outDir', str(tmp / 'ic'),
                    '--target', 'es2022', '--module', 'es2022'], check=True, capture_output=True)
    mjs = tmp / 'ic' / 'icons.mjs'
    (tmp / 'ic' / 'icons.js').replace(mjs)
    out = subprocess.run(['node', '-e', f'import({json.dumps(mjs.as_uri())}).then(m=>process.stdout.write(JSON.stringify(m.ICON_SHEET)))'],
                         check=True, capture_output=True, text=True, encoding='utf-8')
    sheet = json.loads(out.stdout)

    def big(svg: str) -> str:
        return svg.replace('width="24" height="24"', 'width="64" height="64"', 1)

    def row(bg: str, fg: str) -> str:
        cells = ''.join(f'<div style="text-align:center">{big(i["idle"])}{big(i["running"])}{big(i["error"])}<div>{i["tool"]}</div></div>' for i in sheet)
        return f'<div style="background:{bg};padding:18px 24px;display:flex;gap:28px;font:13px Segoe UI;color:{fg}">{cells}</div>'

    return f'<!doctype html><html><body style="margin:0">{row("#1a1030", "#e0c9ea")}{row("#f0e9f3", "#433651")}</body></html>'


def main() -> None:
    version = sys.argv[1] if len(sys.argv) > 1 else 'aktuell'
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        svg = compile_scene(tmp)
        print('Szene:', len(svg), 'Zeichen')
        for mode in ('dunkel', 'hell'):
            for with_ui in (False, True):
                html = tmp / f'{mode}-{int(with_ui)}.html'
                html.write_text(page(svg, mode, with_ui), encoding='utf-8')
                name = f'{version}-{mode}{"-ui" if with_ui else ""}.png'
                shot(html, OUT / name, 6)
                print('Bild:', name)
        # Moment, in dem der Lichtschimmer durchs Bild läuft (40-s-Zyklus, Durchlauf in den ersten 6 s).
        html = tmp / 'dunkel-1.html'
        shot(html, OUT / f'{version}-dunkel-ui-schimmer.png', 3.0)
        print('Bild:', f'{version}-dunkel-ui-schimmer.png')
        if ICONS_TS.exists():
            html = tmp / 'icons.html'
            html.write_text(icon_sheet(tmp), encoding='utf-8')
            shot(html, OUT / f'{version}-icons.png', 0.6, 1500, 400)
            print('Bild:', f'{version}-icons.png')
        # Zeitraffer: 30 Bilder im Abstand von 0,8 s, abgespielt mit 12 Bildern pro Sekunde.
        html = tmp / 'gif.html'
        html.write_text(page(svg, 'dunkel', False), encoding='utf-8')
        frames = []
        for i in range(30):
            png = tmp / f'f{i:02d}.png'
            shot(html, png, i * 0.8)
            frames.append(Image.open(png).convert('RGB').resize((800, 450), Image.LANCZOS))
        pal = frames[0].quantize(colors=255, method=Image.MEDIANCUT)
        q = [f.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for f in frames]
        gif = OUT / f'{version}-dunkel.gif'
        q[0].save(gif, save_all=True, append_images=q[1:], duration=83, loop=0, optimize=True)
        print('GIF:', gif.name, gif.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
