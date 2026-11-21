import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Steht für die Zeile, die die Engine selbst zeichnet.
const engineRow = (on: On) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text key="row">Bash(ls)</Text>
  })
}

const ROW = {
  plugin: 'y2k',
  component: 'ToolUse',
  props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: true, isErrored: false, isInterrupted: false },
} as const

test('Desktop: Tool-Zeile bekommt eine Chrom-Perle und behält die Zeile', async ($, on) => {
  engineRow(on)
  const ui = await $.ui.mount({ ...ROW, surface: 'desktop' })

  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('Terminal: Tool-Zeile bleibt unverändert', async ($, on) => {
  engineRow(on)
  const ui = await $.ui.mount({ ...ROW, surface: 'terminal' })

  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('Schild aus: Szene ohne Schild, Icons aus: keine Perle', { options: { schild: 'aus', icons: 'aus' } }, async ($, on) => {
  engineRow(on)
  const ui = await $.ui.mount({ ...ROW, surface: 'desktop' })

  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})
