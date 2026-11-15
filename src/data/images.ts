// Unsplash photos (hotlinked; the build container cannot reach images.unsplash.com).
// All six are free Unsplash photos uploaded within ~6.5 days of each other (Mar 30 – Apr 5, 2021),
// so their numeric photo IDs (upload timestamps in ms) sit right next to each other:
//
//   1617067128946  meadow   (Daniel Pintilei)
//   1617111975233  daisies  (Georgian Constantin)
//   1617150119111  heroSky  (Sonny Mauricio)
//   1617265178133  tulips   (Aleksandra Sapozhnikova)
//   1617374128851  dune     (Emma Van Sant)
//   1617634667039  hills    (Daniel Angele)
//
// Spread: 1617634667039 - 1617067128946 = 567,538,118 (all share the prefix 16170–16176).
// Every src/srcSmall URL was verified to load in Chrome on 2026-11-16.
// `avg` = 1x1 canvas average of the w=900 rendition — use it as the container background-color placeholder.
// Native orientations: heroSky, tulips, hills are portrait (2:3, 2:3, ~0.63); meadow, dune 3:2; daisies 16:9.
// fit=crop with only w keeps the native aspect ratio, so always render with object-fit: cover.

const u = (id: string, w: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const photo = (
  id: string,
  avg: string,
  alt: string,
  name: string,
  handle: string,
) => ({
  id,
  src: u(id, 2000),
  srcSmall: u(id, 900),
  avg,
  alt,
  credit: { name, url: `https://unsplash.com/@${handle}` },
});

export const images = {
  // Full-bleed hero background (ref: blue sky with clouds). Soft white cumulus over blue.
  // tint: the photo is pale, so the hero lays a blue multiply layer over it to reach the reference's deep sky blue
  heroSky: { ...photo(
    '1617150119111-09bbb85178b0',
    '#e1e6f9',
    'Soft white clouds drifting across a pale blue sky',
    'Sonny Mauricio',
    'northernstatemedia',
  ), tint: true },
  // two-cols card 1 (ref: blurred orange tulips). Orange tulips against a deep teal backdrop.
  tulips: photo(
    '1617265178133-3651f975a10e',
    '#dc7536',
    'Orange tulips in bloom against a deep teal background',
    'Aleksandra Sapozhnikova',
    'rruprrup',
  ),
  // two-cols card 2 (ref: green meadow). Wildflower meadow on a green hillside, warm evening light.
  meadow: photo(
    '1617067128946-8c4f807d91e1',
    '#828951',
    'Green wildflower meadow on a hillside in warm evening light',
    'Daniel Pintilei',
    'danielpintilei',
  ),
  // two-cols card 3 (ref: orange desert dune). Rippled orange sand dunes under a clear sky.
  dune: photo(
    '1617374128851-c84e37dc9f37',
    '#bd835a',
    'Rippled orange sand dunes under a clear pale sky',
    'Emma Van Sant',
    'emma',
  ),
  // partner-hero wide card (ref: white daisies). White daisy on a soft-focus green background.
  daisies: photo(
    '1617111975233-7d0a24a6cf3d',
    '#397b5c',
    'White daisies against a soft-focus green background',
    'Georgian Constantin',
    'anotheroutsider',
  ),
  // cta background, full-bleed ~495px tall (ref: green rolling hills). Bright green valley and hills.
  hills: photo(
    '1617634667039-8e4cb277ab46',
    '#445f35',
    'Bright green rolling hills and valley under a blue sky',
    'Daniel Angele',
    'danangele',
  ),
} as const;

export type ImageKey = keyof typeof images;
export default images;
