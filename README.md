# OpenCode Backdrop Shuffle

Local wallpaper support for OpenCode Desktop, with automatic shuffling, whole-image fit, and corner alignment.

This is a fork of [viralcodex/opencode-backdrop](https://github.com/viralcodex/opencode-backdrop) that adds:

- Automatic wallpaper shuffle from a folder, with no immediate repeats.
- Whole-image fit by default: the largest possible scale without cropping, stretching, or mirroring.
- Nine-way image alignment: corners, edges, and center, including bottom-right.
- Config folder precedence, so moving a wallpaper folder only needs one config edit.

Built and tested with **OpenCode Desktop 2.3.0**.

## Install

Remove any existing `opencode-backdrop` or other wallpaper plugin entry first. Backdrop plugins share the plugin id `wallpaper`, so only one can be active.

### With the CLI

```sh
opencode plugin add 'github:EsotericRyoushi/opencode-backdrop-shuffle#v0.2.0'
```

Restart OpenCode after installing.

### With the config file

Add the repository to your global `opencode.json` or `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:EsotericRyoushi/opencode-backdrop-shuffle#v0.2.0"]
}
```

### Point it at a wallpaper folder

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:EsotericRyoushi/opencode-backdrop-shuffle#v0.2.0",
      "options": {
        "folder": "C:/Users/you/Pictures/Wallpapers",
        "shuffle": 60,
        "fit": "contain",
        "align": "bottom-right"
      }
    }
  ]
}
```

The folder must be an absolute path. On Windows, forward slashes work best. PNG, JPEG, WebP, and SVG files up to 8 MiB are supported, including subfolders.

## Use

1. Open **Settings > Wallpapers**.
2. Choose **Change folder** to use a local folder, or **+** to upload an image.
3. Select an image and adjust tint, brightness, fit, and alignment.

Wallpaper preferences and images stay local. Images are never sent to models.

- **Shuffle** picks a random folder image every 60 seconds by default. It never shows the same image twice in a row and recovers automatically if the saved image no longer exists.
- **Fill background** (`cover`) fills the panel but crops the image.
- **Show whole image** (`contain`) is the default. It shows the entire image at the largest scale that fits, keeping the aspect ratio and original orientation.
- **Image alignment** places the whole image against an edge or corner. It only moves the image; it never crops, stretches, or mirrors it.
- **Wallpaper tint** controls the theme-colored shade over the image. Lower it to show more artwork; raise it for easier reading.
- **Wallpaper brightness** adjusts the image only, without changing text or controls.
- Use `/wallpaper` in chat to switch images or turn wallpaper off. Escape cancels the picker.
- Turn **Show wallpaper** off to restore the app's backgrounds without losing your choices.

### Fit and alignment notes

For portrait artwork on a wide window, whole-image fit is limited by the panel height. The empty space beside the image is unavoidable unless you crop the image or use a taller panel. Alignment moves the artwork within that space; for a height-limited portrait image, bottom-right mainly moves it to the right edge.

Alignment values are:

`top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`.

## Configuration options

All options are optional. Set them in the plugin entry under `options`.

| Option | Description |
| --- | --- |
| `folder` | Absolute path to a wallpaper folder. This fork gives it precedence over the folder saved in Settings. |
| `shuffle` | Seconds between random wallpapers. Omit or use `0` to keep one image. Default: `60`. |
| `fit` | `contain` (default) shows the whole image without cropping. `cover` fills the panel and crops. |
| `align` | `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, or `bottom-right`. Default: `bottom-right`. |

`fit` and `align` from config are applied when the plugin loads. If you want changes made in **Settings** to persist across restarts, leave `align` out of the config. The `fit` example above uses `contain` deliberately so the no-crop behavior stays pinned.

The folder chosen in Settings is used only when no `folder` option is configured.

## Development

```sh
git clone https://github.com/EsotericRyoushi/opencode-backdrop-shuffle.git
cd opencode-backdrop-shuffle
npm install
npm run build:gui
npx tsc --noEmit
```

OpenCode loads the committed `dist/gui-experimental.cjs`, so rebuild it after changing the GUI source. The test suite uses Bun:

```sh
bun test src
```

## Credits

Forked from [viralcodex/opencode-backdrop](https://github.com/viralcodex/opencode-backdrop). The original project and this fork are MIT licensed; see [LICENSE](LICENSE).
