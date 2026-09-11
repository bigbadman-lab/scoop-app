# House imagery

Curated evergreen cover for the NOW lead visual tile.

Production uses a **single** image registered in `src/lib/brand.ts`:

```ts
export const HOUSE_IMAGE_SET: readonly string[] = ['/house/place4.webp'];
```

Current production asset:

- `place4.webp` (2400 × 1600, 3:2) — and optional source `place4.jpg`

Listing more than one path in `HOUSE_IMAGE_SET` re-enables optional crossfade rotation in `HouseLeadHero`. A single path disables auto- and manual rotation naturally.

House images are independent of news article photography.
The lead headline overlays the image.
