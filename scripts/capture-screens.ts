/**
 * Capture every screen against the seeded database.
 *
 * These are real screenshots of the running app, not mockups — so what they
 * show is what the shop actually gets, including where the seed data is thin.
 *
 *   pnpm build && pnpm start &
 *   pnpm tsx scripts/capture-screens.ts
 *
 * Output lands in docs/screens/.
 */
import { mkdir, rm } from 'node:fs/promises';
import { chromium, type Browser, type Page } from '@playwright/test';
import { loadEnv } from '@/lib/env';

loadEnv();

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:3111';
const OUT = 'docs/screens';
const OWNER = { email: 'owner@thehair-thonglor.test', password: 'chairtime123' };
const SHOP = 'thehair-thonglor';

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(400); // let fonts and any transition settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`  ${name}.png`);
}

async function captureCustomer(browser: Browser) {
  console.log('หน้าลูกค้า (มือถือ)');
  const context = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, locale: 'th-TH' });
  const page = await context.newPage();

  await page.goto(`${BASE}/${SHOP}`, { waitUntil: 'networkidle' });
  await shot(page, '01-customer-services');

  // Pick two services so the summary bar has something to show.
  await page.getByRole('button', { name: /สระ\+ตัด/ }).first().click();
  await page.getByRole('button', { name: /ย้อมผม/ }).first().click();
  await shot(page, '02-customer-services-selected');

  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await shot(page, '03-customer-staff');

  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.waitForTimeout(1200); // availability round trip

  // Two services run 170 minutes, which will not fit into what is left of
  // today; step along the date strip until a day has room.
  const dayChips = page.locator('button[aria-pressed]').filter({ hasText: /^\D*\d{1,2}\D*$/ });
  for (let i = 1; i < 8; i += 1) {
    if ((await page.locator('button.tabular-nums').count()) > 0) break;
    await dayChips.nth(i).click();
    await page.waitForTimeout(1000);
  }
  await shot(page, '04-customer-time');

  const slot = page.locator('button.tabular-nums').first();
  if (await slot.isVisible().catch(() => false)) {
    await slot.click();
    await page.getByRole('button', { name: 'ถัดไป' }).click();
    await page.waitForTimeout(400);
    await shot(page, '05-customer-confirm');
  } else {
    console.warn('  (ข้าม 05 — ไม่พบเวลาว่างใน 7 วันข้างหน้า)');
  }

  // A booking detail page, from a booking that already exists in the seed.
  const code = process.env.SCREENSHOT_BOOKING_CODE;
  if (code) {
    await page.goto(`${BASE}/${SHOP}/booking/${code}`, { waitUntil: 'networkidle' });
    await shot(page, '06-customer-booking-detail');
  }

  await context.close();
}

async function captureAdmin(browser: Browser) {
  console.log('หน้าหลังร้าน (เดสก์ท็อป)');
  const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, locale: 'th-TH' });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await shot(page, '07-admin-login', false);

  await page.getByLabel('อีเมล').fill(OWNER.email);
  await page.getByLabel('รหัสผ่าน').fill(OWNER.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(800);
  await shot(page, '08-admin-calendar');

  // Walk forward to a day that has bookings, so the calendar is not empty.
  for (let i = 0; i < 7; i += 1) {
    if ((await page.locator('.fc-event').count()) > 2) break;
    await page.getByRole('button', { name: 'วันถัดไป' }).click();
    await page.waitForTimeout(700);
  }
  await shot(page, '09-admin-calendar-busy');

  // Filtered to one stylist.
  const stylist = page.getByRole('button', { name: /ช่างโอ๊ต/ }).first();
  if (await stylist.isVisible().catch(() => false)) {
    await stylist.click();
    await page.waitForTimeout(500);
    await shot(page, '10-admin-calendar-filtered');
    await page.getByRole('button', { name: 'ทั้งหมด' }).click();
    await page.waitForTimeout(400);
  }

  // The booking drawer.
  const event = page.locator('.fc-event').first();
  if (await event.isVisible().catch(() => false)) {
    await event.click();
    await page.waitForTimeout(400);
    await shot(page, '11-admin-booking-drawer', false);
    await page.getByRole('button', { name: 'ปิด' }).click();
    await page.waitForTimeout(300);
  }

  // Walk-in.
  await page.getByRole('button', { name: '+ Walk-in' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'สระ+ตัด' }).first().click();
  await page.waitForTimeout(1200);
  await shot(page, '12-admin-walk-in', false);
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/dashboard/services`, { waitUntil: 'networkidle' });
  await shot(page, '13-admin-services');

  await page.getByRole('button', { name: /ย้อมผม/ }).first().click();
  await page.waitForTimeout(400);
  await shot(page, '14-admin-service-editor', false);
  await page.getByRole('button', { name: 'ยกเลิก' }).click();

  await page.goto(`${BASE}/dashboard/resources`, { waitUntil: 'networkidle' });
  await shot(page, '15-admin-resources');

  await page.getByRole('button', { name: 'เวลาทำการ' }).click();
  await page.waitForTimeout(400);
  await shot(page, '16-admin-hours');

  await page.getByRole('button', { name: 'วันลา / ปิดร้าน' }).click();
  await page.waitForTimeout(400);
  await shot(page, '17-admin-time-off');

  await page.goto(`${BASE}/dashboard/customers`, { waitUntil: 'networkidle' });
  await shot(page, '18-admin-customers');

  const firstCustomer = page.locator('a[href^="/dashboard/customers/"]').first();
  if (await firstCustomer.isVisible().catch(() => false)) {
    await firstCustomer.click();
    await page.waitForTimeout(600);
    await shot(page, '19-admin-customer-detail');
  }

  await page.goto(`${BASE}/dashboard/customers?merge=1`, { waitUntil: 'networkidle' });
  await shot(page, '20-admin-merge');

  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: 'networkidle' });
  await shot(page, '21-admin-settings');

  await context.close();
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    await captureCustomer(browser);
    await captureAdmin(browser);
  } finally {
    await browser.close();
  }

  console.log(`\nเสร็จแล้ว — ดูที่ ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
