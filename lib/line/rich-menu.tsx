import { ImageResponse } from 'next/og';
import { BOTTOM_CELLS } from './rich-menu-cells';
import { loadFonts, toFontList } from './rich-menu-fonts';
import { CALENDAR, Icon } from './rich-menu-icons';
import { GROUND, INK, LINE_COLOUR, MUTED, RICH_MENU_SIZE, TEAL, TEAL_DEEP, TEAL_SOFT } from './rich-menu-theme';

// The pieces live in sibling modules; these re-exports keep every existing
// import of '@/lib/line/rich-menu' working.
export { RICH_MENU_HEADER, RICH_MENU_SIZE } from './rich-menu-theme';
export {
  OWNER_MENU_CELLS,
  OWNER_MENU_STRINGS,
  RICH_MENU_STRINGS,
  rendersInSatori,
} from './rich-menu-cells';
export { ownerRichMenuImage } from './owner-rich-menu';

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
