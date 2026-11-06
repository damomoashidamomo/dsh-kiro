"""
Fabricate on-disk sessions for the PTY tests.

A dsh session lives at ``$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd``
where ``<source>`` encodes the session cwd (``/tmp/x`` -> ``--tmp-x--``, a space
becomes ``~0020``). The log is an append log of CONCATENATED zstd frames — one
frame per durable write — and the platform only loads a session whose header
sits in the frame-0 group and whose event sequence is continuous, so the
fixture writes one frame per event and a header with every required field.

The tests use this to get real session rows (with titles and timestamps) into
the ``/chat`` picker without waiting for a live turn.
"""

from __future__ import annotations

import json
import os
import subprocess

HOME = os.path.expanduser('~/.dsh')

_NODE_WRITER = r"""
const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const { cwd, home, specs } = JSON.parse(process.argv[1])
const source = '--' + cwd.replace(/^\//, '').replace(/\//g, '-').replace(/ /g, '~0020') + '--'
const dir = path.join(home, 'sessions', source)
fs.mkdirSync(dir, { recursive: true })
const made = []
for (const spec of specs) {
  const now = Date.now()
  const events = [{
    type: 'session', version: 3, id: spec.id, createdAt: spec.createdAt ?? now,
    cwd, isSeeded: false, delegationDepth: 0,
  }]
  events.push({
    type: 'user/message', seq: 0, time: now,
    data: { content: [{ type: 'text', text: spec.firstUser }], source: { kind: 'user' }, role: 'user', id: 'u1' },
    surfaceOp: 'append',
  })
  if (spec.title) {
    events.push({ type: 'session/title', seq: 1, time: now, data: { title: spec.title }, surfaceOp: 'append' })
  }
  // One zstd frame per append, exactly like the real writer.
  const frames = events.map((event) => z.zstdCompressSync(Buffer.from(JSON.stringify(event) + '\n')))
  const target = path.join(dir, spec.id)
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'session.v3.jsonl.zstd'), Buffer.concat(frames))
  made.push(target)
}
console.log(JSON.stringify({ dir, made }))
"""


def sessions_dir(cwd: str, home: str = HOME) -> str:
    """The encoded source directory a session for ``cwd`` lives in."""
    clean = cwd.replace('/', '-', 1).replace('/', '-').replace(' ', '~0020')
    return os.path.join(home, 'sessions', f'--{clean}--')


def make_sessions(cwd: str, specs: list[dict], home: str = HOME) -> list[str]:
    """Write one session file per spec; returns the session directories made."""
    payload = json.dumps({'cwd': cwd, 'home': home, 'specs': specs})
    # Pass the payload on stdin: long first messages overflow argv.
    result = subprocess.run(
        ['node', '-e', _NODE_WRITER.replace('process.argv[1]', 'require("node:fs").readFileSync(0, "utf8")')],
        input=payload, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])['made']
