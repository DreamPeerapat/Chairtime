/**
 * Reading coordinates out of whatever the shop pasted.
 *
 * Every shape here is one Google Maps actually produces from the share sheet,
 * the address bar, or the mobile app. The one worth being careful about is a
 * place link carrying both `@centre` and `!3d!4d`: they are different points,
 * and the pin is the shop.
 */
import { describe, expect, it, vi } from 'vitest';
import { isShortMapLink, parseMapLocation, resolveMapLocation } from '@/lib/geo/map-link';

const SIAM = { latitude: 13.7466, longitude: 100.5347 };

describe('parseMapLocation', () => {
  it('reads a plain pair of numbers', () => {
    expect(parseMapLocation('13.7466, 100.5347')).toEqual(SIAM);
    expect(parseMapLocation('13.7466,100.5347')).toEqual(SIAM);
  });

  it('prefers the pin over the map centre in a place link', () => {
    // @13.74,100.50 is where the map was scrolled to; !3d!4d is the shop.
    const url =
      'https://www.google.com/maps/place/Siam+Paragon/@13.7400,100.5000,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d13.7466!4d100.5347';
    expect(parseMapLocation(url)).toEqual(SIAM);
  });

  it('falls back to the map centre when there is no pin', () => {
    expect(parseMapLocation('https://www.google.com/maps/@13.7466,100.5347,15z')).toEqual(SIAM);
  });

  it('reads the query forms the share sheet produces', () => {
    expect(parseMapLocation('https://maps.google.com/?q=13.7466,100.5347')).toEqual(SIAM);
    expect(
      parseMapLocation('https://www.google.com/maps/search/?api=1&query=13.7466%2C100.5347'),
    ).toEqual(SIAM);
  });

  it('refuses what is not a location', () => {
    expect(parseMapLocation('')).toBeNull();
    expect(parseMapLocation('ซอยอารีย์ 4 พหลโยธิน')).toBeNull();
    expect(parseMapLocation('https://www.google.com/maps/place/Siam+Paragon')).toBeNull();
    // Out of range, and the Atlantic null island a half-parsed URL yields.
    expect(parseMapLocation('91.0, 100.5')).toBeNull();
    expect(parseMapLocation('13.7, 181.0')).toBeNull();
    expect(parseMapLocation('0, 0')).toBeNull();
  });
});

describe('isShortMapLink', () => {
  it('knows the shorteners', () => {
    expect(isShortMapLink('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(isShortMapLink('https://goo.gl/maps/AbCdEf')).toBe(true);
  });

  it('will not follow anything else', () => {
    // The server fetches whatever this approves, so the list is the defence.
    expect(isShortMapLink('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isShortMapLink('https://evil.example.com/redirect')).toBe(false);
    expect(isShortMapLink('file:///etc/passwd')).toBe(false);
  });
});

describe('resolveMapLocation', () => {
  it('expands a short link and reads where it landed', async () => {
    const fetchImpl = vi.fn(async () => ({
      url: 'https://www.google.com/maps/place/X/@13.74,100.50,17z/data=!3d13.7466!4d100.5347',
    })) as unknown as typeof fetch;

    expect(await resolveMapLocation('https://maps.app.goo.gl/AbCdEf', fetchImpl)).toEqual(SIAM);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not reach the network for a link that already has coordinates', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await resolveMapLocation('13.7466, 100.5347', fetchImpl)).toEqual(SIAM);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gives up quietly when the shortener fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    expect(await resolveMapLocation('https://maps.app.goo.gl/AbCdEf', fetchImpl)).toBeNull();
  });
});
