"""Baut das weitergebbare Paket des Y2K-Looks als ZIP.

Aufruf:  python -I paket.py
Ergebnis: _paket/Y2K-Look_v<version>.zip (ältere ZIPs dort werden ersetzt)

Inhalt (Ordner Y2K-Look/ im ZIP):
  .claude-plugin/marketplace.json   eigener Marktplatz „y2k-look“, damit er bei anderen nicht kollidiert
  y2k/                              das Plugin (ohne die von Claude erzeugten Typdateien)
  docs/                             ENTWICKLUNG, UPDATELOG, BACKLOG, ZIEL und die Bilder der aktuellen Version
  werkzeuge/                        render.py, aufnahme.py
  README.md
"""

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_paket'


def main() -> None:
    manifest = json.loads((ROOT / 'y2k' / '.claude-plugin' / 'plugin.json').read_text(encoding='utf-8'))
    version = manifest['version']
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('Y2K-Look_*.zip'):
        old.unlink()
    zpath = OUT / f'Y2K-Look_v{version}.zip'
    base = 'Y2K-Look'
    market = {
        'name': 'y2k-look',
        'owner': {'name': manifest.get('author', {}).get('name', 'unbekannt')},
        'plugins': [{'name': 'y2k', 'source': './y2k', 'description': manifest['description']}],
    }
    bilder = ROOT / 'docs' / 'bilder'
    latest = sorted(bilder.glob(f'v{version}-*'))
    if not latest:
        raise SystemExit(f'Keine Bilder für v{version} in docs/bilder – erst render.py {version} laufen lassen.')

    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'{base}/.claude-plugin/marketplace.json', json.dumps(market, ensure_ascii=False, indent=2) + '\n')
        for f in sorted((ROOT / 'y2k').rglob('*')):
            rel = f.relative_to(ROOT / 'y2k')
            if f.is_dir() or rel.parts[:2] == ('.claude-plugin', 'types') or rel.name == 'tsconfig.json':
                continue
            z.write(f, f'{base}/y2k/{rel.as_posix()}')
        for name in ('ENTWICKLUNG.md', 'UPDATELOG.md', 'BACKLOG.md', 'ZIEL.md'):
            z.write(ROOT / 'docs' / name, f'{base}/docs/{name}')
        for f in latest:
            z.write(f, f'{base}/docs/bilder/{f.name}')
        for mode in ('dunkel', 'hell'):
            src = bilder / f'v{version}-{mode}-ui.png'
            if src.exists():
                z.write(src, f'{base}/docs/bilder/vorschau-{mode}.png')
        for name in ('render.py', 'aufnahme.py'):
            z.write(ROOT / 'werkzeuge' / name, f'{base}/werkzeuge/{name}')
        z.write(ROOT / 'README.md', f'{base}/README.md')

    print(zpath, f'{zpath.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
