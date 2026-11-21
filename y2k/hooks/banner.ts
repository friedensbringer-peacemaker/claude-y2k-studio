// Eigene Pixel-Schrift (5×7) für Y2K-Banner: einmal als Raster fürs Overlay,
// einmal als ASCII-Art aus Blockzeichen für den Chat. Selbst gezeichnet, keine fremden Schriften.

const GLYPHS: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  Ä: '.#.#. ..... .###. #...# ##### #...# #...#',
  Ö: '.#.#. ..... .###. #...# #...# #...# .###.',
  Ü: '.#.#. ..... #...# #...# #...# #...# .###.',
  ß: '.##.. #..#. #..#. #.##. #...# #...# #.##.',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '.###. #.... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ....# .###.',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '.': '..... ..... ..... ..... ..... ..... ..#..',
  ',': '..... ..... ..... ..... ..... ..#.. .#...',
  ':': '..... ..#.. ..... ..... ..... ..#.. .....',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '&': '.##.. #..#. .##.. .#... #.#.# #..#. .##.#',
  '*': '..#.. #.#.# .###. ##### .###. #.#.# ..#..',
  '✧': '..#.. #.#.# .###. ##### .###. #.#.# ..#..',
  '♥': '..... .#.#. ##### ##### .###. ..#.. .....',
  ' ': '... ... ... ... ... ... ...',
}

const ROWS = 7
const MAX_CHARS_PER_LINE = 12
const MAX_LINES = 3

// Zerlegt den Text in höchstens drei Zeilen zu je höchstens zwölf Zeichen (an Leerzeichen).
export function bannerLines(text: string): string[] {
  const words = text.toUpperCase().replace(/\s+/g, ' ').trim().split(' ').filter(word => word !== '')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const piece = word.slice(0, MAX_CHARS_PER_LINE)

    if (line === '') {
      line = piece
    } else if (line.length + 1 + piece.length <= MAX_CHARS_PER_LINE) {
      line = `${line} ${piece}`
    } else {
      lines.push(line)
      line = piece
    }
  }
  if (line !== '') {
    lines.push(line)
  }

  return lines.slice(0, MAX_LINES)
}

// Raster aus '#' (Pixel) und '.' (leer): 7 Reihen je Textzeile, eine Leerreihe dazwischen.
export function bannerGrid(text: string): string[] {
  const grid: string[] = []

  bannerLines(text).forEach((line, index) => {
    if (index > 0) {
      grid.push('')
    }
    const rows = Array.from({ length: ROWS }, () => '')

    for (const char of Array.from(line)) {
      const glyph = (GLYPHS[char] ?? GLYPHS['?'] ?? '').split(' ')

      for (let r = 0; r < ROWS; r++) {
        rows[r] += `${glyph[r]}.`
      }
    }
    grid.push(...rows.map(row => row.slice(0, -1)))
  })
  const width = Math.max(0, ...grid.map(row => row.length))

  return grid.map(row => row.padEnd(width, '.'))
}

// ASCII-Art aus Blockzeichen, je Pixel zwei Zeichen breit: oben hell (█), Mitte ▓, unten ▒,
// dazu ein Schatten (░) rechts unterhalb jeder Form, wie bei alten ANSI-Bannern.
export function bannerAscii(text: string): string {
  const grid = bannerGrid(text)

  if (grid.length === 0) {
    return ''
  }
  const at = (r: number, c: number) => grid[r]?.[c] === '#'
  const lines: string[] = []

  // Eine Reihe mehr als das Raster, damit der Schatten der untersten Reihe Platz hat.
  for (let r = 0; r <= grid.length; r++) {
    // Reihe innerhalb der Textzeile (0–6): jede Textzeile belegt 7 Reihen plus eine Leerreihe.
    const rowInLine = r % (ROWS + 1)
    let out = ''

    for (let c = 0; c <= (grid[0]?.length ?? 0); c++) {
      if (at(r, c)) {
        out += rowInLine <= 1 ? '██' : rowInLine <= 4 ? '▓▓' : '▒▒'
      } else if (at(r - 1, c - 1)) {
        out += '░░'
      } else {
        out += '  '
      }
    }
    lines.push(out.replace(/\s+$/, ''))
  }

  return lines.join('\n').replace(/\n+$/, '')
}
