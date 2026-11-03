import React, { useState } from 'react'
import { render, Text, useInput } from 'ink'
const log = []
function Menu() {
  const [cursor, setCursor] = useState(0)
  useInput((input, key) => {
    if (key.downArrow) { log.push('menu-down'); setCursor((c) => c + 1) }
    if (key.upArrow) { log.push('menu-up'); setCursor((c) => Math.max(0, c - 1)) }
  })
  return React.createElement(Text, null, `MENU cursor=${cursor}`)
}
function Prompt() {
  const [h, setH] = useState(0)
  useInput((input, key) => {
    if (key.downArrow) { log.push('prompt-down'); setH((x) => x + 1) }
    if (key.upArrow) { log.push('prompt-up'); setH((x) => x + 1) }
  })
  return React.createElement(Text, null, `PROMPT hist=${h}`)
}
function App() {
  return React.createElement(React.Fragment, null,
    React.createElement(Prompt),
    React.createElement(Menu))
}
render(React.createElement(App))
process.on('SIGUSR1', () => process.stderr.write('LOG ' + JSON.stringify(log) + '\n'))
