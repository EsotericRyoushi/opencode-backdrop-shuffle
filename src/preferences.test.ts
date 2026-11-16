import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Preferences, initial, wallpaperAppearance } from "./preferences"
import { wallpaperBackground } from "./style"

test("starts with wallpaper off and no selection while retaining unknown selections from old saves", () => {
  expect(Schema.decodeUnknownSync(Preferences)(initial)).toMatchObject({ enabled: false, preset: "", image: "" })
  const saved = { ...initial, enabled: true, preset: "legacy-selection" }
  expect(Schema.decodeUnknownSync(Preferences)(saved)).toEqual(saved)
})

test("maps every alignment to a CSS background position", () => {
  const positions = {
    "top-left": "left top",
    "top": "center top",
    "top-right": "right top",
    "left": "left center",
    "center": "center",
    "right": "right center",
    "bottom-left": "left bottom",
    "bottom": "center bottom",
    "bottom-right": "right bottom",
  } as const
  for (const [align, position] of Object.entries(positions)) {
    const settings = Schema.decodeUnknownSync(Preferences)({ ...initial, align })
    expect(wallpaperBackground(settings, "blob:wallpaper")["--wallpaper-background-position"]).toBe(position)
  }
})

describe("wallpaper tint and brightness", () => {  test("preserves old strength settings as tint and defaults brightness without rewriting preferences", () => {
    for (const strength of [5, 20, 45]) {
      const settings = Schema.decodeUnknownSync(Preferences)({ ...initial, enabled: true, strength })
      expect(wallpaperAppearance(settings).tint).toBe(100 - strength)
      expect(wallpaperBackground(settings, "blob:wallpaper")["--wallpaper-filter"]).toContain("brightness(100%)")
      expect(settings.tint).toBeUndefined()
      expect(settings.brightness).toBeUndefined()
    }
  })

  test("persists independent tint and brightness, including zero tint", () => {
    const settings = Schema.decodeUnknownSync(Preferences)({ ...initial, enabled: true, tint: 0, brightness: 150 })
    const saved = Schema.decodeUnknownSync(Preferences)(JSON.parse(JSON.stringify(settings)))
    expect(wallpaperAppearance(saved).tint).toBe(0)
    expect(wallpaperBackground(saved, "blob:wallpaper")).toEqual({
      "--wallpaper-image": 'url("blob:wallpaper")',
      "--wallpaper-fit": "contain",
      "--wallpaper-background-position": "right bottom",
      "--wallpaper-tint": "color-mix(in srgb, var(--v2-background-bg-base) 0%, transparent)",
      "--wallpaper-filter": "brightness(150%) contrast(85%) saturate(90%)",
    })
    expect(wallpaperBackground({ ...saved, enabled: false }, "blob:wallpaper")["--wallpaper-image"]).toBe("none")
    expect(wallpaperBackground({ ...saved, enabled: false }, "blob:wallpaper")["--wallpaper-filter"]).toBe("none")
    expect(wallpaperBackground(saved, "")["--wallpaper-tint"]).toBe("transparent")
    expect(wallpaperBackground(saved, "")["--wallpaper-filter"]).toBe("none")
  })

  test.each([
    ["tint", -1], ["tint", 101], ["tint", 25.5],
    ["brightness", 24], ["brightness", 151], ["brightness", 100.5],
  ])("rejects invalid %s value %s", (property, value) => {
    expect(() => Schema.decodeUnknownSync(Preferences)({ ...initial, [property]: value })).toThrow()
  })
})
