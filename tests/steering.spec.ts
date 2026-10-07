import { describe, it, expect } from 'vitest'
import { composeSteeringPrompt } from '../src/steering'
import type { SteeringFile } from '../src/steering/loader'

function file(name: string, source: 'user' | 'project', content: string, description = ''): SteeringFile {
  return {
    name, source, path: `/${source}/${name}.md`, kind: 'always',
    includeFiles: [], excludeFiles: [], description, content,
  }
}

describe('composeSteeringPrompt', () => {
  it('returns empty for no applicable files', () => {
    expect(composeSteeringPrompt([])).toBe('')
  })

  it('places user-level guidance before project-level (project wins attention)', () => {
    const out = composeSteeringPrompt([
      file('project-rules', 'project', 'PROJECT RULE TEXT'),
      file('user-prefs', 'user', 'USER PREF TEXT'),
    ])
    const userAt = out.indexOf('USER PREF TEXT')
    const projectAt = out.indexOf('PROJECT RULE TEXT')
    expect(userAt).toBeGreaterThanOrEqual(0)
    expect(projectAt).toBeGreaterThan(userAt)
  })

  it('includes each file as a heading with its description', () => {
    const out = composeSteeringPrompt([file('code-style', 'project', 'Use tabs.', '风格约束')])
    expect(out).toContain('## code-style — 风格约束')
    expect(out).toContain('Use tabs.')
  })

  it('truncates the payload at the budget cap', () => {
    const huge = 'x'.repeat(40_000)
    const out = composeSteeringPrompt([file('big', 'user', huge), file('tail', 'user', 'NEVER REACHED')])
    expect(out.length).toBeLessThan(40_000)
    expect(out).toContain('(truncated)')
    expect(out).not.toContain('NEVER REACHED')
  })
})
