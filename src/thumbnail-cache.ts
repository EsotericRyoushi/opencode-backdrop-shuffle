import type { ThumbnailBlob } from "./image"
import { sameWallpaper, type WallpaperChoice } from "./model"

type Thumbnail = { url: string; width: number; height: number }
export type ThumbnailLease = { value?: Thumbnail; ready: Promise<Thumbnail>; release: () => void }
export type ThumbnailCache = ReturnType<typeof createThumbnailCache>

type Entry = {
  choice: WallpaperChoice
  controller: AbortController
  ready: Promise<Thumbnail>
  resolve: (thumbnail: Thumbnail) => void
  reject: (error: unknown) => void
  value?: Thumbnail
  bytes: number
  users: number
  retired: boolean
}

export function createThumbnailCache(
  load: (choice: WallpaperChoice, signal: AbortSignal) => Promise<ThumbnailBlob>,
  { maxEntries = 48, maxBytes = 8 * 1024 * 1024, concurrency = 2, signal }: {
    maxEntries?: number; maxBytes?: number; concurrency?: number; signal?: AbortSignal
  } = {},
) {
  const entries = new Map<string, Entry>()
  const retired = new Set<Entry>()
  const idle = new Map<Entry, number>()
  const queue = new Set<Entry>()
  let idleBytes = 0
  let running = 0
  let disposed = false

  function activate(entry: Entry) {
    const bytes = idle.get(entry)
    if (bytes === undefined) return
    idle.delete(entry)
    idleBytes -= bytes
  }

  function revoke(entry: Entry) {
    activate(entry)
    if (entry.value) URL.revokeObjectURL(entry.value.url)
    entry.value = undefined
    retired.delete(entry)
  }

  function discard(entry: Entry) {
    if (entry.retired) return
    activate(entry)
    queue.delete(entry)
    if (entries.get(entry.choice.id) === entry) entries.delete(entry.choice.id)
    entry.retired = true
    entry.controller.abort()
    entry.reject(entry.controller.signal.reason)
    if (entry.users) retired.add(entry)
    else revoke(entry)
  }

  // Track idle entries directly instead of scanning and allocating arrays on each
  // tile release. Active tiles are pinned; only unused thumbnails can be evicted.
  function park(entry: Entry) {
    if (entry.users || entry.retired) return
    activate(entry)
    idle.set(entry, entry.bytes)
    idleBytes += entry.bytes
    while (idle.size > maxEntries || idleBytes > maxBytes) {
      const oldest = idle.keys().next().value
      if (!oldest) break
      discard(oldest)
    }
  }

  function drain() {
    while (!disposed && running < concurrency && queue.size) {
      const entry = queue.values().next().value!
      queue.delete(entry)
      running++
      void Promise.resolve().then(() => {
        entry.controller.signal.throwIfAborted()
        return load(entry.choice, entry.controller.signal)
      }).then((thumbnail) => {
        entry.controller.signal.throwIfAborted()
        entry.value = { url: URL.createObjectURL(thumbnail.blob), width: thumbnail.width, height: thumbnail.height }
        entry.bytes = thumbnail.blob.size
        entry.resolve(entry.value)
        park(entry)
      }).catch((error: unknown) => {
        entry.reject(error)
        discard(entry)
      }).finally(() => {
        running--
        drain()
      })
    }
  }

  function acquire(choice: WallpaperChoice): ThumbnailLease {
    if (disposed) throw new DOMException("Thumbnail cache is disposed.", "AbortError")
    let entry = entries.get(choice.id)
    if (entry && !sameWallpaper(entry.choice, choice)) {
      discard(entry)
      entry = undefined
    }
    if (!entry) {
      let resolve!: Entry["resolve"]
      let reject!: Entry["reject"]
      const ready = new Promise<Thumbnail>((accept, fail) => { resolve = accept; reject = fail })
      entry = { choice: { ...choice }, controller: new AbortController(), ready, resolve, reject, users: 0, bytes: 0, retired: false }
      queue.add(entry)
    }
    const current = entry
    activate(current)
    current.users++
    entries.set(choice.id, current)
    drain()
    let released = false
    return {
      value: current.value,
      ready: current.ready,
      release() {
        if (released) return
        released = true
        current.users--
        if (current.retired && !current.users) revoke(current)
        else park(current)
      },
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    signal?.removeEventListener("abort", dispose)
    for (const entry of new Set([...entries.values(), ...retired])) {
      discard(entry)
      revoke(entry)
    }
    entries.clear()
    retired.clear()
    idle.clear()
    idleBytes = 0
    queue.clear()
  }
  signal?.addEventListener("abort", dispose, { once: true })
  if (signal?.aborted) dispose()

  return {
    acquire,
    peek(choice: WallpaperChoice) {
      const entry = entries.get(choice.id)
      return entry && sameWallpaper(entry.choice, choice) ? entry.value : undefined
    },
    retain(choices: readonly WallpaperChoice[]) {
      const available = new Map(choices.map((choice) => [choice.id, choice]))
      for (const entry of entries.values()) {
        if (!sameWallpaper(entry.choice, available.get(entry.choice.id))) discard(entry)
      }
    },
    dispose,
  }
}
