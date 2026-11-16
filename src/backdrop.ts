import { wallpaperHeaders, wallpaperPanels } from "./style"
import type { WallpaperAlignment } from "./preferences"

type Rectangle = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">

const alignmentFactors: Record<WallpaperAlignment, { x: number; y: number }> = {
  "top-left": { x: 0, y: 0 },
  "top": { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  "left": { x: 0, y: 0.5 },
  "center": { x: 0.5, y: 0.5 },
  "right": { x: 1, y: 0.5 },
  "bottom-left": { x: 0, y: 1 },
  "bottom": { x: 0.5, y: 1 },
  "bottom-right": { x: 1, y: 1 },
}

// Paint only a header-sized background, using the panel's image scale and origin.
// Oversized positioned layers would enlarge scroll overflow or clip header actions.
export function wallpaperHeaderGeometry(
  panel: Rectangle,
  header: Rectangle,
  image: { width: number; height: number },
  fit: "cover" | "contain",
  align: WallpaperAlignment = "center",
) {
  const scale = Math[fit === "cover" ? "max" : "min"](panel.width / image.width, panel.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const factor = alignmentFactors[align] ?? alignmentFactors.center
  const x = (panel.width - width) * factor.x - (header.left - panel.left)
  const y = (panel.height - height) * factor.y - (header.top - panel.top)
  const px = (value: number) => `${Math.round(value * 1000) / 1000}px`
  return {
    "--wallpaper-background-size": `${px(width)} ${px(height)}`,
    "--wallpaper-background-position": `${px(x)} ${px(y)}`,
  }
}

export function alignWallpaperHeaders(options: { image: { width: number; height: number }; fit: "cover" | "contain"; align?: WallpaperAlignment }) {
  if (!(options.image.width > 0 && options.image.height > 0)) return () => {}
  const alignment = options.align ?? "center"
  type Saved = { attribute: string | null; properties: Map<string, { value: string; priority: string }> }
  const saved = new Map<HTMLElement, Saved>()
  const observed = new Set<Element>()
  let frame = 0
  let disposed = false
  let discover = true
  let headers: HTMLElement[] = []
  const restore = (element: HTMLElement, state: Saved) => {
    if (state.attribute === null) element.removeAttribute("data-wallpaper-backed")
    else element.setAttribute("data-wallpaper-backed", state.attribute)
    for (const [name, property] of state.properties) {
      if (property.value) element.style.setProperty(name, property.value, property.priority)
      else element.style.removeProperty(name)
    }
  }
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(update)
  }
  const resize = new ResizeObserver(schedule)
  function update() {
    frame = 0
    if (disposed) return
    if (discover) {
      headers = [...document.querySelectorAll<HTMLElement>(wallpaperHeaders)]
      discover = false
    }
    const live = new Set<HTMLElement>()
    const elements = new Set<Element>()
    const bounds = new Map<Element, DOMRect>()
    const measurements: { element: HTMLElement; geometry: ReturnType<typeof wallpaperHeaderGeometry> }[] = []
    // Batch all measurements before writes so scrolling does not force a layout
    // separately for every expanded tool header.
    for (const element of headers) {
      const panel = element.closest<HTMLElement>(wallpaperPanels)
      if (!panel) continue
      const header = element.getBoundingClientRect()
      const parent = bounds.get(panel) ?? panel.getBoundingClientRect()
      bounds.set(panel, parent)
      if (!header.width || !header.height || !parent.width || !parent.height) continue
      live.add(element)
      elements.add(panel)
      elements.add(element)
      measurements.push({ element, geometry: wallpaperHeaderGeometry(parent, header, options.image, options.fit, alignment) })
    }
    for (const [element, state] of saved) {
      if (live.has(element)) continue
      restore(element, state)
      saved.delete(element)
    }
    for (const { element, geometry } of measurements) {
      if (!saved.has(element)) {
        saved.set(element, {
          attribute: element.getAttribute("data-wallpaper-backed"),
          properties: new Map(Object.keys(geometry).map((name) => [name, {
            value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name),
          }])),
        })
      }
      for (const [name, value] of Object.entries(geometry)) {
        if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value)
      }
      if (!element.hasAttribute("data-wallpaper-backed")) element.setAttribute("data-wallpaper-backed", "")
    }
    for (const element of observed) {
      if (elements.has(element)) continue
      resize.unobserve(element)
      observed.delete(element)
    }
    for (const element of elements) {
      if (observed.has(element)) continue
      resize.observe(element)
      observed.add(element)
    }
  }
  const mutation = new MutationObserver(() => {
    discover = true
    schedule()
  })
  mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "data-locked", "class"] })
  document.addEventListener("scroll", schedule, { capture: true, passive: true })
  window.addEventListener("resize", schedule, { passive: true })
  schedule()
  return () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    mutation.disconnect()
    resize.disconnect()
    document.removeEventListener("scroll", schedule, true)
    window.removeEventListener("resize", schedule)
    for (const [element, state] of saved) restore(element, state)
    saved.clear()
    observed.clear()
    headers = []
  }
}
