import { expect, test } from "bun:test"
import { alignWallpaperHeaders, wallpaperHeaderGeometry } from "./backdrop"

test("aligns header copies to the entire panel without stretching the image", () => {
  expect(wallpaperHeaderGeometry(
    { left: 20, top: 40, width: 1000, height: 600 },
    { left: 120, top: 90, width: 744, height: 36 },
    { width: 2000, height: 1000 }, "cover",
  )).toEqual({
    "--wallpaper-background-size": "1200px 600px",
    "--wallpaper-background-position": "-200px -50px",
  })
})

test("uses the same centered letterboxes as the panel in contain mode", () => {
  expect(wallpaperHeaderGeometry(
    { left: 20, top: 40, width: 1000, height: 600 },
    { left: 120, top: 90, width: 744, height: 36 },
    { width: 2000, height: 1000 }, "contain",
  )).toEqual({
    "--wallpaper-background-size": "1000px 500px",
    "--wallpaper-background-position": "-100px 0px",
  })
})

test("anchors header copies to the bottom-right corner in contain mode", () => {
  expect(wallpaperHeaderGeometry(
    { left: 20, top: 40, width: 1000, height: 600 },
    { left: 120, top: 90, width: 744, height: 36 },
    { width: 2000, height: 1000 }, "contain", "bottom-right",
  )).toEqual({
    "--wallpaper-background-size": "1000px 500px",
    "--wallpaper-background-position": "-100px 50px",
  })
})

test("anchors header copies to the top-left corner in contain mode", () => {
  expect(wallpaperHeaderGeometry(
    { left: 20, top: 40, width: 1000, height: 600 },
    { left: 120, top: 90, width: 744, height: 36 },
    { width: 2000, height: 1000 }, "contain", "top-left",
  )).toEqual({
    "--wallpaper-background-size": "1000px 500px",
    "--wallpaper-background-position": "-100px -50px",
  })
})

test("anchors cropped header copies to the bottom-right corner in cover mode", () => {
  expect(wallpaperHeaderGeometry(
    { left: 20, top: 40, width: 1000, height: 600 },
    { left: 120, top: 90, width: 744, height: 36 },
    { width: 2000, height: 1000 }, "cover", "bottom-right",
  )).toEqual({
    "--wallpaper-background-size": "1200px 600px",
    "--wallpaper-background-position": "-300px -50px",
  })
})

test("keeps fractional offsets and handles headers partly outside the panel", () => {
  const geometry = wallpaperHeaderGeometry(
    { left: 20.25, top: 40.25, width: 900.5, height: 600.5 },
    { left: 20.25, top: 24.5, width: 900.5, height: 32 },
    { width: 1801, height: 1201 }, "cover",
  )
  expect(geometry["--wallpaper-background-size"]).toBe("900.5px 600.5px")
  expect(geometry["--wallpaper-background-position"]).toBe("0px 15.75px")
})

test("coalesces layout updates and restores only owned attributes and properties on cleanup", () => {
  const original = new Map<string, PropertyDescriptor | undefined>()
  const install = (name: string, value: unknown) => {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
  const callbacks = new Map<string, () => void>()
  const frames = new Map<number, () => void>()
  let nextFrame = 0
  const panel = { getBoundingClientRect: () => ({ left: 10, top: 10, width: 1000, height: 600 }) }
  const attributes = new Map<string, string>()
  const properties = new Map<string, { value: string; priority: string }>([
    ["--wallpaper-background-size", { value: "123px", priority: "important" }],
    ["color", { value: "red", priority: "" }],
  ])
  let top = 50
  let headers: unknown[] = []
  let discoveries = 0
  const header = {
    closest: () => panel,
    getBoundingClientRect: () => ({ left: 110, top, width: 744, height: 36 }),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => { attributes.set(name, value) },
    removeAttribute: (name: string) => { attributes.delete(name) },
    style: {
      getPropertyValue: (name: string) => properties.get(name)?.value ?? "",
      getPropertyPriority: (name: string) => properties.get(name)?.priority ?? "",
      setProperty: (name: string, value: string, priority = "") => { properties.set(name, { value, priority }) },
      removeProperty: (name: string) => { properties.delete(name) },
    },
  }
  const observed = new Set<unknown>()
  let mutation!: () => void
  let disconnected = 0
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback()
  }
  install("document", {
    body: {}, querySelectorAll: () => { discoveries++; return headers },
    addEventListener: (name: string, callback: () => void) => callbacks.set(`document.${name}`, callback),
    removeEventListener: (name: string) => callbacks.delete(`document.${name}`),
  })
  install("window", {
    addEventListener: (name: string, callback: () => void) => callbacks.set(`window.${name}`, callback),
    removeEventListener: (name: string) => callbacks.delete(`window.${name}`),
  })
  install("requestAnimationFrame", (callback: () => void) => { const id = ++nextFrame; frames.set(id, callback); return id })
  install("cancelAnimationFrame", (id: number) => frames.delete(id))
  install("ResizeObserver", class {
    observe = (element: unknown) => observed.add(element)
    unobserve = (element: unknown) => observed.delete(element)
    disconnect = () => { observed.clear(); disconnected++ }
  })
  install("MutationObserver", class {
    constructor(callback: () => void) { mutation = callback }
    observe() {}
    disconnect() { disconnected++ }
  })
  let stop: (() => void) | undefined
  try {
    headers = [header]
    stop = alignWallpaperHeaders({ image: { width: 2000, height: 1000 }, fit: "cover" })
    flush()
    expect(attributes.has("data-wallpaper-backed")).toBe(true)
    expect(properties.get("--wallpaper-background-size")?.value).toBe("1200px 600px")
    expect(observed.size).toBe(2)
    top = 80
    callbacks.get("document.scroll")!()
    callbacks.get("document.scroll")!()
    callbacks.get("window.resize")!()
    expect(frames.size).toBe(1)
    flush()
    expect(properties.get("--wallpaper-background-position")?.value).toBe("-200px -70px")
    expect(discoveries).toBe(1)
    headers = []
    mutation()
    flush()
    expect(attributes.has("data-wallpaper-backed")).toBe(false)
    expect(properties.get("--wallpaper-background-size")).toEqual({ value: "123px", priority: "important" })
    expect(properties.has("--wallpaper-background-position")).toBe(false)
    expect(discoveries).toBe(2)
    headers = [header]
    mutation()
    flush()
    callbacks.get("document.scroll")!()
    stop()
    expect(frames.size).toBe(0)
    expect(callbacks.size).toBe(0)
    expect(disconnected).toBe(2)
    expect(attributes.size).toBe(0)
    expect(properties.size).toBe(2)
    expect(properties.get("color")?.value).toBe("red")
  } finally {
    stop?.()
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
