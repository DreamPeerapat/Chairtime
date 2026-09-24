/**
 * Size and palette shared by the customer and owner rich menu images.
 *
 * In its own module so both drawings, and lib/line/owner-menu.ts through the
 * re-export in rich-menu.tsx, read the one copy of every dimension.
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

export const GROUND = '#fbf9f5';
export const INK = '#14201f';
export const INK_RAISED = '#1b2827';
export const INK_LINE = '#26332f';
export const MUTED = '#5c6b6a';
export const LINE_COLOUR = '#ece7de';
export const TEAL = '#0f766e';
export const TEAL_DEEP = '#115e59';
export const TEAL_SOFT = '#eaf5f2';
export const TEAL_LIGHT = '#5eead4';
