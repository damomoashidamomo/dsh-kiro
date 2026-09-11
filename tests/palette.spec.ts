import { describe, it, expect } from 'vitest'
import { palette, banner } from '../src/theme/palette'
import { BANNER } from '../src/theme/banner'

describe('palette', () => {
  it('exposes semantic tokens', () => {
    expect(palette).toHaveProperty('accent')
    expect(palette).toHaveProperty('accent2')
    expect(palette).toHaveProperty('success')
    expect(palette).toHaveProperty('warning')
    expect(palette).toHaveProperty('error')
    expect(palette).toHaveProperty('muted')
    expect(palette).toHaveProperty('bold')
    expect(palette).toHaveProperty('dim')
    expect(palette).toHaveProperty('heading')
  })

  it('reports enabled state', () => {
    expect(typeof palette.enabled).toBe('boolean')
  })

  it('does not throw when called on tokens', () => {
    expect(() => palette.accent('hello')).not.toThrow()
    expect(() => palette.dim('hello')).not.toThrow()
    expect(() => palette.muted('hello')).not.toThrow()
  })
})

describe('banner', () => {
  it('returns the input string when colors are disabled', () => {
    // In non-TTY contexts the banner is just the source.
    if (!palette.enabled) {
      expect(banner(BANNER)).toBe(BANNER)
    } else {
      // In color mode the output is wrapped in ANSI codes; just sanity-check length.
      const out = banner(BANNER)
      expect(out.length).toBeGreaterThan(BANNER.length)
    }
  })

  it('preserves newlines', () => {
    const text = 'A\nB\nC'
    const out = banner(text)
    expect(out.split('\n').length).toBe(text.split('\n').length)
  })
})
