// Y2K-Icons für die Zeilen der Tool-Aufrufe: eine kleine Chrom-Folien-Perle
// mit weißem Zeichen je Werkzeug. Läuft der Aufruf, pulsiert ein Schein,
// bei einem Fehler bekommt die Perle einen roten Rand.

type Kind = 'shell' | 'edit' | 'read' | 'search' | 'web' | 'agent' | 'other'

const KIND: Record<string, Kind> = {
  Bash: 'shell',
  PowerShell: 'shell',
  Edit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Read: 'read',
  Grep: 'search',
  Glob: 'search',
  ToolSearch: 'search',
  WebSearch: 'web',
  WebFetch: 'web',
  Agent: 'agent',
  Task: 'agent',
  Skill: 'agent',
  Workflow: 'agent',
}

export const kindOf = (tool: string): Kind => {
  if (KIND[tool] !== undefined) {
    return KIND[tool]
  }
  if (/browser|navigate|page|web/i.test(tool)) {
    return 'web'
  }

  return 'other'
}

// Zeichen im 24er-Raster, weiß mit dunkler Kontur, damit sie auf der hellen Perle stehen.
const GLYPH: Record<Kind, string> = {
  shell: '<path d="M7.5 9l3.2 3-3.2 3"/><path d="M12.5 15.5h4"/>',
  edit: '<path d="M8 16.5l1-3.4 6.2-6.2 2.4 2.4-6.2 6.2z"/><path d="M13.8 8.3l2.4 2.4"/>',
  read: '<path d="M8 6.8h6l2.5 2.5v8H8z"/><path d="M10 11.5h4.5M10 14h4.5"/>',
  search: '<circle cx="11" cy="11" r="3.6"/><path d="M13.7 13.7l3.3 3.3"/>',
  web: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="2.2" ry="5"/><path d="M7 12h10"/>',
  agent: '<path d="M12 6.5c.5 3 1.6 4.4 4.6 5.5-3 1.1-4.1 2.5-4.6 5.5-.5-3-1.6-4.4-4.6-5.5 3-1.1 4.1-2.5 4.6-5.5z"/>',
  other: '<circle cx="12" cy="12" r="2.6"/>',
}

export const iconSvg = (tool: string, isRunning: boolean, isErrored: boolean) => {
  const glyph = GLYPH[kindOf(tool)]
  const rim = isErrored ? '#ff2d3c' : '#ffffff'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
<style>
.halo{transform-box:fill-box;transform-origin:center;animation:p 1.6s ease-in-out infinite}
@keyframes p{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:.9;transform:scale(1.1)}}
</style>
<defs>
<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#ffc6ec"/><stop offset=".47" stop-color="#e25db6"/><stop offset=".53" stop-color="#6e1453"/><stop offset=".62" stop-color="#9b7bff"/><stop offset=".85" stop-color="#9ff2ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<radialGradient id="h"><stop offset="0" stop-color="#ff6ad5" stop-opacity=".9"/><stop offset="1" stop-color="#ff6ad5" stop-opacity="0"/></radialGradient>
<radialGradient id="s" cx=".42" cy=".36" r=".68"><stop offset=".66" stop-color="#1a1030" stop-opacity="0"/><stop offset="1" stop-color="#1a1030" stop-opacity=".45"/></radialGradient>
</defs>
${isRunning ? '<circle class="halo" cx="12" cy="12" r="12" fill="url(#h)"/>' : ''}
<circle cx="12" cy="12" r="9.5" fill="url(#e)"/>
<circle cx="12" cy="12" r="9.5" fill="url(#s)"/>
<ellipse cx="9" cy="7.2" rx="3.6" ry="1.6" transform="rotate(-24 9 7.2)" fill="#ffffff" opacity=".85"/>
<circle cx="12" cy="12" r="9.5" fill="none" stroke="${rim}" stroke-opacity="${isErrored ? 1 : 0.7}" stroke-width="${isErrored ? 1.6 : 0.8}"/>
<g fill="none" stroke="#3a0a2c" stroke-opacity=".55" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
<g fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`
}

// Übersicht aller Icons für die Vorschau (render.py).
export const ICON_SHEET = (['Bash', 'Edit', 'Read', 'Grep', 'WebSearch', 'Agent', 'Unbekannt'] as const)
  .map(t => ({ tool: t, idle: iconSvg(t, false, false), running: iconSvg(t, true, false), error: iconSvg(t, false, true) }))
