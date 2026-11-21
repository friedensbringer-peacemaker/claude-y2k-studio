// Y2K-Szene: Chrom, Perlmutt und irisierende Folie.
// Jedes Element ist eine kleine Bauanleitung, die SVG-Text liefert.

export const VERSION = '0.23.0'
export const DATE = '19.11.2026'

const n = (v: number) => Math.round(v * 100) / 100

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Zeitangaben als Klassen im Stil-Block. Die App entfernt style-Attribute an
// Elementen; dann liefen Dauer und Verzögerung der Animationen ins Leere.
const timingRules: string[] = []

const timing = (delay: number, dur?: number) => {
  const name = `t${timingRules.length}`
  timingRules.push(`.${name}{${dur === undefined ? '' : `animation-duration:${dur}s;`}animation-delay:${n(-delay)}s}`)

  return name
}

// ---------- Chromkugel ----------
// Spiegelt eine Umgebung wie eine echte Chromkugel: oben heller Himmel, darunter
// ein gekrümmter Horizont (an den Rändern nach unten gebogen) mit dunkler Kante
// und rosa Boden, oben links ein Studiofenster. Darüber Kugelschatten, Randlicht,
// weicher Glanz und ein Gegenlicht-Bogen.
const clipDefs = new Map<number, string>()

const clipFor = (r: number) => {
  const id = `kc${String(r).replace('.', '_')}`
  if (!clipDefs.has(r)) {
    clipDefs.set(r, `<clipPath id="${id}"><circle r="${r}"/></clipPath>`)
  }

  return id
}

const windowPane = (r: number) => {
  const w = n(r * 0.13)
  const g = n(r * 0.035)
  const cells = [0, 1].flatMap(i => [0, 1].map(j =>
    `<rect x="${n(i * (w + g))}" y="${n(j * (w + g))}" width="${w}" height="${w}" rx="${n(w * 0.25)}"/>`)).join('')

  return `<g transform="translate(${n(-r * 0.5)} ${n(-r * 0.56)}) rotate(-18) skewX(-12)" fill="#ffffff" opacity=".62">${cells}</g>`
}

const sphereBody = (r: number, kind: 'chrome' | 'pink') => `
<g clip-path="url(#${clipFor(r)})">
<circle r="${r}" fill="url(#${kind}Sky)"/>
<ellipse cy="${n(r * 0.62)}" rx="${n(r * 1.25)}" ry="${n(r * 0.66)}" fill="url(#${kind}Ground)"/>
<ellipse cy="${n(r * 0.62)}" rx="${n(r * 1.25)}" ry="${n(r * 0.66)}" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="${n(Math.max(0.6, r * 0.012))}" transform="translate(0 ${n(-r * 0.03)})"/>
${windowPane(r)}
</g>
<circle r="${r}" fill="url(#sphShade)"/>
<circle r="${r}" fill="url(#sphRim)"/>
<ellipse cx="${n(-r * 0.3)}" cy="${n(-r * 0.44)}" rx="${n(r * 0.4)}" ry="${n(r * 0.19)}" transform="rotate(-24 ${n(-r * 0.3)} ${n(-r * 0.44)})" fill="url(#spec)"/>
<circle cx="${n(-r * 0.42)}" cy="${n(-r * 0.5)}" r="${n(r * 0.06)}" fill="#ffffff"/>
<path d="M${n(r * 0.2)} ${n(r * 0.78)}A${n(r * 0.86)} ${n(r * 0.86)} 0 0 0 ${n(r * 0.8)} ${n(r * 0.2)}" fill="none" stroke="#ffffff" stroke-width="${n(Math.max(1, r * 0.04))}" stroke-linecap="round" opacity=".75"/>
<circle r="${n(r - 0.5)}" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="1"/>`

const glowUnder = (r: number) =>
  `<ellipse cy="${n(r * 1.32)}" rx="${n(r * 1.25)}" ry="${n(r * 0.26)}" fill="url(#floorGlow)"/>`

const sphere = (x: number, y: number, r: number, kind: 'chrome' | 'pink', bob: number) =>
  `<g class="bob ${timing(bob)}"><g transform="translate(${x} ${y})">${glowUnder(r)}${sphereBody(r, kind)}</g></g>`

// ---------- Planet mit Ring ----------
// Der Ring läuft hinten an der Kugel vorbei (gedämpft) und vorne über sie.
const ringArc = (rx: number, ry: number, front: boolean, w: number) => {
  const d = `M${-rx} 0A${rx} ${ry} 0 0 ${front ? 0 : 1} ${rx} 0`

  return `<path d="${d}" fill="none" stroke="#1d1530" stroke-opacity=".28" stroke-width="${n(w + 3)}"/>
<path d="${d}" fill="none" stroke="url(#film)" stroke-width="${w}"/>
<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="${n(w * 0.14)}" transform="translate(0 ${n(-w * 0.28)})"/>`
}

const planet = (x: number, y: number, r: number, rx: number, ry: number, tilt: number, kind: 'chrome' | 'pink', w: number, bob: number) =>
  `<g class="bob ${timing(bob)}"><g transform="translate(${x} ${y})">
${glowUnder(r)}
<g transform="rotate(${tilt})" opacity=".7">${ringArc(rx, ry, false, w)}</g>
${sphereBody(r, kind)}
<g transform="rotate(${tilt})">${ringArc(rx, ry, true, w)}</g>
</g></g>`

// ---------- Chromröhre ----------
// Geschichtete Striche ergeben eine runde Röhre; ein Licht läuft an ihr entlang.
const tube = (d: string, w: number, delay: number) => `<g fill="none" stroke-linecap="round">
<path d="${d}" stroke="#1d1530" stroke-opacity=".22" stroke-width="${n(w + 6)}" transform="translate(0 6)"/>
<path d="${d}" stroke="#4b5374" stroke-width="${w}"/>
<path d="${d}" stroke="#a7b0c9" stroke-width="${n(w * 0.8)}"/>
<path d="${d}" stroke="#e6eaf5" stroke-width="${n(w * 0.52)}" transform="translate(0 ${n(-w * 0.08)})"/>
<path d="${d}" stroke="#ffffff" stroke-width="${n(w * 0.16)}" transform="translate(0 ${n(-w * 0.2)})"/>
<path d="${d}" stroke="#ff8ad8" stroke-opacity=".75" stroke-width="${n(w * 0.12)}" transform="translate(0 ${n(w * 0.26)})"/>
<path class="travel ${timing(delay)}" pathLength="1000" d="${d}" stroke="#ffffff" stroke-width="${n(w * 0.34)}" transform="translate(0 ${n(-w * 0.12)})"/>
</g>`

// ---------- Facettierter Chromstern mit Lens-Flare ----------
const spike = (angle: number, len: number, w: number, light: string, dark: string) =>
  `<g transform="rotate(${angle})"><path d="M0 0L${len} 0L0 ${-w}Z" fill="url(#${light})"/><path d="M0 0L${len} 0L0 ${w}Z" fill="url(#${dark})"/></g>`

// ---------- Doppelhelix ----------
// Zwei feine Chromröhren winden sich um eine senkrechte Achse; an den Kreuzungen
// sitzen Chromperlen. Der hintere Strang ist gedämpft, damit Tiefe entsteht.
const helixPath = (cx: number, amp: number, period: number, phase: number) => {
  const pts: string[] = []
  for (let y = -60; y <= 1060; y += 14) {
    const x = cx + amp * Math.sin(((y / period) * 2 + phase) * Math.PI)
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${n(x)} ${y}`)
  }

  return pts.join('')
}

const helix = (cx: number, amp: number, period: number) => {
  const beads: string[] = []
  // Kreuzungen: sin(2πy/period) = 0 und sin(2πy/period + π) = 0 an denselben Stellen
  for (let y = 0; y <= 1000; y += period / 2) {
    beads.push(`<g class="bob ${timing(y / 90)}"><g transform="translate(${cx} ${y})">${glowUnder(9)}${sphereBody(9, y % period === 0 ? 'chrome' : 'pink')}</g></g>`)
  }

  return `<g opacity=".55">${tube(helixPath(cx, amp, period, 1), 6, 3)}</g>
${tube(helixPath(cx, amp, period, 0), 7, 0)}
${beads.join('')}`
}

// ---------- Chrom-Schmetterling ----------
// Flügel aus schillernder Folie mit Chromrand, schlagen langsam (Skalierung zur Körperachse).
const WING_UP = 'M0 -2C16 -46 70 -78 98 -50C118 -28 92 6 6 4Z'
const WING_DOWN = 'M4 6C44 8 84 30 72 64C60 92 20 64 2 14Z'
const WING_UP_IN = 'M8 -6C24 -38 62 -60 84 -44C98 -30 80 -6 12 -2Z'

const wing = (side: 'r' | 'l') => `<g class="wing${side}"><g ${side === 'l' ? 'transform="scale(-1 1)"' : ''}>
<path d="${WING_UP}" fill="url(#film)" opacity=".9" stroke="url(#rim)" stroke-width="2.4" stroke-linejoin="round"/>
<path d="${WING_UP_IN}" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.2"/>
<path d="${WING_DOWN}" fill="url(#film)" opacity=".75" stroke="url(#rim)" stroke-width="2.2" stroke-linejoin="round"/>
<ellipse cx="62" cy="-34" rx="12" ry="7" transform="rotate(-30 62 -34)" fill="#ffffff" opacity=".55"/>
<circle cx="44" cy="36" r="5" fill="#ffffff" opacity=".6"/>
</g></g>`

const butterfly = (x: number, y: number, s: number, tilt: number) => `<g class="bob ${timing(5)}"><g transform="translate(${x} ${y}) rotate(${tilt}) scale(${s})">
<ellipse cy="78" rx="60" ry="10" fill="url(#floorGlow)"/>
${wing('l')}${wing('r')}
<ellipse cy="6" rx="5" ry="30" fill="url(#chromeSky)" stroke="#ffffff" stroke-opacity=".6" stroke-width="1"/>
<circle cy="-28" r="6" fill="url(#pinkSky)" stroke="#ffffff" stroke-opacity=".6" stroke-width="1"/>
<path d="M-2 -32C-8 -52 -18 -60 -26 -62M2 -32C8 -52 18 -60 26 -62" fill="none" stroke="#e6eaf5" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="-26" cy="-62" r="3" fill="#ff8ad8"/><circle cx="26" cy="-62" r="3" fill="#ff8ad8"/>
</g></g>`

const star = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="breathe">
<circle class="pulse" r="110" fill="url(#halo)"/>
<g class="flare"><path d="M-170 0H170" stroke="url(#flareH)" stroke-width="1.6"/><path d="M0-170V170" stroke="url(#flareV)" stroke-width="1.6"/></g>
${[45, 135, 225, 315].map(a => spike(a, 40, 7, 'facetPL', 'facetPD')).join('')}
${[0, 90, 180, 270].map(a => spike(a, 82, 12, 'facetL', 'facetD')).join('')}
<circle r="7" fill="url(#spec)"/><circle r="2.6" fill="#ffffff"/>
</g></g>`

// ---------- Funkeln ----------
const SPARK = 'M0-10C.8-2.6 2.6-.8 10 0C2.6.8.8 2.6 0 10C-.8 2.6-2.6.8-10 0C-2.6-.8-.8-2.6 0-10Z'

const sparkle = (x: number, y: number, s: number, delay: number) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><g class="spark ${timing(delay)}"><circle r="9" fill="url(#sparkGlow)"/><path d="${SPARK}" fill="url(#sparkFill)"/></g></g>`

// ---------- Seifenblasen ----------
const DROPS = [0, 60, 120, 180, 240, 300]

const bubble = (x: number, y: number, r: number, dur: number, delay: number) => {
  const t = timing(delay, dur)
  const drops = DROPS.map(a => {
    const rad = (a * Math.PI) / 180

    return `<circle cx="${n(Math.cos(rad) * r * 0.9)}" cy="${n(Math.sin(rad) * r * 0.9)}" r="${n(Math.max(1, r * 0.09))}" fill="#ffffff"/>`
  }).join('')

  return `<g class="bub ${t}"><g transform="translate(${x} ${y})">
<g class="bubBody ${t}">
<circle r="${r}" fill="url(#bubble)" stroke="url(#film)" stroke-width="${n(Math.max(1, r * 0.07))}" stroke-opacity=".9"/>
<path d="M${n(-r * 0.62)} ${n(-r * 0.22)}A${n(r * 0.68)} ${n(r * 0.68)} 0 0 1 ${n(-r * 0.12)} ${n(-r * 0.66)}" fill="none" stroke="#ffffff" stroke-width="${n(r * 0.13)}" stroke-linecap="round" opacity=".9"/>
<circle cx="${n(r * 0.42)}" cy="${n(r * 0.44)}" r="${n(r * 0.08)}" fill="#ffffff" opacity=".7"/>
</g>
<g class="bubPop ${t}"><circle r="${r}" fill="none" stroke="url(#film)" stroke-width="1.2" stroke-dasharray="3 5"/>${drops}</g>
</g></g>`
}

const BUBBLES = [
  bubble(335, 900, 14, 26, 4),
  bubble(1290, 900, 16, 24, 12),
  bubble(1460, 840, 24, 30, 20),
  bubble(1370, 780, 18, 28, 7),
  bubble(120, 860, 22, 32, 16),
].join('')

// ---------- Label unten rechts ----------
const tag = (raw: string) => {
  const t = xml(raw)

  return `<g class="tag"><g class="tagin">
<text x="1562" y="939" text-anchor="end" class="tagX" transform="translate(1.6 1.6)">${t}</text>
<text x="1562" y="939" text-anchor="end" class="tagX" transform="translate(.8 .8)" opacity=".75">${t}</text>
<text x="1562" y="939" text-anchor="end" class="tag1">${t}</text>
<path d="M1400 946H1562" stroke="url(#rule)" stroke-width=".8"/>
<g transform="translate(1566 946) scale(.32)"><circle r="9" fill="url(#sparkGlow)"/><path d="${SPARK}" fill="url(#sparkFill)"/></g>
<text x="1562" y="962" text-anchor="end" class="tag2">V${VERSION} · ${DATE}</text>
</g></g>`
}

const SPARKLES = [
  sparkle(1262, 70, 2.2, 0),
  sparkle(1572, 400, 1.4, 2.5),
  sparkle(1555, 760, 0.9, 3.6),
  sparkle(352, 120, 1.5, 6.2),
  sparkle(560, 470, 1.0, 1.0),
  sparkle(250, 760, 1.2, 2.2),
].join('')

const STYLE = `<style>
.s1{stop-color:#f3e2f0}.s2{stop-color:#ebe5f6}.s3{stop-color:#f8d9ec}
.gl{stroke:#b98ab6}.grid{opacity:.32}
.blob{opacity:.85}
.pearl{opacity:.7}
.grain{opacity:.55}
.bob{animation:bob 14s ease-in-out infinite alternate}
@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-12px)}}
.spark{transform-box:fill-box;transform-origin:center;animation:twinkle 7s ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:1;transform:scale(1) rotate(0deg)}50%{opacity:.35;transform:scale(.62) rotate(20deg)}}
.drift1{animation:drift1 46s ease-in-out infinite alternate}
.drift2{animation:drift2 54s ease-in-out infinite alternate}
.drift3{animation:drift3 62s ease-in-out infinite alternate}
@keyframes drift1{from{transform:translate(0,0)}to{transform:translate(60px,40px)}}
@keyframes drift2{from{transform:translate(0,0)}to{transform:translate(-70px,50px)}}
@keyframes drift3{from{transform:translate(0,0)}to{transform:translate(-40px,-60px)}}
.travel{stroke-dasharray:70 930;animation:travel 10s linear infinite}
@keyframes travel{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
.sweep{mix-blend-mode:screen;animation:sweep 40s cubic-bezier(.45,.05,.35,1) infinite}
@keyframes sweep{0%{transform:translateX(0)}15%{transform:translateX(3700px)}100%{transform:translateX(3700px)}}
.glint{transform-box:fill-box;transform-origin:center;animation:glint 40s linear infinite}
@keyframes glint{0%,2%{opacity:0;transform:scale(.3)}5%{opacity:1;transform:scale(1)}9%{opacity:.4;transform:scale(.7)}12%{opacity:1;transform:scale(1.1)}15%,100%{opacity:0;transform:scale(.3)}}
.bub{animation:rise linear infinite}
@keyframes rise{from{transform:translateY(260px)}to{transform:translateY(-1150px)}}
.bubBody{transform-box:fill-box;transform-origin:center;animation:bubLife linear infinite}
@keyframes bubLife{0%{opacity:0;transform:scale(.4)}5%{opacity:1;transform:scale(1)}66%{opacity:1;transform:scale(1)}68.5%{opacity:1;transform:scale(1.1,.9)}70.5%{opacity:0;transform:scale(1.35)}100%{opacity:0;transform:scale(1.35)}}
.bubPop{opacity:0;transform-box:fill-box;transform-origin:center;animation:bubPop linear infinite}
@keyframes bubPop{0%,69%{opacity:0;transform:scale(.9)}70.5%{opacity:1;transform:scale(1.1)}76%{opacity:0;transform:scale(2.1)}100%{opacity:0;transform:scale(2.1)}}
.mer{transform-box:fill-box;transform-origin:center;animation:turn 12s linear infinite}
@keyframes turn{0%{transform:scaleX(1)}25%{transform:scaleX(.02)}50%{transform:scaleX(-1)}75%{transform:scaleX(.02)}100%{transform:scaleX(1)}}
.spinSlow{transform-box:fill-box;transform-origin:center;animation:spin 70s linear infinite}
.orbitDot{transform-box:fill-box;transform-origin:center;animation:spin 24s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.wingr{transform-box:fill-box;transform-origin:0% 50%;animation:flap 5s ease-in-out infinite}
.wingl{transform-box:fill-box;transform-origin:100% 50%;animation:flap 5s ease-in-out infinite}
@keyframes flap{0%,100%{transform:scaleX(1)}45%{transform:scaleX(.62)}55%{transform:scaleX(.62)}}
.breathe{transform-box:fill-box;transform-origin:center;animation:breathe 10s ease-in-out infinite}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 9s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.14);opacity:1}}
.flare{transform-box:fill-box;transform-origin:center;animation:flare 6s ease-in-out infinite}
@keyframes flare{0%,100%{transform:scale(.55);opacity:.45}50%{transform:scale(1);opacity:1}}
.tag1{font-family:Segoe UI Black,Arial Black,-apple-system,Helvetica Neue,sans-serif;font-size:22px;font-weight:900;font-style:italic;letter-spacing:.3px;fill:url(#tagfill);stroke:#ffffff;stroke-opacity:.95;stroke-width:.7px;paint-order:stroke}
.tagX{font-family:Segoe UI Black,Arial Black,-apple-system,Helvetica Neue,sans-serif;font-size:22px;font-weight:900;font-style:italic;letter-spacing:.3px;fill:#9a0f6b}
.tag2{font-family:Segoe UI,-apple-system,Helvetica Neue,Arial,sans-serif;font-size:8.5px;font-weight:700;letter-spacing:2px;fill:#6b2460}
.gd1{animation-delay:.4s}.gd2{animation-delay:.8s}
.tagin{animation:shine2 8s ease-in-out infinite}
@keyframes shine2{0%,100%{opacity:.9}50%{opacity:1}}
@media (min-aspect-ratio: 17/10){.tag{transform:translate(0,-30px)}}
@media (min-aspect-ratio: 2/1){.tag{transform:translate(0,-100px)}}
@media (min-aspect-ratio: 12/5){.tag{transform:translate(0,-170px)}}
@media (max-aspect-ratio: 3/2){.tag{transform:translate(-80px,0)}}
@media (max-aspect-ratio: 6/5){.tag{transform:translate(-220px,0)}}
@media (max-aspect-ratio: 1/1){.tag{transform:translate(-320px,0)}}
@media (max-aspect-ratio: 3/4){.tag{transform:translate(-440px,0)}}
@media (prefers-color-scheme: dark){
.s1{stop-color:#150822}.s2{stop-color:#2a0c3a}.s3{stop-color:#14102e}
.gl{stroke:#ff6ad5}.grid{opacity:.14}
.blob{opacity:.55}
.pearl{opacity:0}
.grain{opacity:.7}
.tagX{fill:#7a0d57}
.tag2{fill:#ffc2ec}
}
</style>`

// Verläufe in Objektkoordinaten, damit jede Kugel und jeder Ring sie teilen kann.
const DEFS = `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="s1"/><stop offset=".55" class="s2"/><stop offset="1" class="s3"/></linearGradient>
<radialGradient id="aqua"><stop offset="0" stop-color="#5ee7ff" stop-opacity=".8"/><stop offset="1" stop-color="#5ee7ff" stop-opacity="0"/></radialGradient>
<radialGradient id="pink"><stop offset="0" stop-color="#ff6ad5" stop-opacity=".7"/><stop offset="1" stop-color="#ff6ad5" stop-opacity="0"/></radialGradient>
<radialGradient id="violet"><stop offset="0" stop-color="#9b7bff" stop-opacity=".7"/><stop offset="1" stop-color="#9b7bff" stop-opacity="0"/></radialGradient>
<radialGradient id="lime"><stop offset="0" stop-color="#c4ff5c" stop-opacity=".5"/><stop offset="1" stop-color="#c4ff5c" stop-opacity="0"/></radialGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".18" stop-color="#ffb3e8" stop-opacity=".7"/><stop offset=".5" stop-color="#ff6ad5" stop-opacity=".25"/><stop offset="1" stop-color="#ff6ad5" stop-opacity="0"/></radialGradient>
<radialGradient id="floorGlow"><stop offset="0" stop-color="#ff6ad5" stop-opacity=".38"/><stop offset=".6" stop-color="#9b7bff" stop-opacity=".12"/><stop offset="1" stop-color="#9b7bff" stop-opacity="0"/></radialGradient>
<radialGradient id="pAqua"><stop offset="0" stop-color="#9ff2ff" stop-opacity="0.6"/><stop offset=".55" stop-color="#9ff2ff" stop-opacity="0.27"/><stop offset="1" stop-color="#9ff2ff" stop-opacity="0"/></radialGradient>
<radialGradient id="pWhite"><stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0.34"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<radialGradient id="pPink"><stop offset="0" stop-color="#ffb8e6" stop-opacity="0.6"/><stop offset=".55" stop-color="#ffb8e6" stop-opacity="0.27"/><stop offset="1" stop-color="#ffb8e6" stop-opacity="0"/></radialGradient>
<radialGradient id="pGold"><stop offset="0" stop-color="#ffe7a6" stop-opacity="0.5"/><stop offset=".55" stop-color="#ffe7a6" stop-opacity="0.23"/><stop offset="1" stop-color="#ffe7a6" stop-opacity="0"/></radialGradient>
<radialGradient id="pLilac"><stop offset="0" stop-color="#c9b6ff" stop-opacity="0.55"/><stop offset=".55" stop-color="#c9b6ff" stop-opacity="0.25"/><stop offset="1" stop-color="#c9b6ff" stop-opacity="0"/></radialGradient>
<radialGradient id="pMint"><stop offset="0" stop-color="#b8fff0" stop-opacity="0.5"/><stop offset=".55" stop-color="#b8fff0" stop-opacity="0.23"/><stop offset="1" stop-color="#b8fff0" stop-opacity="0"/></radialGradient>
<linearGradient id="chromeSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa4c2"/><stop offset=".14" stop-color="#d9dfee"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".46" stop-color="#e3e8f2"/><stop offset=".6" stop-color="#a9b2ca"/><stop offset=".7" stop-color="#7b84a3"/></linearGradient>
<linearGradient id="chromeGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2440"/><stop offset=".09" stop-color="#3d4566"/><stop offset=".28" stop-color="#8c7fb0"/><stop offset=".55" stop-color="#f2bfe4"/><stop offset=".8" stop-color="#ffe6f6"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<linearGradient id="pinkSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d77ab5"/><stop offset=".14" stop-color="#ffc4ea"/><stop offset=".3" stop-color="#fff4fb"/><stop offset=".46" stop-color="#ffcdee"/><stop offset=".6" stop-color="#f08acb"/><stop offset=".7" stop-color="#c83e8f"/></linearGradient>
<linearGradient id="pinkGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a0a3a"/><stop offset=".09" stop-color="#7c1660"/><stop offset=".3" stop-color="#c84598"/><stop offset=".58" stop-color="#ff9fdc"/><stop offset=".82" stop-color="#ffe2f5"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<linearGradient id="chromeEnv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".24" stop-color="#e4e8f3"/><stop offset=".4" stop-color="#b7bfd4"/><stop offset=".48" stop-color="#5d6584"/><stop offset=".51" stop-color="#3a405e"/><stop offset=".56" stop-color="#6f6a92"/><stop offset=".66" stop-color="#c3aedb"/><stop offset=".82" stop-color="#ffcfee"/><stop offset="1" stop-color="#fff5fc"/></linearGradient>
<linearGradient id="pinkEnv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4fb"/><stop offset=".24" stop-color="#ffc9ed"/><stop offset=".4" stop-color="#f08fcd"/><stop offset=".48" stop-color="#b8337f"/><stop offset=".51" stop-color="#6e1453"/><stop offset=".57" stop-color="#b03a8a"/><stop offset=".68" stop-color="#ff9ad9"/><stop offset=".84" stop-color="#ffe0f4"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<radialGradient id="sphShade" cx=".42" cy=".36" r=".68"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".66" stop-color="#1a1030" stop-opacity="0"/><stop offset="1" stop-color="#1a1030" stop-opacity=".5"/></radialGradient>
<radialGradient id="sphRim" cx=".5" cy=".5" r=".5"><stop offset=".8" stop-color="#7cecff" stop-opacity="0"/><stop offset=".94" stop-color="#a9f4ff" stop-opacity=".5"/><stop offset="1" stop-color="#ffffff" stop-opacity=".25"/></radialGradient>
<radialGradient id="spec"><stop offset="0" stop-color="#ffffff" stop-opacity=".98"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<linearGradient id="film" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5ee7ff"/><stop offset=".2" stop-color="#a78bff"/><stop offset=".42" stop-color="#ff7ad9"/><stop offset=".62" stop-color="#ffd36e"/><stop offset=".82" stop-color="#9dffcb"/><stop offset="1" stop-color="#5ee7ff"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#8f98b3"/><stop offset=".55" stop-color="#ffd0ef"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<radialGradient id="glass" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff" stop-opacity=".32"/><stop offset=".55" stop-color="#b9f3ff" stop-opacity=".07"/><stop offset="1" stop-color="#ff9be0" stop-opacity=".22"/></radialGradient>
<radialGradient id="bubble" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".72" stop-color="#ff9be0" stop-opacity=".05"/><stop offset=".93" stop-color="#5ee7ff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity=".4"/></radialGradient>
<linearGradient id="facetL" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6dcea"/></linearGradient>
<linearGradient id="facetD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c7595"/><stop offset="1" stop-color="#c2c9dc"/></linearGradient>
<linearGradient id="facetPL" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fff2fb"/><stop offset="1" stop-color="#ffb3e3"/></linearGradient>
<linearGradient id="facetPD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a5106f"/><stop offset="1" stop-color="#ff8ad8"/></linearGradient>
<linearGradient id="flareH" gradientUnits="userSpaceOnUse" x1="-170" y1="0" x2="170" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<linearGradient id="flareV" gradientUnits="userSpaceOnUse" x1="0" y1="-170" x2="0" y2="170"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<radialGradient id="sparkFill"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ffe6f7"/><stop offset="1" stop-color="#ff8ad8"/></radialGradient>
<radialGradient id="sparkGlow"><stop offset="0" stop-color="#ffffff" stop-opacity=".7"/><stop offset=".4" stop-color="#ff9be0" stop-opacity=".25"/><stop offset="1" stop-color="#ff9be0" stop-opacity="0"/></radialGradient>
<linearGradient id="holo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5ee7ff" stop-opacity="0"/><stop offset=".28" stop-color="#5ee7ff" stop-opacity=".07"/><stop offset=".42" stop-color="#a78bff" stop-opacity=".16"/><stop offset=".485" stop-color="#ffffff" stop-opacity=".4"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".8"/><stop offset=".515" stop-color="#ffffff" stop-opacity=".4"/><stop offset=".58" stop-color="#ff7ad9" stop-opacity=".18"/><stop offset=".72" stop-color="#ffd36e" stop-opacity=".07"/><stop offset="1" stop-color="#ffd36e" stop-opacity="0"/></linearGradient>
<linearGradient id="tagfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".38" stop-color="#ffc4ea"/><stop offset=".5" stop-color="#e8189c"/><stop offset=".53" stop-color="#7a0d57"/><stop offset=".62" stop-color="#ff7ad0"/><stop offset="1" stop-color="#ffe3f5"/></linearGradient>
<linearGradient id="rule" gradientUnits="userSpaceOnUse" x1="1400" y1="0" x2="1562" y2="0"><stop offset="0" stop-color="#ff6ad5" stop-opacity="0"/><stop offset=".7" stop-color="#ff6ad5"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" class="gl" stroke-width=".7"/></pattern>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<mask id="gridfade"><rect width="1600" height="340" fill="url(#fade)"/></mask>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 .55 0 0 0 0 .5 0 0 0 0 .6 0 0 0 .07 0"/></filter>
</defs>`

export const DEFAULT_LABEL = 'Y2K Studio'

// Der Streifen, der über den Bildschirm wischt: an/aus, alle wie viele Sekunden, wie lange ein Wisch dauert.
export type SweepOptions = { on: boolean; every: number; duration: number }

export const DEFAULT_SWEEP: SweepOptions = { on: true, every: 40, duration: 6 }

// Überschreibt Takt und Dauer von Streifen und Funkeln (die letzte Regel im Stil gewinnt).
const sweepRules = (sweep: SweepOptions) => {
  if (!sweep.on) {
    return '.sweep{display:none}'
  }
  const every = Math.max(4, sweep.every)
  const share = Math.min(90, (Math.min(sweep.duration, every - 1) / every) * 100)
  // Das Funkeln im Streifen lief bisher auf 0–15 % des Takts; es wird auf den neuen Anteil gestreckt.
  const at = (p: number) => `${((p / 15) * share).toFixed(2)}%`

  return [
    `.sweep{animation-duration:${every}s}`,
    `.glint{animation-duration:${every}s}`,
    `@keyframes sweep{0%{transform:translateX(0)}${at(15)}{transform:translateX(3700px)}100%{transform:translateX(3700px)}}`,
    `@keyframes glint{0%,${at(2)}{opacity:0;transform:scale(.3)}${at(5)}{opacity:1;transform:scale(1)}${at(9)}{opacity:.4;transform:scale(.7)}${at(12)}{opacity:1;transform:scale(1.1)}${at(15)},100%{opacity:0;transform:scale(.3)}}`,
  ].join('')
}

// Die ganze Szene; labelRaw ist der Text des Schilds unten rechts, null blendet es aus.
export const sceneFor = (labelRaw: string | null, sweep: SweepOptions = DEFAULT_SWEEP) => {
  const body = `<rect width="1600" height="1000" fill="url(#sky)"/>
<rect class="grid" width="1600" height="340" fill="url(#grid)" mask="url(#gridfade)"/>
<g class="blob">
<circle class="drift1" cx="200" cy="140" r="380" fill="url(#aqua)"/>
<circle class="drift3" cx="300" cy="560" r="300" fill="url(#violet)"/>
<circle class="drift2" cx="1460" cy="170" r="400" fill="url(#pink)"/>
<circle class="drift3" cx="1500" cy="920" r="440" fill="url(#violet)"/>
<circle class="drift1" cx="90" cy="930" r="360" fill="url(#pink)"/>
<circle class="drift3" cx="760" cy="-60" r="300" fill="url(#pink)"/>
<circle class="drift2" cx="-40" cy="420" r="220" fill="url(#lime)"/>
</g>
<g class="pearl">
<g transform="rotate(-16 560 180)">
<ellipse class="drift2" cx="260" cy="180" rx="440" ry="120" fill="url(#pAqua)"/>
<ellipse class="drift2" cx="560" cy="180" rx="380" ry="95" fill="url(#pWhite)"/>
<ellipse class="drift2" cx="840" cy="180" rx="430" ry="115" fill="url(#pPink)"/>
<ellipse class="drift2" cx="1080" cy="180" rx="320" ry="90" fill="url(#pGold)"/>
</g>
<g transform="rotate(-12 1060 760)">
<ellipse class="drift3" cx="700" cy="760" rx="460" ry="130" fill="url(#pLilac)"/>
<ellipse class="drift3" cx="1020" cy="760" rx="400" ry="100" fill="url(#pWhite)"/>
<ellipse class="drift3" cx="1320" cy="760" rx="420" ry="120" fill="url(#pMint)"/>
</g>
</g>
${helix(392, 30, 400)}
${tube('M1640 300C1500 330 1380 420 1352 560S1420 760 1640 800', 11, 5)}
${planet(1415, 215, 82, 224, 62, -18, 'chrome', 12, 0)}
${sphere(392, 300, 40, 'pink', 2)}
${butterfly(500, 650, 0.95, -12)}
${star(1305, 540, 1)}
${BUBBLES}
<g transform="rotate(-22 800 500)"><g class="sweep"><rect x="-2200" y="-800" width="900" height="2600" fill="url(#holo)"/><g transform="translate(-1750 180) scale(2.4)"><g class="glint"><circle r="9" fill="url(#sparkGlow)"/><path d="${SPARK}" fill="url(#sparkFill)"/></g></g><g transform="translate(-1750 520) scale(1.6)"><g class="glint gd1"><circle r="9" fill="url(#sparkGlow)"/><path d="${SPARK}" fill="url(#sparkFill)"/></g></g><g transform="translate(-1750 860) scale(2)"><g class="glint gd2"><circle r="9" fill="url(#sparkGlow)"/><path d="${SPARK}" fill="url(#sparkFill)"/></g></g></g></g>
${SPARKLES}
${labelRaw === null ? '' : tag(labelRaw)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
${STYLE.replace('</style>', timingRules.join(' ') + sweepRules(sweep) + '</style>')}
${DEFS.replace('</defs>', [...clipDefs.values()].join('') + '</defs>')}
${body}
</svg>`
}

export const SCENE = sceneFor(DEFAULT_LABEL)

// ---------- Label als eigenes Schild über dem Eingabefeld ----------
// Liegt nicht unter dem Milchglas und bleibt deshalb scharf.
export const labelText = (text: string) => `${text} · V${VERSION} · ${DATE}`

export const labelSvg = (raw: string) => {
  const text = xml(raw)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 52" width="400" height="52">
<style>
.t1{font-family:Segoe UI Black,Arial Black,-apple-system,Helvetica Neue,sans-serif;font-size:25px;font-weight:900;font-style:italic;letter-spacing:.4px}
.tf{fill:url(#lf);stroke:#ffffff;stroke-opacity:.9;stroke-width:.7px;paint-order:stroke}
.tx{fill:#9a0f6b}
.t2{font-family:Segoe UI,-apple-system,Helvetica Neue,Arial,sans-serif;font-size:9.5px;font-weight:600;letter-spacing:3px;fill:#c46fb3}
.gl{transform-box:fill-box;transform-origin:center;animation:tw 6s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:1;transform:scale(1) rotate(0deg)}50%{opacity:.4;transform:scale(.6) rotate(25deg)}}
@media (prefers-color-scheme: dark){.tx{fill:#7a0d57}.t2{fill:#ffc2ec}}
</style>
<defs>
<linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".38" stop-color="#ffc4ea"/><stop offset=".5" stop-color="#e8189c"/><stop offset=".53" stop-color="#7a0d57"/><stop offset=".62" stop-color="#ff7ad0"/><stop offset="1" stop-color="#ffe3f5"/></linearGradient>
<linearGradient id="lr" gradientUnits="userSpaceOnUse" x1="150" y1="0" x2="384" y2="0"><stop offset="0" stop-color="#ff6ad5" stop-opacity="0"/><stop offset=".7" stop-color="#ff6ad5"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<radialGradient id="lg"><stop offset="0" stop-color="#ffffff" stop-opacity=".8"/><stop offset=".4" stop-color="#ff9be0" stop-opacity=".3"/><stop offset="1" stop-color="#ff9be0" stop-opacity="0"/></radialGradient>
<radialGradient id="ls"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ffe6f7"/><stop offset="1" stop-color="#ff8ad8"/></radialGradient>
</defs>
<text x="384" y="27" text-anchor="end" class="t1 tx" transform="translate(2 2)">${text}</text>
<text x="384" y="27" text-anchor="end" class="t1 tx" transform="translate(1 1)" opacity=".75">${text}</text>
<text x="384" y="27" text-anchor="end" class="t1 tf">${text}</text>
<path d="M150 34H384" stroke="url(#lr)" stroke-width="1"/>
<g transform="translate(391 34) scale(.5)"><g class="gl"><circle r="9" fill="url(#lg)"/><path d="${SPARK}" fill="url(#ls)"/></g></g>
<text x="384" y="48" text-anchor="end" class="t2">V${VERSION} · ${DATE}</text>
</svg>`
}
