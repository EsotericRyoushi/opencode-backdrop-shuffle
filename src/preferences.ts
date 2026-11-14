import { Schema } from "effect"
import { StoredImage } from "./image"

export const appearanceControls = {
  tint: { min: 0, max: 100, initial: 80 },
  brightness: { min: 25, max: 150, initial: 100 },
} as const

export const appearanceKeys = ["tint", "brightness"] as const

const UploadedImage = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^upload:.+$/)),
  name: Schema.String.check(Schema.isMinLength(1)),
  image: StoredImage.check(Schema.isMinLength(1)),
})

export type UploadedWallpaper = typeof UploadedImage.Type

export const Preferences = Schema.Struct({
  enabled: Schema.Boolean,
  // Keep selections from old saves readable, even when no matching image exists.
  preset: Schema.String,
  image: StoredImage,
  imageName: Schema.optional(Schema.String),
  images: Schema.optional(Schema.Array(UploadedImage)),
  tint: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: appearanceControls.tint.min, maximum: appearanceControls.tint.max }))),
  brightness: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: appearanceControls.brightness.min, maximum: appearanceControls.brightness.max }))),
  fit: Schema.Literals(["cover", "contain"]),
  // Keep old saves readable. Strength supplies the tint only until the user sets
  // it explicitly; hidden no longer controls which wallpapers are available.
  strength: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 45 })),
  hidden: Schema.optional(Schema.Array(Schema.String)),
})

export type WallpaperPreferences = typeof Preferences.Type

export const initial: WallpaperPreferences = {
  enabled: false,
  preset: "",
  image: "",
  strength: 100 - appearanceControls.tint.initial,
  fit: "cover",
}

export function wallpaperAppearance(settings: Pick<WallpaperPreferences, "tint" | "brightness" | "strength">) {
  return {
    tint: settings.tint ?? 100 - settings.strength,
    brightness: settings.brightness ?? appearanceControls.brightness.initial,
  }
}
