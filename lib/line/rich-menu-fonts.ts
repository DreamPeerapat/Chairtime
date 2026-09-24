/**
 * Fetched rather than committed: a font file in the repo is a binary nobody
 * reviews, and these are the same two families the app already asks for in
 * CSS. Cached for the life of the server process — the image is generated a
 * handful of times per shop, not per request.
 */
const PLEX = 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans-thai@5/files';
const SERIF = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-thai@5/files';

interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600;
}

let fontCache: Promise<LoadedFont[]> | null = null;

export function loadFonts() {
  fontCache ??= Promise.all(
    (
      [
        ['Plex', `${PLEX}/ibm-plex-sans-thai-thai-600-normal.woff`, 600],
        ['Plex', `${PLEX}/ibm-plex-sans-thai-latin-600-normal.woff`, 600],
        ['Plex', `${PLEX}/ibm-plex-sans-thai-thai-400-normal.woff`, 400],
        ['NotoSerifThai', `${SERIF}/noto-serif-thai-thai-600-normal.woff`, 600],
        ['NotoSerifThai', `${SERIF}/noto-serif-thai-latin-600-normal.woff`, 600],
      ] as const
    ).map(async ([name, url, weight]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`font ${url} failed: ${response.status}`);
      return { name, data: await response.arrayBuffer(), weight: weight as 400 | 600 };
    }),
  ).catch((error) => {
    // Let the next request try again rather than caching the failure forever.
    fontCache = null;
    throw error;
  });
  return fontCache;
}

export function toFontList(fonts: LoadedFont[]) {
  return fonts.map((f) => ({
    name: f.name,
    data: f.data,
    weight: f.weight,
    style: 'normal' as const,
  }));
}
