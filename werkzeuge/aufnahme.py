"""Nimmt das echte Claude-Fenster auf, als MP4 und GIF.

Aufruf:  python -I aufnahme.py <name> [sekunden]
Ergebnis in docs/bilder/: <name>-app.mp4, <name>-app.gif, <name>-app.png (Standbild aus der Mitte)

Achtung: Aufgenommen wird der Bildschirmbereich, in dem das Fenster liegt, also alles,
was dort gerade zu sehen ist (auch andere Sitzungen und Eingaben). Das Fenster muss
sichtbar und darf nicht verdeckt sein. Die Aufnahme über den Fenstertitel liefert bei
der App nur Schwarz (Grafikkarten-Darstellung), deshalb der Bildschirmbereich.
"""

import ctypes
import ctypes.wintypes as wt
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'bilder'
FFMPEG = Path.home() / 'AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe'

user32 = ctypes.windll.user32


def claude_window() -> tuple[int, int, int, int]:
    """Sucht das sichtbare Hauptfenster mit dem Titel „Claude“ und liefert (x, y, breite, höhe)."""
    user32.SetProcessDPIAware()
    found: list[int] = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def visit(hwnd, _):
        if user32.IsWindowVisible(hwnd) and not user32.IsIconic(hwnd):
            buf = ctypes.create_unicode_buffer(256)
            user32.GetWindowTextW(hwnd, buf, 256)
            if buf.value == 'Claude':
                found.append(hwnd)
        return True

    user32.EnumWindows(visit, 0)
    if not found:
        sys.exit('Kein sichtbares Fenster „Claude“ gefunden (minimiert?).')
    r = wt.RECT()
    user32.GetWindowRect(found[0], ctypes.byref(r))
    w = (r.right - r.left) // 2 * 2
    h = (r.bottom - r.top) // 2 * 2
    return r.left, r.top, w, h


def run(*args: str) -> None:
    subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else 'aufnahme'
    secs = sys.argv[2] if len(sys.argv) > 2 else '8'
    OUT.mkdir(parents=True, exist_ok=True)
    x, y, w, h = claude_window()
    print(f'Fenster: {w}x{h} bei {x},{y}')
    mp4 = OUT / f'{name}-app.mp4'
    run('-f', 'gdigrab', '-framerate', '20', '-offset_x', str(x), '-offset_y', str(y),
        '-video_size', f'{w}x{h}', '-t', secs, '-i', 'desktop',
        '-vf', 'scale=1600:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', str(mp4))
    gif = OUT / f'{name}-app.gif'
    run('-i', str(mp4), '-vf',
        'fps=12,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a',
        str(gif))
    run('-ss', str(float(secs) / 2), '-i', str(mp4), '-frames:v', '1', str(OUT / f'{name}-app.png'))
    print('Fertig:', mp4.name, gif.name, f'{gif.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
