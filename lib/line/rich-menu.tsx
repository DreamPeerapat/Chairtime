import { ImageResponse } from 'next/og';

/**
 * The rich menu image a shop uploads to LINE.
 *
 * Step 6 of the LINE wizard asks the shop to put a booking button under the
 * chat, because a customer who has to know the words "จองคิว" will never
 * book. It then asked them to supply a 2500x1686 image, which for a salon
 * owner with no design tool is where the whole setup stops.
 *
 * So the product draws it. The labels match the keywords the webhook already
 * answers, and the shop's own name sits on the booking band, so the menu does
 * not look like it belongs to somebody else.
 *
 * Redrawn on the palette and the two typefaces the rest of the product moved
 * to: a warm ivory ground rather than white, the teal kept because the LINE
 * messages use it, and the big words in the serif that every heading in the
 * app is set in. This image is the only part of Chairtime a customer sees
 * before they have used it once — it looking like the product matters.
 */
export const RICH_MENU_SIZE = { width: 2500, height: 1686 };

/**
 * The owner menu's header strip.
 *
 * Exported because lib/line/owner-menu.ts derives its tap-area bounds from
 * it. LINE does not check that the picture and the bounds agree, so a menu
 * with these out of step looks right and opens the wrong page — which is
 * exactly what a second copy of `180` typed in the other file would produce.
 */
export const RICH_MENU_HEADER = 190;

const GROUND = '#fbf9f5';
const INK = '#14201f';
const INK_RAISED = '#1b2827';
const INK_LINE = '#26332f';
const MUTED = '#5c6b6a';
const LINE_COLOUR = '#ece7de';
const TEAL = '#0f766e';
const TEAL_DEEP = '#115e59';
const TEAL_SOFT = '#eaf5f2';
const TEAL_LIGHT = '#5eead4';

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

function loadFonts() {
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

function toFontList(fonts: LoadedFont[]) {
  return fonts.map((f) => ({
    name: f.name,
    data: f.data,
    weight: f.weight,
    style: 'normal' as const,
  }));
}

/**
 * Icons, drawn rather than described.
 *
 * A rich menu of nothing but words is a wall of Thai at thumbnail size; the
 * glyph is what a customer recognises before they have read anything. Inline
 * SVG because satori renders it and an icon package would be a dependency
 * for six shapes — the same call the landing page made.
 *
 * Two things satori will not do, both found by rendering rather than by
 * reading: it cannot take a Fragment as an SVG child (it tries to stringify
 * the Fragment symbol and throws "Cannot convert a Symbol value to a
 * string"), and it does not inherit presentation attributes from a parent
 * `<g>`. So an icon is a flat array of elements and every one of them
 * carries its own stroke.
 */
type IconPaths = (colour: string) => React.ReactNode[];

function strokeProps(colour: string) {
  return {
    stroke: colour,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
}

function Icon({ paths, size, colour }: { paths: IconPaths; size: number; colour: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths(colour)}
    </svg>
  );
}

const CALENDAR: IconPaths = (c) => [
  <rect key="a" x="3" y="5" width="18" height="16" rx="3" {...strokeProps(c)} />,
  <path key="b" d="M8 3v4" {...strokeProps(c)} />,
  <path key="c" d="M16 3v4" {...strokeProps(c)} />,
  <path key="d" d="M3 10h18" {...strokeProps(c)} />,
];

const LIST: IconPaths = (c) => [
  <rect key="a" x="3" y="4" width="18" height="17" rx="3" {...strokeProps(c)} />,
  <path key="b" d="M7 9h10" {...strokeProps(c)} />,
  <path key="c" d="M7 13h10" {...strokeProps(c)} />,
  <path key="d" d="M7 17h6" {...strokeProps(c)} />,
];

const PHOTO: IconPaths = (c) => [
  <rect key="a" x="3" y="4" width="18" height="16" rx="3" {...strokeProps(c)} />,
  <circle key="b" cx="8.5" cy="9.5" r="1.6" {...strokeProps(c)} />,
  <path key="c" d="m4 17 5-5 4 4 2.5-2.5L20 17" {...strokeProps(c)} />,
];

const PHONE: IconPaths = (c) => [
  <path
    key="a"
    d="M5 3h3.5l1.8 4.4-2.2 1.4a13 13 0 0 0 6.1 6.1l1.4-2.2L20 14.5V18a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.2 2 2 0 0 1 5 3z"
    {...strokeProps(c)}
  />,
];

const CHART: IconPaths = (c) => [
  <path key="a" d="M4 20V10" {...strokeProps(c)} />,
  <path key="b" d="M10 20V4" {...strokeProps(c)} />,
  <path key="c" d="M16 20v-7" {...strokeProps(c)} />,
  <path key="d" d="M22 20H2" {...strokeProps(c)} />,
];

const PEOPLE: IconPaths = (c) => [
  <circle key="a" cx="9" cy="8" r="3.2" {...strokeProps(c)} />,
  <path key="b" d="M3 20a6 6 0 0 1 12 0" {...strokeProps(c)} />,
  <path key="c" d="M16 5.5a3 3 0 0 1 0 5.6" {...strokeProps(c)} />,
  <path key="d" d="M18 14.2A5.6 5.6 0 0 1 21 20" {...strokeProps(c)} />,
];

const SLIDERS: IconPaths = (c) => [
  <path key="a" d="M4 7h10" {...strokeProps(c)} />,
  <path key="b" d="M18 7h2" {...strokeProps(c)} />,
  <circle key="c" cx="16" cy="7" r="2.2" {...strokeProps(c)} />,
  <path key="d" d="M4 17h4" {...strokeProps(c)} />,
  <path key="e" d="M12 17h8" {...strokeProps(c)} />,
  <circle key="f" cx="10" cy="17" r="2.2" {...strokeProps(c)} />,
];

/**
 * The three keywords the LINE webhook answers, plus the gallery page.
 *
 * Every string drawn on this image has to clear `rendersInSatori` — see the
 * note on that function. `tests/unit/rich-menu-text.test.ts` checks these, so
 * a reworded label cannot quietly reintroduce a dropped tone mark.
 */
const BOTTOM_CELLS = [
  { label: 'คิวของฉัน', hint: 'ดูรายการจองของคุณ', icon: LIST },
  { label: 'ผลงาน', hint: 'รูปงานของร้าน', icon: PHOTO },
  { label: 'ติดต่อ', hint: 'เบอร์โทรของร้าน', icon: PHONE },
];

/**
 * Whether Thai text survives the image renderer intact.
 *
 * satori drops a tone mark that sits on top of an above-vowel: `ที่` comes out
 * as `ที`, `เมื่อ` as `เมือ`. Below-vowels are fine (`อยู่` keeps its mark), and so
 * is `ำ`, so this is narrower than it first looks - but it is silent, and a Thai
 * reader notices immediately. Swapping fonts does not help: it is the shaper,
 * not the glyphs.
 *
 * Every literal this module draws is checked against it in the unit tests. A
 * shop's own name is not - it is their name, and showing it slightly wrong
 * beats leaving it off their menu.
 */
export function rendersInSatori(text: string): boolean {
  // MAI HAN AKAT, SARA I..SARA UEE, MAITAIKHU, NIKHAHIT — every vowel that sits
  // above the consonant — followed by MAI EK..THANTHAKHAT, the tone marks that
  // then have nowhere to go.
  const STACKED_ABOVE = /[ัิ-ื็ํ][่-์]/;
  return !STACKED_ABOVE.test(text);
}

/** Exported for the unit test: everything this module draws, except the shop name. */
export const RICH_MENU_STRINGS = [
  'จองคิว',
  'เลือกวัน เวลา และช่างได้เอง',
  ...BOTTOM_CELLS.flatMap((c) => [c.label, c.hint]),
];

/**
 * The owner's own menu — four tap areas, one per screen they open daily.
 *
 * Deliberately nothing like the customer menu: it is dark, so a glance at the
 * chat list tells the owner which menu they are looking at, and every label
 * names a page rather than a keyword, because these are links, not messages
 * the webhook has to answer.
 *
 * Every label here clears `rendersInSatori` too — "คิววันนี้" and "ตั้งค่า"
 * were the first drafts and both lose their tone mark, so they are not used.
 */
const OWNER_CELLS = [
  { label: 'ตารางคิว', hint: 'คิวประจำวัน', path: '/dashboard', icon: CALENDAR },
  { label: 'สรุปยอด', hint: 'รายได้และบริการ', path: '/dashboard/summary', icon: CHART },
  { label: 'ลูกค้า', hint: 'ค้นหาและประวัติ', path: '/dashboard/customers', icon: PEOPLE },
  { label: 'จัดการร้าน', hint: 'บริการ ช่าง เวลา', path: '/dashboard/settings', icon: SLIDERS },
] as const;

export const OWNER_MENU_CELLS = OWNER_CELLS;

/** Exported for the unit test, same as RICH_MENU_STRINGS. */
export const OWNER_MENU_STRINGS = [
  'หลังร้าน',
  ...OWNER_CELLS.flatMap((c) => [c.label, c.hint]),
];

export async function ownerRichMenuImage(shopName: string) {
  const fonts = await loadFonts();
  const half = RICH_MENU_SIZE.width / 2;
  const rowHeight = (RICH_MENU_SIZE.height - RICH_MENU_HEADER) / 2;

  return new ImageResponse(
    (
      <div
        style={{
          width: RICH_MENU_SIZE.width,
          height: RICH_MENU_SIZE.height,
          display: 'flex',
          flexDirection: 'column',
          background: INK,
          fontFamily: 'Plex',
        }}
      >
        <div
          style={{
            height: RICH_MENU_HEADER,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 72,
            borderBottom: `3px solid ${INK_LINE}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 20,
              height: 60,
              borderRadius: 10,
              background: TEAL_LIGHT,
              marginRight: 28,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'NotoSerifThai',
              fontSize: 60,
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            หลังร้าน
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 44,
              fontWeight: 400,
              color: '#8fa3a0',
              marginLeft: 28,
            }}
          >
            {shopName}
          </div>
        </div>

        {[0, 1].map((row) => (
          <div key={row} style={{ height: rowHeight, display: 'flex' }}>
            {OWNER_CELLS.slice(row * 2, row * 2 + 2).map((cell, column) => (
              <div
                key={cell.label}
                style={{
                  width: half,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: (row + column) % 2 === 0 ? INK : INK_RAISED,
                  borderLeft: column === 0 ? 'none' : `3px solid ${INK_LINE}`,
                  borderTop: row === 0 ? 'none' : `3px solid ${INK_LINE}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: 132,
                    height: 132,
                    borderRadius: 40,
                    background: '#16302c',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon paths={cell.icon} size={72} colour={TEAL_LIGHT} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'NotoSerifThai',
                    fontSize: 118,
                    fontWeight: 600,
                    color: '#ffffff',
                    marginTop: 32,
                  }}
                >
                  {cell.label}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 46,
                    fontWeight: 400,
                    color: '#8fa3a0',
                    marginTop: 18,
                  }}
                >
                  {cell.hint}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
    { ...RICH_MENU_SIZE, fonts: toFontList(fonts) },
  );
}

export async function richMenuImage(shopName: string) {
  const fonts = await loadFonts();
  const cellWidth = RICH_MENU_SIZE.width / 3;

  return new ImageResponse(
    (
      <div
        style={{
          width: RICH_MENU_SIZE.width,
          height: RICH_MENU_SIZE.height,
          display: 'flex',
          flexDirection: 'column',
          background: GROUND,
          fontFamily: 'Plex',
        }}
      >
        {/* Top half, one tap area: the thing the menu exists for. */}
        <div
          style={{
            height: 843,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
            color: '#ffffff',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.14)',
              padding: '18px 40px',
            }}
          >
            <Icon paths={CALENDAR} size={52} colour="#ffffff" />
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 400, marginLeft: 20 }}>
              {shopName}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              fontFamily: 'NotoSerifThai',
              fontSize: 232,
              fontWeight: 600,
              marginTop: 28,
            }}
          >
            จองคิว
          </div>

          <div style={{ display: 'flex', fontSize: 58, fontWeight: 400, opacity: 0.9, marginTop: 8 }}>
            เลือกวัน เวลา และช่างได้เอง
          </div>
        </div>

        {/* Bottom half, three tap areas of equal width. */}
        <div style={{ height: 843, display: 'flex' }}>
          {BOTTOM_CELLS.map((cell, index) => (
            <div
              key={cell.label}
              style={{
                width: cellWidth,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: GROUND,
                borderLeft: index === 0 ? 'none' : `3px solid ${LINE_COLOUR}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: 140,
                  height: 140,
                  borderRadius: 44,
                  background: TEAL_SOFT,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon paths={cell.icon} size={76} colour={TEAL} />
              </div>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'NotoSerifThai',
                  fontSize: 106,
                  fontWeight: 600,
                  color: INK,
                  marginTop: 34,
                }}
              >
                {cell.label}
              </div>
              <div
                style={{ display: 'flex', fontSize: 46, fontWeight: 400, color: MUTED, marginTop: 18 }}
              >
                {cell.hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...RICH_MENU_SIZE, fonts: toFontList(fonts) },
  );
}
