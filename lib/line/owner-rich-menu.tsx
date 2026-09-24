import { ImageResponse } from 'next/og';
import { OWNER_CELLS } from './rich-menu-cells';
import { loadFonts, toFontList } from './rich-menu-fonts';
import { Icon } from './rich-menu-icons';
import { INK, INK_LINE, INK_RAISED, RICH_MENU_HEADER, RICH_MENU_SIZE, TEAL_LIGHT } from './rich-menu-theme';

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
