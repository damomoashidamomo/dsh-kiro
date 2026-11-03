import React, { useState } from 'react'
import { render, Text, useInput } from 'ink'
function Child({ n, bump }) {
  useInput((input) => {
    if (input === 'x') { process.stderr.write(`SAW ${n}\n`) }
    if (input === 'b') bump()
  })
  return React.createElement(Text, null, `n=${n}`)
}
function App() {
  const [n, setN] = useState(0)
  return React.createElement(Child, { n, bump: () => setN((v) => v + 1) })
}
render(React.createElement(App))
