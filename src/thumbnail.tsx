import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { imageError } from "./image"
import type { WallpaperChoice } from "./model"
import { createWallpaperThumbnail } from "./render"
import type { ThumbnailCache } from "./thumbnail-cache"

export function WallpaperThumbnail(props: { choice: WallpaperChoice; cache: ThumbnailCache; t: (key: string) => string }) {
  const [visible, setVisible] = createSignal(!!props.cache.peek(props.choice))
  let element!: HTMLSpanElement
  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting))
    }, { rootMargin: "200px" })
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  })
  const image = createWallpaperThumbnail(() => visible() ? props.choice : undefined, props.cache)
  return <span ref={element} class="opencode-wallpaper-thumbnail" aria-busy={image.loading}>
    <Show when={image.url} fallback={
      <Show when={image.error}>
        <span title={imageError(image.error, props.t)} aria-label={imageError(image.error, props.t)}>
          {props.t("image.unavailable")}
        </span>
      </Show>
    }>
      {(url) => <img src={url()} alt="" />}
    </Show>
  </span>
}
