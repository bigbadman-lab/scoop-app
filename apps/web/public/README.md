# Public assets

Static files for the Next.js web app (`apps/web`). Files here are served from the site root.

## Drop assets here

```
public/
  brand/          ← logos, mark, favicons
  house/          ← NOW lead evergreen images
  README.md
```

| Folder | Purpose | Example URL |
| --- | --- | --- |
| `brand/` | Logo / mark | `/brand/MARK.png` |
| `house/` | Editorial house images | `/house/01.jpg` |

## Notes

- Prefer optimized PNG / JPEG / WebP.
- After adding house images, register paths in `src/lib/brand.ts` → `HOUSE_IMAGE_SET`.
- Canonical mark: `brand/MARK.png` (SCOOP orange `#FC4C00`).
