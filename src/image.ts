import { Schema } from "effect"
import { maxImageBytes } from "./contract"

const base64 = /^[A-Za-z0-9+/]+={0,2}$/
const rasterTypes = new Set(["image/png", "image/jpeg", "image/webp"])

export const StoredImage = Schema.String.check(
  Schema.isPattern(/^(?:data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})?$/),
  Schema.isMaxLength("data:image/jpeg;base64,".length + 4 * Math.ceil(maxImageBytes / 3)),
  Schema.makeFilter((image: string) => {
    const data = imageBytes(image)
    return !image || (data.length % 4 === 0 && base64Size(data) <= maxImageBytes)
  }),
)

export function checkImage(file: Pick<File, "type" | "size">) {
  if (!rasterTypes.has(file.type)) throw new Error("image.typeError")
  if (file.size === 0 || file.size > maxImageBytes) throw new Error("image.sizeError")
}

export function wallpaperBlob(image: string) {
  const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml))(;base64)?,([\s\S]+)$/.exec(image)
  if (!match) throw new Error("image.decodeError")
  const [, type, encoded, data] = match
  if (encoded && (data.length % 4 !== 0 || base64Size(data) > maxImageBytes || !base64.test(data))) throw new Error("image.decodeError")
  if (!encoded && type !== "image/svg+xml") throw new Error("image.decodeError")
  try {
    const blob = new Blob([encoded ? Uint8Array.from(atob(data), (character) => character.charCodeAt(0)) : decodeURIComponent(data)], { type })
    if (blob.size === 0 || blob.size > maxImageBytes) throw new Error("image.decodeError")
    return blob
  } catch (cause) {
    throw new Error("image.decodeError", { cause })
  }
}

export async function decodeWallpaper(url: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const image = new Image()
  const cancel = () => { image.src = "" }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    image.src = url
    await image.decode()
    signal.throwIfAborted()
    return image
  } catch (cause) {
    signal.throwIfAborted()
    throw new Error("image.decodeError", { cause })
  } finally {
    signal.removeEventListener("abort", cancel)
  }
}

export type ThumbnailBlob = { blob: Blob; width: number; height: number }

export async function thumbnailBlob(data: string, signal: AbortSignal): Promise<ThumbnailBlob> {
  signal.throwIfAborted()
  const url = URL.createObjectURL(wallpaperBlob(data))
  try {
    const image = await decodeWallpaper(url, signal)
    const canvas = document.createElement("canvas")
    const scale = Math.min(1, 320 / image.naturalWidth, 200 / image.naturalHeight)
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("image.decodeError")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image.decodeError")), "image/png")
    })
    signal.throwIfAborted()
    return { blob, width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function uploadImage(file: File, signal: AbortSignal) {
  signal.throwIfAborted()
  checkImage(file)
  const url = URL.createObjectURL(file)
  try {
    await decodeWallpaper(url, signal)
  } finally {
    URL.revokeObjectURL(url)
  }
  signal.throwIfAborted()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const cancel = () => reader.abort()
    const finish = () => signal.removeEventListener("abort", cancel)
    reader.onload = () => {
      finish()
      if (typeof reader.result !== "string") reject(new Error("image.readError"))
      else resolve(reader.result)
    }
    reader.onerror = () => { finish(); reject(new Error("image.readError")) }
    reader.onabort = () => { finish(); reject(signal.reason) }
    signal.addEventListener("abort", cancel, { once: true })
    try {
      reader.readAsDataURL(file)
    } catch (cause) {
      finish()
      reject(new Error("image.readError", { cause }))
    }
  })
}

export function imageError(error: string, t: (key: string) => string) {
  return error.startsWith("image.") ? t(error) : `${t("image.readError")} ${error}`
}

export function imageBytes(image: string) {
  return image.slice(image.indexOf(",") + 1)
}

function base64Size(data: string) {
  return data.length / 4 * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0)
}
