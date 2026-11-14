# OpenCode Backdrop

Use your own wallpapers in OpenCode Desktop. Supports OpenCode 2.2.6 and later 2.2.x versions through the GUI plugin API.

## Install

```sh
opencode plugin add opencode-backdrop
```

This installs the plugin globally. Alternatively, add it to your global `opencode.json` or `opencode.jsonc`, keeping any existing plugins. Do not add it to `cli.json`.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-backdrop"],
}
```

## Use

1. Open **Settings > Wallpapers**.
2. Choose **Change folder** to use a local folder, or **+** to upload an image.
3. Select an image and adjust tint, brightness and fit.

Wallpaper starts off with an empty gallery. Images and preferences stay local, and images are not sent to models. Files must be non-empty and no larger than 8 MiB.

- Folder images support PNG, JPEG, WebP and SVG, including subfolders. Changes appear automatically.
- Uploads support PNG, JPEG and WebP.
- More tint improves text contrast. **Fill background** crops the image; **Show whole image** keeps it fully visible.
- Use `/wallpaper` in chat to switch images or turn wallpaper off. Escape cancels the picker.
- Turn **Show wallpaper** off to restore the app's backgrounds without losing your choices.

To remove an upload, hover or focus its tile and click **X**. Remove folder images by moving or deleting their source files.

## Optional folder configuration

You can set an initial folder with an absolute path instead of choosing one in Settings:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-backdrop",
      "options": { "folder": "/absolute/path/to/wallpapers" },
    },
  ],
}
```

The folder chosen in Settings takes precedence over this option.
