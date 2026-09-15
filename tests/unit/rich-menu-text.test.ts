import { describe, expect, it } from 'vitest';
import { RICH_MENU_STRINGS, rendersInSatori } from '@/lib/line/rich-menu';

/**
 * The image renderer drops a tone mark that lands on top of an above-vowel,
 * silently. Nothing about the output says it happened — the word just comes
 * back missing a mark, and only a Thai reader notices.
 *
 * So the wording of the rich menu is a constraint, not a preference, and this
 * is the test that keeps it one. Rewording a label to something more natural
 * is exactly how the defect would come back.
 */
describe('rendersInSatori', () => {
  it('rejects a tone mark stacked on an above-vowel', () => {
    expect(rendersInSatori('ที่อยู่')).toBe(false);
    expect(rendersInSatori('เมื่อ')).toBe(false);
    expect(rendersInSatori('ดูนัดที่จองไว้')).toBe(false);
  });

  it('accepts a tone mark on a bare consonant or a below-vowel', () => {
    expect(rendersInSatori('อยู่')).toBe(true);
    expect(rendersInSatori('ผู้ใช้')).toBe(true);
    expect(rendersInSatori('ติดต่อ')).toBe(true);
    expect(rendersInSatori('ร้าน')).toBe(true);
  });

  it('accepts sara am and maitaikhu, which render correctly', () => {
    expect(rendersInSatori('ทำเล็บ')).toBe(true);
    expect(rendersInSatori('ตำแหน่ง')).toBe(true);
  });

  it('passes every string the rich menu draws', () => {
    for (const text of RICH_MENU_STRINGS) {
      expect(rendersInSatori(text), `"${text}" จะเรนเดอร์ผิด`).toBe(true);
    }
  });
});
