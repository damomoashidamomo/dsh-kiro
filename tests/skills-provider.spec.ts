import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/skills/index'

/**
 * The skills provider's `get()` must return the FULL platform skill
 * definition: the registry validates every loaded skill (name, description,
 * source, provider, content — all strings). A bare
 * `{name, provider, content, path}` used to pass `list()` but failed at load
 * time with `loaded skill "x" description must be a string`.
 */

interface Provider {
  list(): Promise<Array<{ name: string; description: string; path?: string; invocation?: { modelInvocable: boolean } }>>
  get(candidate: { locator: { path: string }; name: string; provider: string }): Promise<Record<string, unknown>>
}

let dir = ''
let provider: Provider | undefined

function writeSkill(name: string, frontmatter: string, body = 'instruction body'): string {
  const skillDir = join(dir, '.dsh-kiro', 'skills', name)
  mkdirSync(skillDir, { recursive: true })
  const path = join(skillDir, 'SKILL.md')
  writeFileSync(path, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8')
  return path
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-skills-provider-'))
  process.chdir(dir)
  const registered: unknown[] = []
  const ctx = {
    skills: {
      registerProvider(create: (control: unknown) => unknown) {
        registered.push(create({ invalidate: () => undefined }))
        return () => undefined
      },
    },
    provide: () => undefined,
  }
  apply(ctx as never)
  provider = registered[0] as Provider
})

afterEach(() => {
  process.chdir('/')
  rmSync(dir, { recursive: true, force: true })
})

describe('kiro skills provider get()', () => {
  it('returns the full definition: description, source, invocation, metadata', async () => {
    const path = writeSkill('full', 'name: full\ndescription: 完整技能\nwhen-to-use: MUST load first')
    const loaded = await provider!.get({ locator: { path }, name: 'full', provider: 'kiro' })
    expect(loaded['name']).toBe('full')
    expect(loaded['description']).toBe('完整技能')
    expect(loaded['source']).toBe('kiro')
    expect(loaded['provider']).toBe('kiro')
    expect(loaded['content']).toBe('instruction body')
    expect(loaded['path']).toBe(path)
    expect(loaded['whenToUse']).toBe('MUST load first')
    expect(loaded['invocation']).toEqual({ modelInvocable: true, userInvocable: true })
    expect((loaded['metadata'] as Record<string, unknown>)['description']).toBe('完整技能')
  })

  it('falls back to the skill name when the description is missing', async () => {
    const path = writeSkill('nodesc', 'name: nodesc')
    const loaded = await provider!.get({ locator: { path }, name: 'nodesc', provider: 'kiro' })
    expect(typeof loaded['description']).toBe('string')
    expect(loaded['description']).toBe('nodesc')
  })

  it('honours disable-model-invocation', async () => {
    const path = writeSkill('manual', 'name: manual\ndescription: 手动\ndisable-model-invocation: "true"')
    const loaded = await provider!.get({ locator: { path }, name: 'manual', provider: 'kiro' })
    expect(loaded['invocation']).toEqual({ modelInvocable: false, userInvocable: true })
  })

  it('still lists the skill with its description after the get() shape change', async () => {
    writeSkill('listed', 'name: listed\ndescription: 清单里能看到')
    const rows = await provider!.list()
    const row = rows.find((entry) => entry.name === 'listed')
    expect(row?.description).toBe('清单里能看到')
    expect(existsSync(row?.path ?? '')).toBe(true)
  })
})
