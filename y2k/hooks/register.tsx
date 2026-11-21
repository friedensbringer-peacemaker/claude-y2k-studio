import type { EngineInterface as Engine, Register, RenderChildren, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { iconSvg } from './icons.ts'
import { bannerAscii, bannerGrid } from './banner.ts'
import { DEFAULT_LABEL, DEFAULT_SWEEP, labelSvg, labelText, sceneFor, VERSION } from './scene.ts'
import type { SweepOptions } from './scene.ts'

// Y2K: Silber und Chrom bei Tag, tiefes Cyber-Indigo bei Nacht.
// Akzente: Elektroblau, Hot Pink, Limette, Sonnengelb.
const { theme, problems } = makeColors({
  label: 'Y2K Chrome',
  roles: { accent: '#e8189c', danger: '#ff2d3c', success: '#3fbf3a', warning: '#ffa800', pro: '#4f7bff' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#ebe3ee',
        'surface-1': '#f0e9f3',
        'surface-2': '#f7f2f8',
        'text-primary': '#1d1426',
        'text-secondary': '#433651',
        'text-muted': '#5e5169',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#140b22',
        'surface-1': '#1a1030',
        'surface-2': '#211538',
        'surface-3': '#281a42',
        'text-primary': '#fbefff',
        'text-secondary': '#e0c9ea',
        'text-muted': '#b9a2c8',
      },
    },
  },
})

// Die Version steckt im Namen: Die App zeichnet eine Szene nur neu, wenn sich ihr Name
// ändert. Sonst bliebe nach /reload-plugins die alte Szene stehen. Ob das Schild in der
// Szene steht, steckt aus demselben Grund mit im Namen (-schild / -leer).
const SCENE_PREFIX = 'y2k-chrome'
// Erlaubt sind nur Buchstaben, Ziffern, _ und - (höchstens 64 Zeichen), darum ohne Punkte.
const SCENE_BASE = `${SCENE_PREFIX}-${VERSION.replace(/[^A-Za-z0-9_-]/g, '_')}`

// ---------- Einstellungen ----------

// Farbmodus: 'auto' folgt der App, 'hell' und 'dunkel' halten den Look fest,
// 'aus' nimmt Farbschema und Hintergrund zurück (die App behält sie sonst auch ohne Plugin).
type Mode = 'auto' | 'hell' | 'dunkel' | 'aus'
type Place = 'unten-rechts' | 'ueber-eingabe' | 'aus'

// Was das Overlay (Windows-Programm in overlay/) zeigt; es liest ~/.claude/y2k-overlay/settings.json.
type OverlaySettings = {
  aktiv: boolean
  rahmen: boolean
  glitzer: boolean
  scanlines: boolean
  schild: boolean
  eingabe: boolean
  sitzungen: boolean
  kopfleiste: boolean
  feuerwerk: boolean
  seifenblasen: boolean
}

// Wo das Overlay sein Schild zeichnet.
type BadgePos = 'oben-mitte' | 'oben-links' | 'unten-mitte' | 'unten-links'

type Settings = {
  schild: Place
  schildpos: BadgePos
  bannerText: string
  // Befehlsübersicht in der Leiste aufgeklappt?
  hilfe: boolean
  sweep: SweepOptions
  feuerwerkAlle: number
  // Mengen in Prozent (100 = normal), 10 bis 400
  feuerwerkMenge: number
  blasenMenge: number
  icons: boolean
  puls: boolean
  overlay: OverlaySettings
}

const OVERLAY_DEFAULTS: OverlaySettings = {
  aktiv: true,
  rahmen: true,
  glitzer: true,
  scanlines: false,
  schild: true,
  eingabe: true,
  sitzungen: true,
  kopfleiste: true,
  feuerwerk: false,
  seifenblasen: false,
}

const OVERLAY_LABELS: Record<keyof OverlaySettings, string> = {
  aktiv: 'Overlay sichtbar',
  rahmen: 'Leuchtender Chrom-Rahmen ums Fenster',
  glitzer: 'Funkelnde Sterne am Fensterrand',
  scanlines: 'Röhrenmonitor-Linien (Scanlines)',
  schild: 'Schild „Y2K Overlay“ zeigen',
  eingabe: 'Eingabefeld leuchtet, solange Claude arbeitet',
  sitzungen: 'Status-Sterne an den Sitzungen links',
  kopfleiste: 'Chrom-Symbole in der Kopfleiste',
  feuerwerk: 'Startet von selbst',
  seifenblasen: 'Steigen von selbst auf',
}

const MODE_WORDS: Record<string, Mode> = {
  auto: 'auto',
  hell: 'hell',
  light: 'hell',
  dunkel: 'dunkel',
  dark: 'dunkel',
  aus: 'aus',
  off: 'aus',
}

const toMode = (saved: unknown): Mode => (saved === 'hell' || saved === 'dunkel' || saved === 'aus' ? saved : 'auto')
const toPlace = (saved: unknown, fallback: Place): Place =>
  saved === 'unten-rechts' || saved === 'ueber-eingabe' || saved === 'aus' ? saved : fallback
const toBool = (saved: unknown, fallback: boolean): boolean => (typeof saved === 'boolean' ? saved : fallback)
const toBadgePos = (saved: unknown): BadgePos =>
  saved === 'oben-links' || saved === 'unten-mitte' || saved === 'unten-links' ? saved : 'oben-mitte'

const PANE = 'y2k-einstellungen'
const PANE_TITLE = 'Y2K-Einstellungen'

// Voreinstellungen aus plugin.json (userConfig), in register gesetzt; was in der Leiste gewählt
// wird, gilt darüber. `settings` ist der aktuelle Stand: beim Start aus $.store gelesen, bei
// jeder Änderung dorthin geschrieben.
const DEFAULT_BANNER = 'Y2K Overlay'

let defaults: Settings = { schild: 'unten-rechts', schildpos: 'oben-mitte', bannerText: DEFAULT_BANNER, hilfe: true, sweep: DEFAULT_SWEEP, feuerwerkAlle: 45, feuerwerkMenge: 100, blasenMenge: 100, icons: true, puls: true, overlay: OVERLAY_DEFAULTS }
let settings: Settings = defaults

// Der Szenen-Name trägt alles, was die Szene ändert: Die App zeichnet nur bei neuem Namen neu.
function sceneName(place: Place, sweep: SweepOptions) {
  const label = place === 'unten-rechts' ? 'schild' : 'leer'

  return `${SCENE_BASE}-${label}-${sweep.on ? `w${sweep.every}d${sweep.duration}` : 'w0'}`
}

// Liest Schild und Streifen aus einem Szenen-Namen zurück (für den Backdrop-Hook).
function parseSceneName(name: string): { withLabel: boolean; sweep: SweepOptions } {
  const m = /-(schild|leer)(?:-w(\d+)(?:d(\d+))?)?$/.exec(name)

  if (m?.[2] === '0') {
    return { withLabel: m[1] !== 'leer', sweep: { ...DEFAULT_SWEEP, on: false } }
  }

  return {
    withLabel: m?.[1] !== 'leer',
    sweep: {
      on: true,
      every: Number(m?.[2] ?? DEFAULT_SWEEP.every),
      duration: Number(m?.[3] ?? DEFAULT_SWEEP.duration),
    },
  }
}

const SWEEP_EVERY = [15, 30, 40, 60, 120]
const SWEEP_DURATION = [3, 6, 10]
const FIREWORK_EVERY = [15, 30, 45, 90, 180]
const pick = (saved: unknown, allowed: number[], fallback: number) =>
  typeof saved === 'number' && allowed.includes(saved) ? saved : fallback
const clampPercent = (n: number) => Math.max(10, Math.min(400, Math.round(n / 5) * 5))
const toPercent = (saved: unknown, fallback: number) =>
  typeof saved === 'number' && Number.isFinite(saved) ? clampPercent(saved) : fallback
const AMOUNTS = [25, 50, 75, 100, 150, 200, 300]

// Auswahl für die Mengen; ein per Befehl gesetzter Zwischenwert (z. B. 225 %) erscheint mit.
const amountOptions = (current: number) =>
  [...new Set([...AMOUNTS, current])].sort((a, b) => a - b).map(n => ({ value: String(n), label: n === 100 ? '100 % (normal)' : `${n} %` }))

// "mehr", "weniger", "150%" oder "150" -> neue Menge in Prozent; sonst undefined
function parseAmount(word: string, current: number): number | undefined {
  if (word === 'mehr' || word === '+') {
    return clampPercent(current * 1.5)
  }
  if (word === 'weniger' || word === '-') {
    return clampPercent(current / 1.5)
  }
  if (word === 'normal') {
    return 100
  }
  const m = /^(\d{1,3})\s*%?$/.exec(word)

  return m?.[1] === undefined ? undefined : clampPercent(Number(m[1]))
}

function lookFor(mode: Exclude<Mode, 'aus'>, place: Place): ThemeSetArgs {
  const look: ThemeSetArgs = {
    colors: theme,
    backdrop: { scene: sceneName(place, settings.sweep), glass: { blur: 7, opacity: 0.55 } },
  }

  return mode === 'auto' ? look : { ...look, overrideColorScheme: mode === 'hell' ? 'light' : 'dark' }
}

async function loadSettings($: Engine) {
  const saved = await $.store.get('settings')
  const s = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<Record<string, unknown>>
  const ov = (typeof s.overlay === 'object' && s.overlay !== null ? s.overlay : {}) as Partial<Record<string, unknown>>
  const overlay = { ...OVERLAY_DEFAULTS }
  const sw = (typeof s.sweep === 'object' && s.sweep !== null ? s.sweep : {}) as Partial<Record<string, unknown>>

  for (const key of Object.keys(OVERLAY_DEFAULTS) as (keyof OverlaySettings)[]) {
    overlay[key] = toBool(ov[key], OVERLAY_DEFAULTS[key])
  }
  settings = {
    schild: toPlace(s.schild, defaults.schild),
    schildpos: toBadgePos(s.schildpos),
    bannerText: typeof s.bannerText === 'string' && s.bannerText.trim() !== '' ? s.bannerText : DEFAULT_BANNER,
    hilfe: toBool(s.hilfe, true),
    sweep: {
      on: toBool(sw.on, DEFAULT_SWEEP.on),
      every: pick(sw.every, SWEEP_EVERY, DEFAULT_SWEEP.every),
      duration: pick(sw.duration, SWEEP_DURATION, DEFAULT_SWEEP.duration),
    },
    feuerwerkAlle: pick(s.feuerwerkAlle, FIREWORK_EVERY, 45),
    feuerwerkMenge: toPercent(s.feuerwerkMenge, 100),
    blasenMenge: toPercent(s.blasenMenge, 100),
    icons: toBool(s.icons, defaults.icons),
    puls: toBool(s.puls, defaults.puls),
    overlay,
  }
}

// Ordner, den das Overlay beim Start anlegt; ohne ihn läuft kein Overlay und es gibt nichts zu melden.
async function overlayDir($: Engine) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

  return home === undefined ? undefined : `${home}/.claude/y2k-overlay`
}

async function writeOverlaySettings($: Engine) {
  try {
    const dir = await overlayDir($)

    if (dir !== undefined && (await $.fs.exists(dir))) {
      await $.fs.write(`${dir}/settings.json`, `${JSON.stringify({ ...settings.overlay, schildpos: settings.schildpos, feuerwerkalle: settings.feuerwerkAlle, feuerwerkmenge: settings.feuerwerkMenge, blasenmenge: settings.blasenMenge }, null, 2)}\n`)
    }
  } catch {
    // Das Overlay ist nur Deko: ein Fehler hier darf nichts anderes stören.
  }
}

async function pulseOverlay($: Engine) {
  try {
    const dir = await overlayDir($)

    if (dir !== undefined && (await $.fs.exists(dir))) {
      await $.fs.write(`${dir}/pulse`, `${Date.now()}\n`)
    }
  } catch {
    // Das Overlay ist nur Deko: ein Fehler hier darf keine Antwort stören.
  }
}

async function saveSettings($: Engine, change: (s: Settings) => Settings) {
  settings = change(settings)
  await $.store.set('settings', settings)
  await writeOverlaySettings($)
  $.ui.invalidate('ui.render')
}

async function applyMode($: Engine, mode: Mode) {
  await $.store.set('mode', mode)

  if (mode === 'aus') {
    await $.theme.clear()
  } else {
    await $.theme.set(lookFor(mode, settings.schild))
  }
  $.ui.invalidate('ui.render')
}

async function setSchild($: Engine, value: string) {
  await changeLook($, cur => ({ ...cur, schild: toPlace(value, cur.schild) }))
}

// Ändert etwas, das in der Szene steckt (Schild, Streifen), und setzt den Look neu.
async function changeLook($: Engine, change: (s: Settings) => Settings) {
  await saveSettings($, change)
  const mode = toMode(await $.store.get('mode'))

  if (mode !== 'aus') {
    await $.theme.set(lookFor(mode, settings.schild))
  }
}

// Windows: Overlay über PowerShell (C#, Windows Forms). Mac: start.sh baut das Swift-Overlay
// beim ersten Mal und startet es. Beide lösen sich vom Mod und laufen weiter, wenn die Sitzung endet.
async function overlayStartCommand($: Engine): Promise<string[] | undefined> {
  const root = $.plugin.root

  if ((await $.env.get('OS')) === 'Windows_NT') {
    const script = `${root}/overlay/Start-Y2KOverlay.ps1`.replace(/\//g, '\\')
    const inner = `Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-STA','-ExecutionPolicy','Bypass','-File','"${script}"'`

    return ['powershell.exe', '-NoProfile', '-Command', inner]
  }
  const { stdout } = await $.process.run(['uname', '-s'], { timeoutMs: 5000 })

  if (stdout.trim().toLowerCase() === 'darwin') {
    // Im Hintergrund, damit der erste Bau (swiftc, ca. 20–60 s) den Mod nicht aufhält.
    return ['/bin/sh', '-c', `/bin/sh "${root}/overlay/mac/start.sh" >/dev/null 2>&1 &`]
  }

  return undefined
}

async function startOverlay($: Engine) {
  try {
    const argv = await overlayStartCommand($)

    if (argv === undefined) {
      $.ui.toast('Das Overlay gibt es bisher nur für Windows und Mac.')

      return
    }
    const { exitCode, stderr } = await $.process.run(argv, { timeoutMs: 20000 })

    if (exitCode !== 0) {
      $.ui.toast(`Overlay ließ sich nicht starten: ${stderr.trim().slice(0, 160)}`)

      return
    }
    // Warten, bis das Overlay sein Lebenszeichen schreibt (der erste Start kompiliert; auf dem Mac länger).
    for (let i = 0; i < 240 && !(await isOverlayRunning($)); i++) {
      await $.clock.sleep(250)
    }
    // Das Overlay legt seinen Ordner beim Start an; danach die Einstellungen hinterlegen.
    await writeOverlaySettings($)
  } catch (error) {
    $.ui.toast(`Overlay ließ sich nicht starten: ${String(error).slice(0, 160)}`)
  }
}

// ---------- Befehle ans Overlay ----------

// Warteschlange in ~/.claude/y2k-overlay/command: jede Zeile "<nummer> <befehl> [werte]".
// Das Overlay arbeitet jede neue Nummer der Reihe nach ab; die letzten 30 Zeilen bleiben stehen.
let lastSeq = 0

async function sendOverlayCommand($: Engine, command: string) {
  const dir = await overlayDir($)

  if (dir === undefined) {
    return
  }
  const file = `${dir}/command`
  let lines: string[] = []

  try {
    if (await $.fs.exists(file)) {
      lines = (await $.fs.read(file)).split(/\r?\n/).filter(line => /^\d+ /.test(line))
    }
  } catch {
    lines = []
  }
  // Mikrosekunden seit 1970, mindestens eins mehr als die letzte Nummer: eindeutig und steigend.
  lastSeq = Math.max(Date.now() * 1000, lastSeq + 1)
  lines.push(`${lastSeq} ${command}`)
  await $.fs.write(file, `${lines.slice(-30).join('\n')}\n`)
}

// ---------- Overlay steuern: Status, Beenden, Neustart ----------

// Was die Leiste zum Overlay zeigt; ein Zeitgeber hält es frisch (siehe session.start).
let overlayRunning = false
let overlayBusy: string | undefined

// Das Overlay schreibt jede Sekunde ~/.claude/y2k-overlay/alive; frisch heißt: es läuft.
async function isOverlayRunning($: Engine) {
  try {
    const dir = await overlayDir($)

    if (dir === undefined || !(await $.fs.exists(`${dir}/alive`))) {
      return false
    }
    const { mtimeMs } = await $.fs.stat(`${dir}/alive`)

    return Date.now() - mtimeMs < 4000
  } catch {
    return false
  }
}

async function refreshOverlayStatus($: Engine) {
  const running = await isOverlayRunning($)

  if (running !== overlayRunning) {
    overlayRunning = running
    $.ui.invalidate('ui.render')
  }
}

async function setBusy($: Engine, text: string | undefined) {
  overlayBusy = text
  $.ui.invalidate('ui.render')
}

// Beenden mit Abschied: das Overlay lässt es glitzern, blendet aus und schließt sich.
async function stopOverlay($: Engine) {
  const dir = await overlayDir($)

  if (dir === undefined || !(await isOverlayRunning($))) {
    return
  }
  await sendOverlayCommand($, 'quit')

  for (let i = 0; i < 20 && (await $.fs.exists(`${dir}/alive`)); i++) {
    await $.clock.sleep(250)
  }
}

async function runOverlayAction($: Engine, action: 'start' | 'stop' | 'restart') {
  if (overlayBusy !== undefined) {
    return
  }
  try {
    if (action === 'stop' || action === 'restart') {
      await setBusy($, action === 'stop' ? 'wird beendet …' : 'startet neu …')
      await stopOverlay($)
    }
    if (action === 'start' || action === 'restart') {
      await setBusy($, action === 'start' ? 'startet …' : 'startet neu …')
      await startOverlay($)
    }
  } finally {
    overlayRunning = await isOverlayRunning($)
    await setBusy($, undefined)
  }
}

// ---------- Pixel-Banner ----------

// Zeigt das Banner im Overlay über der Chat-Mitte; 0 Sekunden = bleibt, bis es ausgeblendet wird.
async function showBanner($: Engine, text: string, seconds: number) {
  const dir = await overlayDir($)

  if (dir === undefined || !(await isOverlayRunning($))) {
    $.ui.toast('Das Overlay läuft nicht – erst starten, dann einblenden.')

    return false
  }
  await sendOverlayCommand($, `banner ${seconds} ${bannerGrid(text).join('|')}`)

  return true
}

async function fireworkNow($: Engine) {
  const dir = await overlayDir($)

  if (dir === undefined || !(await isOverlayRunning($))) {
    $.ui.toast('Das Overlay läuft nicht – erst starten, dann zünden.')

    return
  }
  await sendOverlayCommand($, 'feuerwerk')
}

async function bubblesNow($: Engine) {
  const dir = await overlayDir($)

  if (dir === undefined || !(await isOverlayRunning($))) {
    $.ui.toast('Das Overlay läuft nicht – erst starten, dann pusten.')

    return
  }
  await sendOverlayCommand($, 'blasen')
}

// ---------- Befehle für Effekte: /y2k feuerwerk …, /y2k seifenblasen …, /y2k streifen … ----------

type Effect = 'feuerwerk' | 'seifenblasen'

// Ohne Zusatz: sofort auslösen. Sonst je Wort: an, aus, jetzt, mehr, weniger, normal, 150%.
async function effectCommand($: Engine, effect: Effect, words: string[]): Promise<string> {
  const name = effect === 'feuerwerk' ? 'Feuerwerk' : 'Seifenblasen'
  const amountKey = effect === 'feuerwerk' ? 'feuerwerkMenge' : 'blasenMenge'
  let fire = words.length === 0
  const unknown: string[] = []

  for (const word of words) {
    if (word === 'jetzt' || word === 'los') {
      fire = true
    } else if (word === 'an' || word === 'aus') {
      await saveSettings($, cur => ({ ...cur, overlay: { ...cur.overlay, [effect]: word === 'an' } }))
    } else {
      const amount = parseAmount(word, settings[amountKey])

      if (amount === undefined) {
        unknown.push(word)
      } else {
        await saveSettings($, cur => ({ ...cur, [amountKey]: amount }))
        fire = true // damit man die neue Menge gleich sieht
      }
    }
  }
  if (fire) {
    await (effect === 'feuerwerk' ? fireworkNow($) : bubblesNow($))
  }
  const auto = settings.overlay[effect] ? 'von selbst an' : 'von selbst aus'
  const every = effect === 'feuerwerk' ? `, Grundtakt alle ${settings.feuerwerkAlle} s` : ''
  const hint = unknown.length > 0 ? ` Unbekannt: ${unknown.join(', ')} (erlaubt: an, aus, jetzt, mehr, weniger, normal, 150%).` : ''

  return `${name}: ${auto}, Menge ${settings[amountKey]} %${every}.${hint}`
}

// Streifen: an, aus, schneller, langsamer, schnell, normal, langsam, öfter, seltener
async function sweepCommand($: Engine, words: string[]): Promise<string> {
  const step = (list: number[], value: number, by: number) => {
    const i = Math.max(0, list.indexOf(value))

    return list[Math.max(0, Math.min(list.length - 1, i + by))] ?? value
  }
  const unknown: string[] = []

  for (const word of words) {
    const s = settings.sweep
    let next: SweepOptions | undefined

    if (word === 'an' || word === 'aus') next = { ...s, on: word === 'an' }
    else if (word === 'schneller') next = { ...s, duration: step(SWEEP_DURATION, s.duration, -1) }
    else if (word === 'langsamer') next = { ...s, duration: step(SWEEP_DURATION, s.duration, 1) }
    else if (word === 'schnell') next = { ...s, duration: 3 }
    else if (word === 'normal') next = { ...s, duration: 6, every: 40 }
    else if (word === 'langsam') next = { ...s, duration: 10 }
    else if (word === 'öfter' || word === 'oefter' || word === 'häufiger') next = { ...s, every: step(SWEEP_EVERY, s.every, -1) }
    else if (word === 'seltener') next = { ...s, every: step(SWEEP_EVERY, s.every, 1) }
    else unknown.push(word)

    if (next !== undefined) {
      const sweep = next

      await changeLook($, cur => ({ ...cur, sweep }))
    }
  }
  const s = settings.sweep
  const state = s.on ? `an, alle ${s.every} s, ein Wisch dauert ${s.duration} s` : 'aus'
  const hint = unknown.length > 0 ? ` Unbekannt: ${unknown.join(', ')} (erlaubt: an, aus, schneller, langsamer, öfter, seltener, schnell, normal, langsam).` : ''

  return `Lichtstreifen: ${state}.${hint}`
}

async function hideBanner($: Engine) {
  const dir = await overlayDir($)

  if (dir !== undefined) {
    await sendOverlayCommand($, 'banner-aus')
  }
}

// Schreibt das Banner als ASCII-Art in die Eingabe, als Codeblock, damit es im Chat formtreu bleibt.
async function bannerToPrompt($: Engine, text: string) {
  const art = bannerAscii(text)

  if (art === '') {
    return
  }
  await $.prompt.fill({ text: `\`\`\`\n${art}\n\`\`\`\n`, mode: 'insert' })
}

// Befehlsübersicht für die Leiste: Gruppe -> [Befehl, was er tut]
const COMMAND_HELP: [string, [string, string][]][] = [
  [
    'Leiste & Hilfe',
    [
      ['/y2k', 'Kurzübersicht im Chat'],
      ['/y2k einstellungen', 'diese Leiste öffnen'],
      ['/y2k zu', 'diese Leiste schließen (oder ✕ oben rechts)'],
      ['/y2k hilfe', 'Befehlsübersicht einblenden'],
      ['/y2k hilfe aus', 'Befehlsübersicht ausblenden'],
    ],
  ],
  [
    'In Claude',
    [
      ['/y2k hell · dunkel · auto', 'Farbmodus festlegen'],
      ['/y2k aus', 'zurück zum normalen Claude-Look'],
      ['/y2k streifen an · aus', 'Lichtstreifen zeigen oder ausblenden'],
      ['… schneller · langsamer', 'Tempo des Wischs'],
      ['… öfter · seltener', 'wie oft er kommt'],
    ],
  ],
  [
    'Overlay',
    [
      ['/y2k overlay', 'Overlay starten'],
      ['/y2k overlay neu', 'neu starten'],
      ['/y2k overlay aus', 'beenden'],
    ],
  ],
  [
    'Effekte',
    [
      ['/y2k feuerwerk', 'sofort eine Salve zünden'],
      ['/y2k seifenblasen', 'sofort Blasen pusten'],
      ['… an · aus', 'von selbst ein- oder ausschalten'],
      ['… mehr · weniger', 'Menge um die Hälfte rauf oder runter'],
      ['… 150% · normal', 'Menge genau setzen (10–400 %)'],
      ['/y2k banner Dein Text', 'Pixel-Banner: ASCII-Art in den Chat, groß im Overlay'],
    ],
  ],
]

// Was gerade im Banner-Feld der Leiste steht (noch nicht mit Enter übernommen).
let bannerDraft: string | undefined

const currentBanner = () => (bannerDraft !== undefined && bannerDraft.trim() !== '' ? bannerDraft : settings.bannerText)

async function openSettings($: Engine) {
  await $.ui.open({ id: PANE, title: PANE_TITLE })
}

export const register: Register = (on, options) => {
  const labelRaw = typeof options.label === 'string' && options.label.trim() !== '' ? options.label.trim() : DEFAULT_LABEL
  defaults = {
    schild: toPlace(options.schild, 'unten-rechts'),
    schildpos: 'oben-mitte',
    bannerText: DEFAULT_BANNER,
    hilfe: true,
    sweep: DEFAULT_SWEEP,
    feuerwerkAlle: 45,
    feuerwerkMenge: 100,
    blasenMenge: 100,
    icons: options.icons !== 'aus',
    puls: options.overlay !== 'aus',
    overlay: OVERLAY_DEFAULTS,
  }
  settings = defaults
  // Fertige Szenen je Name, damit sie nicht bei jedem Zeichnen neu gebaut werden.
  const scenes = new Map<string, string>()
  const LABEL_SVG = labelSvg(labelRaw)
  const LABEL_TEXT = labelText(labelRaw)


  on('session.start', async ($, e, next) => {
    // Beim Bauen: die Zeile, die Desktop am Malen des Looks hindern würde.
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await loadSettings($)
    const mode = toMode(await $.store.get('mode'))

    // Im Modus 'aus' setzt das Plugin nichts. Zurückgesetzt wird nur auf Befehl (/y2k aus),
    // nie beim Start, sonst würde es das Farbschema anderer Plugins löschen.
    if (mode !== 'aus') {
      await $.theme.set(lookFor(mode, settings.schild))
    }
    // Frühere Fassungen schrieben hier einen Hinweis in die Statuszeile; der bleibt sonst stehen.
    $.ui.status(undefined)
    await $.command.register({
      name: 'y2k',
      description: 'Y2K: hell|dunkel|auto|aus, einstellungen, overlay [neu|aus], banner <Text>, feuerwerk|seifenblasen [an|aus|mehr|weniger|150%], streifen [an|aus|schneller|langsamer|öfter|seltener]',
    })
    await writeOverlaySettings($)
    // Hält den Overlay-Status in der Leiste frisch (läuft / läuft nicht).
    overlayRunning = await isOverlayRunning($)
    $.clock.every(1500, () => void refreshOverlayStatus($))

    return next(e)
  })

  on('command.run', { command: 'y2k' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()

    // /y2k feuerwerk …, /y2k seifenblasen …, /y2k streifen …
    const [head, ...rest] = word.split(/\s+/)

    if (head === 'feuerwerk') {
      return { text: await effectCommand($, 'feuerwerk', rest) }
    }
    if (head === 'seifenblasen' || head === 'blasen') {
      return { text: await effectCommand($, 'seifenblasen', rest) }
    }
    if (head === 'streifen') {
      return { text: await sweepCommand($, rest) }
    }

    // /y2k banner [Text]: ASCII-Art in den Chat, und – wenn das Overlay läuft – groß über der Chat-Mitte
    if (word === 'banner' || word.startsWith('banner ')) {
      const text = e.args.trim().slice('banner'.length).trim() || settings.bannerText
      const art = bannerAscii(text)

      if (art === '') {
        return { text: 'Kein darstellbarer Text für das Banner.' }
      }
      await showBanner($, text, 7)

      return { text: `\`\`\`\n${art}\n\`\`\`` }
    }

    if (word === '') {
      return {
        text: [
          `Y2K-Modus: ${toMode(await $.store.get('mode'))}.`,
          'Look: /y2k hell · dunkel · auto · aus',
          'Leiste: /y2k einstellungen öffnet, /y2k zu schließt',
          'Hilfe: /y2k hilfe blendet die Befehlsübersicht ein, /y2k hilfe aus wieder aus',
          'Overlay: /y2k overlay · overlay neu · overlay aus',
          'Effekte: /y2k feuerwerk · seifenblasen  [an | aus | jetzt | mehr | weniger | normal | 150%]',
          'Streifen: /y2k streifen  [an | aus | schneller | langsamer | öfter | seltener]',
          'Banner: /y2k banner Dein Text',
        ].join('\n'),
      }
    }
    if (word === 'einstellungen' || word === 'settings' || word === 'leiste') {
      await openSettings($)

      return { text: 'Y2K-Studio geöffnet. Schließen: ✕ oben rechts in der Leiste oder /y2k zu.' }
    }
    // /y2k hilfe [an|aus]: Leiste öffnen und Befehlsübersicht auf- oder zuklappen
    if (word === 'hilfe' || word === 'hilfe an' || word === 'hilfe aus') {
      const show = word !== 'hilfe aus'

      await saveSettings($, cur => ({ ...cur, hilfe: show }))

      if (show) {
        await openSettings($)
      }

      return {
        text: show
          ? 'Befehlsübersicht ist eingeblendet – ganz unten in der Leiste Y2K-Studio. Ausblenden: /y2k hilfe aus.'
          : 'Befehlsübersicht ist ausgeblendet. Wieder einblenden: /y2k hilfe.',
      }
    }
    if (word === 'zu' || word === 'schließen' || word === 'schliessen') {
      await $.ui.close({ id: PANE })

      return { text: 'Y2K-Studio geschlossen. Wieder öffnen: /y2k einstellungen oder /y2k hilfe.' }
    }
    if (word === 'overlay' || word === 'overlay start') {
      await runOverlayAction($, 'start')

      return { text: overlayRunning ? 'Y2K-Overlay läuft (Strg+Alt+Y blendet es aus und ein).' : 'Y2K-Overlay ließ sich nicht starten.' }
    }
    if (word === 'overlay neu' || word === 'overlay neustart') {
      await runOverlayAction($, 'restart')

      return { text: 'Y2K-Overlay neu gestartet.' }
    }
    if (word === 'overlay aus' || word === 'overlay beenden') {
      await runOverlayAction($, 'stop')

      return { text: 'Y2K-Overlay beendet.' }
    }
    const mode = MODE_WORDS[word]

    if (mode === undefined) {
      return { text: `Unbekannt: „${word}“. Wählbar: hell, dunkel, auto, aus, einstellungen, overlay` }
    }
    await applyMode($, mode)
    $.ui.toast(`Y2K ${mode}`)

    if (mode === 'aus') {
      return { text: 'Y2K ist aus: Farbschema und Hintergrund sind zurückgesetzt. Wieder an mit /y2k auto.' }
    }

    return { text: mode === 'auto' ? 'Y2K folgt jetzt dem Hell/Dunkel-Modus der App.' : `Y2K steht jetzt fest auf ${mode}.` }
  })

  // ---------- Einstellungsleiste ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Select, Input } = $.ui.resolve(e)
    const mode = toMode(await $.store.get('mode'))
    const s = settings

    // Eine Karte je Thema: Rahmen, Überschrift, ein Satz Erklärung, dann die Regler.
    const section = (key: string, title: string, hint: string, children: RenderChildren[]) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderDimColor paddingX={2} paddingY={1} gap={1} marginBottom={1}>
        <Box flexDirection="column">
          <Text bold>{title}</Text>
          <Text dimColor>{hint}</Text>
        </Box>
        {children}
      </Box>
    )
    // Schalter: links der Zustand als Knopf, rechts in Worten, was er tut.
    const switchRow = (key: string, isOn: boolean, label: string, flip: () => void) => (
      <Box key={key} flexDirection="row" alignItems="center" gap={1}>
        <Button key={`${key}-btn`} dimColor={!isOn} onPress={flip}>
          {isOn ? '● an ' : '○ aus'}
        </Button>
        <Text dimColor={!isOn}>{label}</Text>
      </Box>
    )
    const toggle = (key: keyof OverlaySettings) =>
      switchRow(`ov-${key}`, s.overlay[key], OVERLAY_LABELS[key], () =>
        void saveSettings($, cur => ({ ...cur, overlay: { ...cur.overlay, [key]: !cur.overlay[key] } })),
      )
    const status =
      overlayBusy !== undefined ? `◌  Overlay ${overlayBusy}` : overlayRunning ? '●  Overlay läuft' : '○  Overlay ist aus'
    // Zwischenüberschrift für einen Bereich der Leiste
    const group = (key: string, title: string) => (
      <Box key={key} flexDirection="column" marginTop={1} marginBottom={1} paddingX={1}>
        <Text bold color="accent">{`━━  ${title.toUpperCase()}  ━━`}</Text>
      </Box>
    )
    const everyLabel = (n: number) => (n < 60 ? `alle ${n} Sekunden` : n === 60 ? 'jede Minute' : `alle ${n / 60} Minuten`)

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>✧ Y2K-Studio</Text>
          <Text dimColor>Look, Overlay und Effekte für Claude – alles wirkt sofort.</Text>
        </Box>

        {group('g-claude', 'In Claude')}
        {section('look', '◆  Aussehen der App', 'Farben, Hintergrund und Schild, die der Mod direkt in Claude setzt.', [
          <Select
            key="mode"
            label="Hell oder dunkel"
            value={mode}
            options={[
              { value: 'auto', label: 'Automatisch, wie die App' },
              { value: 'hell', label: 'Immer hell' },
              { value: 'dunkel', label: 'Immer dunkel' },
              { value: 'aus', label: 'Aus – normaler Claude-Look' },
            ]}
            onSelect={value => void applyMode($, toMode(value))}
          />,
          <Select
            key="schild"
            label="Namensschild"
            value={s.schild}
            options={[
              { value: 'unten-rechts', label: 'Unten rechts im Hintergrund' },
              { value: 'ueber-eingabe', label: 'Scharf über dem Eingabefeld' },
              { value: 'aus', label: 'Ausgeblendet' },
            ]}
            onSelect={value => void setSchild($, value)}
          />,
          switchRow('icons', s.icons, 'Chromperlen vor jedem Werkzeug-Aufruf im Chat', () =>
            void saveSettings($, cur => ({ ...cur, icons: !cur.icons })),
          ),
        ])}

        {section('sweep', '◆  Lichtstreifen', 'Der holografische Schimmer, der ab und zu über den Hintergrund wischt.', [
          switchRow('sweep-on', s.sweep.on, 'Lichtstreifen zeigen', () =>
            void changeLook($, cur => ({ ...cur, sweep: { ...cur.sweep, on: !cur.sweep.on } })),
          ),
          ...(s.sweep.on
            ? [
                <Select
                  key="sweep-every"
                  label="Wie oft"
                  value={String(s.sweep.every)}
                  options={SWEEP_EVERY.map(n => ({ value: String(n), label: everyLabel(n) }))}
                  onSelect={value => void changeLook($, cur => ({ ...cur, sweep: { ...cur.sweep, every: pick(Number(value), SWEEP_EVERY, cur.sweep.every) } }))}
                />,
                <Select
                  key="sweep-duration"
                  label="Wie schnell"
                  value={String(s.sweep.duration)}
                  options={[
                    { value: '3', label: 'Flink – 3 Sekunden' },
                    { value: '6', label: 'Gemütlich – 6 Sekunden' },
                    { value: '10', label: 'Ganz langsam – 10 Sekunden' },
                  ]}
                  onSelect={value => void changeLook($, cur => ({ ...cur, sweep: { ...cur.sweep, duration: pick(Number(value), SWEEP_DURATION, cur.sweep.duration) } }))}
                />,
              ]
            : []),
        ])}

        {group('g-overlay', 'Overlay')}
        {section('ov-status', '◈  Overlay', 'Ein durchsichtiges Fenster über Claude (Windows und Mac) – Klicks gehen einfach durch.', [
          <Text key="status" bold={overlayRunning}>{status}</Text>,
          <Box key="ov-buttons" flexDirection="row" gap={1}>
            {!overlayRunning && (
              <Button key="start" variant="primary" onPress={() => void runOverlayAction($, 'start')}>
                Starten
              </Button>
            )}
            {overlayRunning && (
              <Button key="restart" variant="primary" onPress={() => void runOverlayAction($, 'restart')}>
                Neu starten
              </Button>
            )}
            {overlayRunning && (
              <Button key="stop" onPress={() => void runOverlayAction($, 'stop')}>
                Beenden
              </Button>
            )}
          </Box>,
          toggle('aktiv'),
          <Text key="ov-hint" dimColor>Strg + Alt + Y blendet es jederzeit aus und wieder ein.</Text>,
        ])}

        {section('ov-deko', '◈  Rahmen & Deko', 'Was das Overlay dauerhaft rund ums Fenster zeichnet.', [
          toggle('rahmen'),
          toggle('glitzer'),
          toggle('kopfleiste'),
          toggle('scanlines'),
          toggle('schild'),
          ...(s.overlay.schild
            ? [
                <Select
                  key="schildpos"
                  label="Platz des Schilds"
                  value={s.schildpos}
                  options={[
                    { value: 'oben-mitte', label: 'Oben in der Mitte der Titelleiste' },
                    { value: 'oben-links', label: 'Oben links' },
                    { value: 'unten-mitte', label: 'Unten in der Mitte' },
                    { value: 'unten-links', label: 'Unten links, über dem Konto' },
                  ]}
                  onSelect={value => void saveSettings($, cur => ({ ...cur, schildpos: toBadgePos(value) }))}
                />,
              ]
            : []),
        ])}

        {section('ov-react', '◈  Reaktionen', 'Effekte, die auf das antworten, was in Claude gerade passiert.', [
          toggle('eingabe'),
          toggle('sitzungen'),
          switchRow('puls', s.puls, 'Glitzer-Regen, sobald eine Antwort fertig ist', () =>
            void saveSettings($, cur => ({ ...cur, puls: !cur.puls })),
          ),
        ])}

        {group('g-fx', 'Effekte')}
        {section('fw', '✺  Feuerwerk', 'Raketen steigen auf und zerplatzen in Pink, Cyan und Lime.', [
          <Button key="fw-now" variant="primary" onPress={() => void fireworkNow($)}>
            ✺ Jetzt zünden
          </Button>,
          toggle('feuerwerk'),
          ...(s.overlay.feuerwerk
            ? [
                <Select
                  key="fw-every"
                  label="Wie oft"
                  value={String(s.feuerwerkAlle)}
                  options={FIREWORK_EVERY.map(n => ({ value: String(n), label: everyLabel(n) }))}
                  onSelect={value => void saveSettings($, cur => ({ ...cur, feuerwerkAlle: pick(Number(value), FIREWORK_EVERY, cur.feuerwerkAlle) }))}
                />,
              ]
            : []),
          <Select
            key="fw-amount"
            label="Wie viel"
            value={String(s.feuerwerkMenge)}
            options={amountOptions(s.feuerwerkMenge)}
            onSelect={value => void saveSettings($, cur => ({ ...cur, feuerwerkMenge: toPercent(Number(value), cur.feuerwerkMenge) }))}
          />,
        ])}

        {section('bub', '○  Seifenblasen', 'Schillernde Blasen schweben von unten herauf und platzen.', [
          <Button key="bub-now" variant="primary" onPress={() => void bubblesNow($)}>
            ○ Jetzt pusten
          </Button>,
          toggle('seifenblasen'),
          <Select
            key="bub-amount"
            label="Wie viel"
            value={String(s.blasenMenge)}
            options={amountOptions(s.blasenMenge)}
            onSelect={value => void saveSettings($, cur => ({ ...cur, blasenMenge: toPercent(Number(value), cur.blasenMenge) }))}
          />,
        ])}

        {section('banner', '▦  Pixel-Banner', 'Großer Schriftzug im ANSI-Stil – über dem Chat oder als ASCII-Art im Chat.', [
          <Input
            key="bannertext"
            label="Text"
            value={s.bannerText}
            placeholder={DEFAULT_BANNER}
            submitLabel="übernehmen"
            onInput={value => {
              bannerDraft = value
            }}
            onSubmit={value => {
              bannerDraft = undefined
              void saveSettings($, cur => ({ ...cur, bannerText: value.trim() || DEFAULT_BANNER }))
            }}
          />,
          <Box key="banner-buttons" flexDirection="row" gap={1}>
            <Button key="banner-show" variant="primary" onPress={() => void showBanner($, currentBanner(), 7)}>
              Einblenden
            </Button>
            <Button key="banner-stay" onPress={() => void showBanner($, currentBanner(), 0)}>
              Stehen lassen
            </Button>
            <Button key="banner-hide" onPress={() => void hideBanner($)}>
              Ausblenden
            </Button>
          </Box>,
          <Button key="banner-prompt" onPress={() => void bannerToPrompt($, currentBanner())}>
            ⌨ Als ASCII-Art in die Eingabe
          </Button>,
          <Text key="banner-hint" dimColor>Bis zu drei Zeilen à zwölf Zeichen.</Text>,
        ])}

        {group('g-help', 'Hilfe')}
        {section('befehle', '⌘  Befehle', 'Alles hier geht auch im Chat – einfach eintippen.', [
          <Button key="help-toggle" onPress={() => void saveSettings($, cur => ({ ...cur, hilfe: !cur.hilfe }))}>
            {s.hilfe ? '▾ Befehlsübersicht ausblenden' : '▸ Befehlsübersicht einblenden'}
          </Button>,
          ...(s.hilfe ? COMMAND_HELP : []).map(([group, rows]) => (
            <Box key={`cmd-${group}`} flexDirection="column">
              <Text bold>{group}</Text>
              {rows.map(([cmd, what]) => (
                <Box key={`cmd-${cmd}`} flexDirection="row" gap={2}>
                  <Box minWidth={30}>
                    <Text color="accent">{cmd}</Text>
                  </Box>
                  <Text dimColor>{what}</Text>
                </Box>
              ))}
            </Box>
          )),
        ])}
      </Box>
    )
  })

  // Eintrag im Rechtsklick-Menü der Desktop-App
  on('ui.render', { component: 'ContextMenu' }, ($, e) => {
    const { Button } = $.ui.resolve(e)

    return (
      <Button key="y2k-settings" onPress={() => void openSettings($)}>
        ✧ Y2K-Einstellungen
      </Button>
    )
  })

  // ---------- Look ----------

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || typeof e.props.scene !== 'string' || !e.props.scene.startsWith(SCENE_PREFIX)) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    let source = scenes.get(e.props.scene)

    if (source === undefined) {
      const parsed = parseSceneName(e.props.scene)
      source = sceneFor(parsed.withLabel ? labelRaw : null, parsed.sweep)
      scenes.set(e.props.scene, source)
    }

    return <Svg source={source} alt="Y2K-Szene: Chromkugeln mit irisierenden Ringen, Funkeln und ein Raster in Silber und Aqua" isInteractive />
  })

  // Wahlweise sitzt das Schild scharf über dem Eingabefeld statt in der Szene.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.props.hasSurvey || settings.schild !== 'ueber-eingabe') {
      return next(e)
    }
    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Box, Svg } = $.ui.resolve(e)

      return (
        <Box flexDirection="row" justifyContent="flex-end">
          <Svg source={LABEL_SVG} alt={LABEL_TEXT} width={300} height={39} isInteractive />
        </Box>
      )
    }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" justifyContent="flex-end">
        <Text dimColor>{LABEL_TEXT}</Text>
      </Box>
    )
  })

  // Verbindung zum Y2K-Overlay: Wenn eine Antwort fertig ist, wird ~/.claude/y2k-overlay/pulse
  // neu geschrieben; das Overlay sieht die Änderung und lässt Glitzer regnen.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (settings.puls && e.agentId === undefined && e.reason === 'answer') {
      await pulseOverlay($)
    }


    return result
  })

  // Y2K-Icon vor jedem Tool-Aufruf (nur Desktop-App; die ausgeklappte Ansicht bleibt unverändert).
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!settings.icons || e.surface !== 'desktop' || e.props.isExpanded === true) {
      return next(e)
    }
    const row = await next(e)
    const { Box, Svg } = $.ui.resolve(e)
    const icon = iconSvg(e.props.tool, e.props.isRunning, e.props.isErrored)

    return (
      <Box flexDirection="row" alignItems="flex-start" gap={1}>
        <Svg source={icon} alt={`${e.props.tool}-Symbol`} width={18} height={18} />
        <Box flexGrow={1}>{row}</Box>
      </Box>
    )
  })
}
