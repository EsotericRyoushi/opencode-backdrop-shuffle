import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Preferences, initial } from "./preferences"
import { wallpaperLayers, wallpaperPanels, wallpaperStyle, wallpaperSurfaces } from "./style"

test("tints the image within readability limits and withdraws styles when disabled or unavailable", () => {
  expect(() => Schema.decodeUnknownSync(Preferences)({ ...initial, strength: 4 })).toThrow()
  expect(() => Schema.decodeUnknownSync(Preferences)({ ...initial, strength: 46 })).toThrow()
  const settings = Schema.decodeUnknownSync(Preferences)({ ...initial, enabled: true, strength: 45, fit: "contain" })
  const css = wallpaperStyle(settings, "blob:wallpaper")
  expect(css).toContain("var(--v2-background-bg-base) 55%, transparent")
  expect(css).toContain("--wallpaper-fit: contain")
  expect(css).toContain("--wallpaper-background-position: right bottom")
  expect(css.replace(/\[data-component="new-session"\] \[data-slot="wordmark-flat"\][^{]+\{[^}]+\}/g, "")).not.toContain("opacity:")
  expect(wallpaperStyle({ ...settings, enabled: false }, "blob:wallpaper")).toBe("")
  expect(wallpaperStyle(settings, "")).toBe("")
})

describe("transparent wallpaper surfaces", () => {
  test("scopes every override to a wallpaper panel without replacing app theme tokens", () => {
    const styles = wallpaperSurfaces.replace(/\/\*[\s\S]*?\*\//g, "")
    const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    expect(rules.length).toBeGreaterThan(10)
    for (const [, selectors, declarations] of rules) {
      let depth = 0
      const topLevel = Array.from(selectors.trim(), (character) => {
        if (character === "(") depth++
        if (character === ")") depth--
        return character === "," && depth === 0 ? "\n" : character
      }).join("").split("\n").map((selector) => selector.trim()).filter(Boolean)
      for (const selector of topLevel) {
        expect(selector).toMatch(/^(?:\[data-(?:slot|component)="(?:home-panel|session-chat-panel|new-session)"\]|:is\(\[data-slot="home-panel"\])/)
      }
      expect(declarations).not.toMatch(/--v2-[\w-]+\s*:/)
    }
  })

  test("does not paint opaque reading columns or fill logo counters", () => {
    expect(wallpaperSurfaces).not.toContain("--wallpaper-surface")
    expect(wallpaperSurfaces).not.toContain("--wallpaper-reading-width")
    expect(wallpaperSurfaces).not.toContain("background-color: var(--v2-background-bg-base)")
    expect(wallpaperSurfaces).toContain("--home-row-background: transparent")
    expect(wallpaperSurfaces).toContain("--icon-weak-base: transparent")
    expect(wallpaperSurfaces).toContain("text-shadow: var(--wallpaper-text-shadow)")
    expect(wallpaperSurfaces).not.toMatch(/(?:^|[;{\n])\s*(?:padding|margin|height|overflow)\s*:/)
    const opacityRules = [...wallpaperSurfaces.matchAll(/([^{}]+)\{[^{}]*opacity\s*:\s*([^;]+);[^{}]*\}/g)]
    expect(opacityRules).toHaveLength(1)
    expect(opacityRules[0][1]).toContain('[data-slot="wordmark-flat"] > svg:first-child > g > g')
    expect(opacityRules[0][2]).toBe("0.65")
  })

  test("filters only image pseudo-elements and composites tint separately", () => {
    const layers = wallpaperLayers(wallpaperPanels)
    expect(layers).toContain("background-image: var(--wallpaper-image, none)")
    expect(layers).toContain("background-size: var(--wallpaper-background-size, var(--wallpaper-fit, cover))")
    expect(layers).toContain("background-position: var(--wallpaper-background-position, center)")
    expect(layers).toContain("background-clip: padding-box")
    expect(layers).toContain("width: auto")
    expect(layers).toContain("height: auto")
    expect(layers).toContain("pointer-events: none")
    expect(layers).toContain("backdrop-filter: none")
    expect(layers).not.toContain("blur(")
    const filterRule = [...layers.matchAll(/([^{}]+)\{[^{}]*filter:\s*var\(--wallpaper-filter[^{}]*\}/g)]
    expect(filterRule).toHaveLength(1)
    expect(filterRule[0][1].trim().endsWith("::before")).toBe(true)
    expect(layers).toContain("background: var(--wallpaper-tint, transparent)")
  })

  test("keeps row interaction states and improves the search placeholder", () => {
    expect(wallpaperSurfaces).toContain('[data-home-row]:is(:hover, :focus-within, :has([data-menu="true"]))')
    expect(wallpaperSurfaces).toContain('[data-home-row][data-selected]')
    expect(wallpaperSurfaces).toContain('input::placeholder')
  })

  test("keeps the native pin and paddle layers above the wallpaper without forcing game visibility", () => {
    const layers = wallpaperLayers(wallpaperPanels)
    const indices = [...layers.matchAll(/z-index:\s*(-?\d+)/g)].map((match) => Number(match[1]))
    expect(indices).toHaveLength(2)
    expect(indices.every((index) => index < -10)).toBe(true)
    expect(wallpaperSurfaces).toContain('[data-slot="new-session-pins"]')
    expect(wallpaperSurfaces).toContain('[data-slot="brick-breaker-paddle"]')
    expect(wallpaperSurfaces).toContain('[data-slot="brick-breaker-hud"]')
    expect(wallpaperSurfaces).not.toMatch(/brick-breaker-hud[^{}]*\{[^{}]*opacity:/)
  })
})
