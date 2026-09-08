# House imagery

Curated evergreen images for the NOW lead visual tile (rotating cover).

Drop exactly three files here:

- `place1.webp` (or `.jpg` / `.png`)
- `place2.webp`
- `place3.webp`

Then list their public paths in `src/lib/brand.ts`:

```ts
export const HOUSE_IMAGE_SET: readonly string[] = [
  '/house/place1.webp',
  '/house/place2.webp',
  '/house/place3.webp',
];
```

House images are independent of news article photography.
The lead headline overlays the image; rotation does not follow the story.
