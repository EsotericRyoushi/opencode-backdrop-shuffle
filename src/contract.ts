import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

export const maxImageBytes = 8 * 1024 * 1024

export const Wallpaper = Schema.Struct({ id: Schema.String, title: Schema.String, version: Schema.String })

export const ImageRequest = Schema.Struct({ id: Schema.String, version: Schema.String })

export const Catalog = Ipc.define({
  // Desktop caches clients by ID across reloads. A changed protocol needs a new ID.
  id: "wallpaper.catalog.v5",
  state: Schema.Struct({
    folder: Schema.String,
    folderLabel: Schema.optional(Schema.String),
    ready: Schema.Boolean,
    images: Schema.Array(Wallpaper),
    error: Schema.String,
  }),
  methods: {
    refresh: { output: Schema.Boolean },
    setFolder: { input: Schema.NonEmptyString, output: Schema.Boolean },
    read: { input: ImageRequest, output: Schema.String },
  },
})
