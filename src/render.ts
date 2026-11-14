import { createEffect, createMemo, createRenderEffect, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { decodeWallpaper, wallpaperBlob } from "./image"
import { sameWallpaper, type WallpaperChoice } from "./model"
import type { ThumbnailCache, ThumbnailLease } from "./thumbnail-cache"

export type WallpaperReader = (image: WallpaperChoice, signal: AbortSignal) => Promise<string>
export type WallpaperImage = ReturnType<typeof createWallpaperImage>

function imageSource(selected: Accessor<WallpaperChoice | undefined>) {
  return createMemo(() => {
    const choice = selected()
    return choice ? { ...choice } : undefined
  }, undefined, { equals: sameWallpaper })
}

export function createWallpaperImage(selected: Accessor<WallpaperChoice | undefined>, read: WallpaperReader) {
  const [state, setState] = createStore({ url: "", width: 0, height: 0, loading: false, error: "" })
  const source = imageSource(selected)
  createEffect(() => {
    const choice = source()
    const controller = new AbortController()
    let url = ""
    onCleanup(() => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    })
    setState({ url: "", width: 0, height: 0, loading: !!choice, error: "" })
    if (!choice) return
    void (async () => {
      try {
        const data = choice.image ?? await read(choice, controller.signal)
        controller.signal.throwIfAborted()
        url = URL.createObjectURL(wallpaperBlob(data))
        const image = await decodeWallpaper(url, controller.signal)
        setState({ url, width: image.naturalWidth, height: image.naturalHeight, loading: false, error: "" })
      } catch (error) {
        if (url) URL.revokeObjectURL(url)
        url = ""
        if (!controller.signal.aborted) setState({ url: "", loading: false, error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })
  return state
}

export function createWallpaperThumbnail(selected: Accessor<WallpaperChoice | undefined>, cache: ThumbnailCache) {
  const [state, setState] = createStore({ url: "", width: 0, height: 0, loading: false, error: "" })
  const source = imageSource(selected)
  createRenderEffect(() => {
    const choice = source()
    const controller = new AbortController()
    let lease: ThumbnailLease | undefined
    onCleanup(() => { controller.abort(); lease?.release() })
    setState({ url: "", width: 0, height: 0, loading: !!choice, error: "" })
    if (!choice) return
    try {
      lease = cache.acquire(choice)
      if (lease.value) {
        setState({ ...lease.value, loading: false })
        return
      }
      void lease.ready.then((thumbnail) => {
        if (!controller.signal.aborted) setState({ ...thumbnail, loading: false })
      }, (error: unknown) => {
        if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Error ? error.message : String(error) })
      })
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  })
  return state
}
