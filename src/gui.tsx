import { Command, Plugin, SettingsPage, Store, Style } from "@opencode/plugin/gui"
import { createEffect, createMemo, onCleanup } from "solid-js"
import { Schema } from "effect"
import { wallpaperCommand } from "./command"
import { Catalog } from "./contract"
import { changeWallpaper, selectedWallpaper, wallpaperCatalog, wallpaperTitle, type WallpaperChoice } from "./model"
import { alignmentValues, appearanceKeys, Preferences, initial } from "./preferences"
import { createWallpaperImage, type WallpaperReader } from "./render"
import { imageError, thumbnailBlob } from "./image"
import { createWallpaperErrorReporter } from "./errors"
import { createThumbnailCache } from "./thumbnail-cache"
import { alignWallpaperHeaders } from "./backdrop"
import { wallpaperCanvasStyle, wallpaperLayers, wallpaperVariableStyle } from "./style"
import { WallpaperSettings } from "./settings"
import en from "./i18n/en"
import css from "./settings.css?inline"

export default Plugin.define({
  stores: { preferences: Store.global(Preferences, initial) },
  i18n: { en },
  async main(ctx) {
    const { createCatalog, wallpaperFolder, wallpaperFolderLabel } = await import("./catalog")
    let catalog: ReturnType<typeof createCatalog> | undefined
    let initializing: Promise<boolean> | undefined
    let fallback: typeof Catalog.spec.state.Type = { folder: "", ready: false, images: [], error: "" }
    const folder = () => ctx.storage.store("folder", { schema: Schema.String, initial: "" })
    ctx.onCleanup(() => catalog?.dispose())
    let lastError = ""
    const state = () => {
      const value = catalog?.state() ?? fallback
      return { ...value, folderLabel: wallpaperFolderLabel(value.folder) }
    }
    const changed = () => {
      const error = state().error
      if (error && error !== lastError) ctx.log.write("error", "wallpaper folder scan failed", { error })
      lastError = error
      provider.changed()
    }
    function refresh(): Promise<boolean> {
      if (ctx.signal.aborted) return Promise.resolve(false)
      if (catalog) return catalog.refresh()
      if (initializing) return initializing
      initializing = (async () => {
        try {
          const configured = ctx.options.folder ?? ctx.options.folders
          if (ctx.signal.aborted) return false
          // The config option wins so a moved folder only needs one edit here.
          catalog = createCatalog(wallpaperFolder(configured || folder().value), changed)
          changed()
          return await catalog.refresh()
        } catch (error) {
          if (!ctx.signal.aborted) {
            fallback = { ...fallback, ready: true, error: String(error) }
            changed()
          }
          return false
        }
      })().finally(() => { initializing = undefined })
      return initializing
    }
    const provider = ctx.provide(Catalog, {
      state,
      refresh,
      async setFolder(value, caller) {
        if (initializing) await initializing
        caller.signal.throwIfAborted()
        ctx.signal.throwIfAborted()
        const selected = wallpaperFolder(value)
        folder().set(selected)
        catalog?.dispose()
        catalog = createCatalog(selected, changed)
        changed()
        return catalog.refresh()
      },
      async read(request, caller) {
        if (!catalog) await refresh()
        if (!catalog) throw new Error(state().error || "Wallpaper folders are unavailable.")
        return catalog.read(request, caller.signal)
      },
    })
    await refresh()
  },
  setup(ctx) {
    const catalog = ctx.desktop ? ctx.main(Catalog) : undefined
    const report = createWallpaperErrorReporter(ctx.toast)
    const images = createMemo<WallpaperChoice[]>((previous) =>
      wallpaperCatalog(catalog?.state()?.images, ctx.stores.preferences.value, previous),
      [],
    )
    const selected = createMemo(() =>
      ctx.stores.preferences.value.enabled ? selectedWallpaper(ctx.stores.preferences.value, images()) : undefined,
    )
    const read: WallpaperReader = async (choice, signal) => {
      if (!catalog) throw new Error("image.readError")
      return catalog.read({ id: choice.id, version: choice.version }, { signal: AbortSignal.any([signal, ctx.signal]) })
    }
    const image = createWallpaperImage(selected, read)
    const reportImage = (choice: WallpaperChoice, error: string) => report(
      `image:${choice.id}:${choice.version}`, ctx.t("title"),
      [`${wallpaperTitle(choice, ctx.t)}: ${imageError(error, ctx.t)}`],
    )
    const thumbnails = createThumbnailCache(async (choice, signal) => {
      try {
        return await thumbnailBlob(choice.image ?? await read(choice, signal), signal)
      } catch (error) {
        if (!signal.aborted && !ctx.signal.aborted) reportImage(choice, error instanceof Error ? error.message : String(error))
        throw error
      }
    }, { signal: ctx.signal })
    onCleanup(thumbnails.dispose)
    createEffect(() => thumbnails.retain(images()))

    // The configured fit mode wins on load, including for saves made before the
    // option existed. "contain" shows the whole image at the largest scale that
    // fits the panel, without cropping, stretching, or mirroring it. CSS keeps
    // that scale in sync with the window; the header copies follow on resize.
    const configuredFit = ctx.options.fit
    if (
      (configuredFit === "cover" || configuredFit === "contain") &&
      ctx.stores.preferences.value.fit !== configuredFit
    ) {
      ctx.stores.preferences.update((draft) => { draft.fit = configuredFit })
    }

    // Optional alignment override for the whole image. The stored preference is
    // kept otherwise, so changing it in Settings survives a restart.
    const configuredAlign = alignmentValues.find((value) => value === ctx.options.align)
    if (configuredAlign && ctx.stores.preferences.value.align !== configuredAlign) {
      ctx.stores.preferences.update((draft) => { draft.align = configuredAlign })
    }

    // Shuffle the wallpapers in the configured folder every `options.shuffle`
    // seconds. Zero (or a missing option) keeps a single static wallpaper.
    const shuffleSeconds = Number(ctx.options.shuffle ?? 60)
    const shuffle = Number.isFinite(shuffleSeconds) && shuffleSeconds > 0
    if (shuffle) {
      // Pick the first wallpaper on first run, so the configured folder starts
      // showing without needing a manual selection in Settings.
      createEffect(() => {
        const list = images()
        const preset = ctx.stores.preferences.value.preset
        // Pick the first image when nothing is selected yet, or when the saved
        // selection points at a file that no longer exists (e.g. folder moved).
        if (!list.length || list.some((choice) => choice.id === preset)) return
        const first = list[0]
        if (first) ctx.stores.preferences.update((draft) => { changeWallpaper(draft, first.id) })
      })
      createEffect(() => {
        const timer = window.setInterval(() => {
          const preferences = ctx.stores.preferences.value
          if (!preferences.enabled) return
          const list = images()
          if (list.length < 2) return
          // Avoid showing the same image twice in a row.
          const choices = list.filter((choice) => choice.id !== preferences.preset)
          const next = choices[Math.floor(Math.random() * choices.length)]
          if (next) ctx.stores.preferences.update((draft) => { changeWallpaper(draft, next.id) })
        }, shuffleSeconds * 1000)
        onCleanup(() => window.clearInterval(timer))
      })
    }

    createEffect(() => {
      if (ctx.signal.aborted) return
      const state = catalog?.state()
      if (state?.error) report(`folder:${state.folder}`, ctx.t("folders.title"),
        state.error.split("\n").map((error) => error.replace(/image\.[A-Za-z]+$/, (key) => ctx.t(key))))
      const choice = selected()
      if (choice && image.error) reportImage(choice, image.error)
      const preferences = ctx.stores.preferences.value
      if (preferences.enabled && preferences.preset.startsWith("file:") && state?.ready && !state.error && !choice) {
        report(`missing:${preferences.preset}`, ctx.t("title"), [ctx.t("folders.missing")])
      }
    })
    ctx.add(Style, css + wallpaperLayers(".opencode-wallpaper-preview"))
    ctx.add(Style, () => ctx.stores.preferences.value.enabled && image.url ? wallpaperCanvasStyle : "")
    ctx.add(Style, () => wallpaperVariableStyle(ctx.stores.preferences.value, image.url))
    createEffect(() => {
      if (!image.url || !image.width || !image.height) return
      onCleanup(alignWallpaperHeaders({
        image: { width: image.width, height: image.height },
        fit: ctx.stores.preferences.value.fit,
        align: ctx.stores.preferences.value.align,
      }))
    })
    ctx.add(SettingsPage, {
      id: "wallpaper",
      icon: "outline-photo",
      get title() {
        return ctx.t("title")
      },
      get entries() {
        return ["enabled", ...(ctx.desktop ? ["folders"] : []), "preset", "align", ...appearanceKeys].map((id) => ({
          id: `wallpaper-${id}`,
          title: ctx.t(`${id}.title`),
          keywords: "wallpaper background image upload fit align alignment corner edge position folder tint brightness contrast",
        }))
      },
      render: () => (
        <WallpaperSettings
          images={images}
          image={image}
          thumbnails={thumbnails}
          folder={() => catalog?.state()?.folderLabel ?? catalog?.state()?.folder ?? ""}
          changeFolder={async (folder, signal) => {
            if (!catalog) throw new Error("Wallpaper folders are unavailable.")
            return catalog.setFolder(folder, { signal: AbortSignal.any([signal, ctx.signal]) })
          }}
        />
      ),
    })
    ctx.add(Command, () => ({
      id: "settings",
      title: ctx.t("title"),
      description: ctx.t("description"),
      keywords: "wallpaper background image",
      run: () => ctx.layout.settings("wallpaper"),
    }))
    ctx.add(Command, () =>
      wallpaperCommand(ctx, images, async () => {
        if (!catalog) return true
        try {
          return await catalog.refresh({ signal: ctx.signal })
        } catch (error) {
          if (!ctx.signal.aborted) report("refresh", ctx.t("folders.title"), [String(error)])
          return false
        }
      }),
    )
  },
})
