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
 */
export const RICH_MENU_SIZE = { width: 2500, height: 1686 };

const TEAL = '#0f766e';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE_COLOUR = '#e2e8f0';

/**
 * Fetched rather than committed: a font file in the repo is a binary nobody
 * reviews, and this is the same family the app already asks for in CSS.
 * Cached for the life of the server process — the image is generated a handful
 * of times per shop, not per request.
 */
const FONT_BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans-thai@5/files';
let fontCache: Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 600 }>> | null = null;

function loadFonts() {
  fontCache ??= Promise.all(
    (
      [
        ['thai', 600],
        ['latin', 600],
        ['thai', 400],
      ] as const
    ).map(async ([subset, weight]) => {
      const url = `${FONT_BASE}/ibm-plex-sans-thai-${subset}-${weight}-normal.woff`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`font ${subset}/${weight} failed: ${response.status}`);
      return { name: 'Plex', data: await response.arrayBuffer(), weight: weight as 400 | 600 };
    }),
  ).catch((error) => {
    // Let the next request try again rather than caching the failure forever.
    fontCache = null;
    throw error;
  });
  return fontCache;
}

/**
 * The three keywords the LINE webhook answers, plus the gallery page.
 *
 * Every string drawn on this image has to clear `rendersInSatori` — see the
 * note on that function. `tests/unit/rich-menu-text.test.ts` checks these, so
 * a reworded label cannot quietly reintroduce a dropped tone mark.
 */
const BOTTOM_CELLS = [
  { label: 'คิวของฉัน', hint: 'ดูรายการจองของคุณ' },
  { label: 'ผลงาน', hint: 'รูปงานของร้าน' },
  { label: 'ติดต่อ', hint: 'เบอร์โทรของร้าน' },
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
  { label: 'ตารางคิว', hint: 'คิวประจำวัน', path: '/dashboard' },
  { label: 'สรุปยอด', hint: 'รายได้และบริการ', path: '/dashboard/summary' },
  { label: 'ลูกค้า', hint: 'ค้นหาและประวัติ', path: '/dashboard/customers' },
  { label: 'จัดการร้าน', hint: 'บริการ ช่าง เวลา', path: '/dashboard/settings' },
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
        <div style={{ height: 180, display: 'flex', alignItems: 'center', paddingLeft: 64 }}>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 600, color: '#5eead4' }}>
            หลังร้าน
          </div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 400, color: '#94a3b8', marginLeft: 24 }}>
            {shopName}
          </div>
        </div>

        {[0, 1].map((row) => (
          <div key={row} style={{ height: 753, display: 'flex' }}>
            {OWNER_CELLS.slice(row * 2, row * 2 + 2).map((cell, column) => (
              <div
                key={cell.label}
                style={{
                  width: half,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderLeft: column === 0 ? 'none' : '4px solid #1e293b',
                  borderTop: row === 0 ? 'none' : '4px solid #1e293b',
                }}
              >
                <div style={{ display: 'flex', fontSize: 130, fontWeight: 600, color: '#ffffff' }}>
                  {cell.label}
                </div>
                <div style={{ display: 'flex', fontSize: 48, fontWeight: 400, color: '#94a3b8', marginTop: 24 }}>
                  {cell.hint}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
    {
      ...RICH_MENU_SIZE,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: 'normal' as const })),
    },
  );
}

export async function richMenuImage(shopName: string) {
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: RICH_MENU_SIZE.width,
          height: RICH_MENU_SIZE.height,
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
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
            background: TEAL,
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 400, opacity: 0.85 }}>
            {shopName}
          </div>
          <div style={{ display: 'flex', fontSize: 220, fontWeight: 600, marginTop: 24 }}>
            จองคิว
          </div>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 400, opacity: 0.85, marginTop: 16 }}>
            เลือกวัน เวลา และช่างได้เอง
          </div>
        </div>

        {/* Bottom half, three tap areas of equal width. */}
        <div style={{ height: 843, display: 'flex' }}>
          {BOTTOM_CELLS.map((cell, index) => (
            <div
              key={cell.label}
              style={{
                width: RICH_MENU_SIZE.width / 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderLeft: index === 0 ? 'none' : `4px solid ${LINE_COLOUR}`,
              }}
            >
              <div style={{ display: 'flex', fontSize: 110, fontWeight: 600, color: INK }}>
                {cell.label}
              </div>
              <div style={{ display: 'flex', fontSize: 48, fontWeight: 400, color: MUTED, marginTop: 20 }}>
                {cell.hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...RICH_MENU_SIZE,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: 'normal' as const })),
    },
  );
}
