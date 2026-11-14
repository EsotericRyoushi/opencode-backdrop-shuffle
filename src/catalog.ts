import { readdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { homedir } from "node:os"
import { Effect, Schema, Semaphore } from "effect"
import { Catalog, ImageRequest, maxImageBytes } from "./contract"

const formats: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
}

export function wallpaperFolder(options: unknown) {
  const configured = Schema.decodeUnknownSync(Schema.optional(Schema.Union([
    Schema.NonEmptyString,
    Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  ])))(options)
  const folder = (Array.isArray(configured) ? configured[0] : configured) ?? ""
  if (!folder) return ""
  if (!path.isAbsolute(folder)) throw new Error("The wallpaper folder must use an absolute path.")
  return path.resolve(folder)
}

export function wallpaperFolderLabel(folder: string, home = homedir()) {
  if (!folder) return ""
  const relative = path.relative(home, folder)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return folder
  return relative ? `~${path.sep}${relative}` : "~"
}

type Cached = { file: string; image: (typeof Catalog.spec.state.Type.images)[number] }

export function createCatalog(folder: string, changed: () => void) {
  const lifetime = new AbortController()
  const reads = Semaphore.makeUnsafe(2)
  let value: typeof Catalog.spec.state.Type = { folder, ready: !folder, images: [], error: "" }
  let cache = new Map<string, Cached>()
  let pending: Promise<boolean> | undefined

  function refresh() {
    if (lifetime.signal.aborted) return Promise.resolve(false)
    if (pending) return pending
    pending = scan().then(
      () => !lifetime.signal.aborted,
      (error) => {
        if (!lifetime.signal.aborted) {
          value = { ...value, ready: true, error: String(error) }
          changed()
        }
        return false
      },
    ).finally(() => { pending = undefined })
    return pending
  }

  async function scan() {
    if (!folder) return
    const errors: string[] = []
    let root = folder
    const files = new Set<string>()
    try {
      root = await realpath(folder)
      for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !formats[path.extname(entry.name).toLowerCase()]) continue
        const file = await realpath(path.join(entry.parentPath, entry.name))
        files.add(file)
      }
    } catch (error) {
      if (!missing(error)) errors.push(`${folder}: ${String(error)}`)
    }
    const next = new Map<string, Cached>()
    for (const file of files) {
      if (lifetime.signal.aborted) return
      try {
        const info = await stat(file)
        requireSize(info.size)
        const version = stamp(info)
        const id = `file:${encodeURIComponent(file)}`
        const title = path.relative(root, file).slice(0, -path.extname(file).length)
        const previous = cache.get(id)
        const image = previous?.image.version === version && previous.image.title === title
          ? previous.image : { id, title, version }
        next.set(id, { file, image })
      } catch (error) {
        errors.push(`${path.relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (lifetime.signal.aborted) return
    cache = next
    const images = [...cache.values()].map((entry) => entry.image).sort((a, b) => a.id.localeCompare(b.id))
    const error = errors.sort().join("\n")
    if (value.ready && error === value.error && images.length === value.images.length && images.every((image, i) => image === value.images[i])) return
    value = { folder, ready: true, images, error }
    changed()
  }

  function read(request: typeof ImageRequest.Type, signal = lifetime.signal) {
    return Effect.runPromise(reads.withPermit(Effect.tryPromise({
      async try(signal) {
        const entry = cache.get(request.id)
        if (!entry || entry.image.version !== request.version) throw new Error("The selected wallpaper is missing or has changed.")
        const info = await stat(entry.file)
        requireSize(info.size)
        if (stamp(info) !== request.version) throw new Error("The selected wallpaper has changed. Refresh the gallery.")
        const data = await readFile(entry.file, { signal })
        requireSize(data.length)
        if (stamp(await stat(entry.file)) !== request.version) throw new Error("The selected wallpaper changed while being read.")
        return `data:${formats[path.extname(entry.file).toLowerCase()]};base64,${data.toString("base64")}`
      },
      catch: (error) => error,
    })), { signal: AbortSignal.any([signal, lifetime.signal]) })
  }

  const timer = folder ? setInterval(() => void refresh(), 2000) : undefined
  return {
    state: () => value,
    refresh,
    read,
    dispose() {
      lifetime.abort()
      clearInterval(timer)
      cache.clear()
    },
  }
}

function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function requireSize(size: number) {
  if (size === 0 || size > maxImageBytes) throw new Error("image.sizeError")
}

function stamp(info: { size: number; mtimeMs: number; ctimeMs: number }) {
  return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`
}
