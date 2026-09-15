/**
 * The letter in a stylist's avatar circle.
 *
 * Thai makes the naive version useless twice over: a salon lists everyone as
 * ช่าง<name>, so first-character initials are all "ช"; and several vowels are
 * written before the consonant they follow, so one character on its own is a
 * floating mark rather than a letter.
 */
import { describe, expect, it } from 'vitest';
import { initialOf } from '@/components/booking/format';

describe('initialOf', () => {
  it('looks past the job title', () => {
    expect(initialOf('ช่างแนน')).not.toBe('ช');
    expect(initialOf('ช่างมิ้นท์')).toBe('ม');
    expect(initialOf('คุณพลอย')).toBe('พ');
    expect(initialOf('หมอสมพร')).toBe('ส');
  });

  it('tells apart staff whose names all start with the same title', () => {
    const initials = ['ช่างแนน', 'ช่างมิ้นท์', 'ช่างเบล', 'ช่างพลอย'].map(initialOf);
    expect(new Set(initials).size).toBe(4);
  });

  it('keeps a leading vowel together with its consonant', () => {
    // "แนน" written as just "แ" is a mark with nothing to attach to.
    expect(initialOf('ช่างแนน')).toBe('แน');
    expect(initialOf('ช่างเบล')).toBe('เบ');
    expect(initialOf('ไข่มุก')).toBe('ไข');
  });

  it('falls back to the whole name when the title is all there is', () => {
    expect(initialOf('ช่าง')).toBe('ช');
    expect(initialOf('  ')).toBe('');
  });

  it('handles names that are not Thai', () => {
    expect(initialOf('Anna')).toBe('A');
    expect(initialOf('เก้าอี้ 1')).toBe('เก');
  });
});
