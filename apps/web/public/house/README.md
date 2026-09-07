# House imagery

Curated evergreen images for the NOW lead visual tile (rotating cover).

Drop exactly three files here:

- `01.webp` (or `.jpg` / `.png`)
- `02.webp`
- `03.webp`

Then list their public paths in `src/lib/brand.ts`:

```ts
export const HOUSE_IMAGE_SET: readonly string[] = [
  '/house/01.webp',
  '/house/02.webp',
  '/house/03.webp',
];
```

House images are independent of news article photography.
The lead headline overlays the image; rotation does not follow the story.
