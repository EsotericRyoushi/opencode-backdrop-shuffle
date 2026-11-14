import type { Toasts } from "@opencode/plugin/gui"

export function createWallpaperErrorReporter(toast: Pick<Toasts, "show">) {
  // Keep this reporter in the window setup, not Settings. Dismissing a toast or
  // reopening Settings must not replay errors from an unchanged background scan.
  const reported = new Map<string, Set<string>>()
  return (source: string, title: string, errors: readonly string[]) => {
    const seen = reported.get(source) ?? new Set<string>()
    const fresh = errors.filter((error) => {
      if (!error || seen.has(error)) return false
      seen.add(error)
      return true
    })
    reported.set(source, seen)
    if (!fresh.length) return
    toast.show({
      variant: "error",
      icon: "outline-photo",
      title,
      description: fresh.join("\n\n"),
    })
  }
}
