import { CALENDAR, CHART, LIST, PEOPLE, PHONE, PHOTO, SLIDERS } from './rich-menu-icons';

/**
 * The three keywords the LINE webhook answers, plus the gallery page.
 *
 * Every string drawn on this image has to clear `rendersInSatori` — see the
 * note on that function. `tests/unit/rich-menu-text.test.ts` checks these, so
 * a reworded label cannot quietly reintroduce a dropped tone mark.
 */
export const BOTTOM_CELLS = [
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
export const OWNER_CELLS = [
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
