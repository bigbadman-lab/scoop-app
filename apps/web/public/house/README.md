# House imagery

Curated evergreen images for the NOW lead visual slot.

Drop files here, e.g.:

- `01.jpg`
- `02.jpg`
- `03.webp`

Then add their public paths to `src/lib/brand.ts`:

```ts
export const HOUSE_IMAGE_SET: readonly string[] = [
  '/house/01.jpg',
  '/house/02.jpg',
];
```

House images are independent of news article photography.
