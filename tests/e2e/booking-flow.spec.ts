/**
 * The customer-facing booking flow in a real browser.
 *
 * The API-level race is covered in booking-api.spec.ts. What this file proves
 * is what the customer is told when they lose that race: the slot they filled
 * in the form for was taken while they typed, and the screen has to say so and
 * offer a way forward. docs/logic.md §2 forbids retrying for them.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from '../../lib/env.ts';

loadEnv();

// Staff selection is on for this shop, so the "pick someone else" route exists.
const SHOP = 'thehair-thonglor';

/**
 * Walk the flow as far as the confirm step, stopping on the first day that has
 * a slot. The seeded salon closes on Mondays, so a fixed offset would make the
 * test depend on the day of the week it runs.
 */
async function reachConfirmStep(page: Page): Promise<void> {
  await page.goto(`/${SHOP}`);

  await page.getByRole('button', { name: 'สระ+ตัด' }).click();
  await page.getByRole('button', { name: 'ถัดไป' }).click();

  // Staff step: take whatever the shop offers first and move on. Entering the
  // time step fires the first availability request.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/availability'), { timeout: 15_000 }),
    page.getByRole('button', { name: 'ถัดไป' }).click(),
  ]);

  // Slot buttons are labelled with the time itself; day buttons live in the
  // labelled picker above them.
  const slots = page.getByRole('button', { name: /^\d{2}:\d{2}$/ });
  const days = page.getByRole('group', { name: 'เลือกวัน' }).getByRole('button');

  // Entering the step kicks off its own availability request; waiting for the
  // response is the only reliable signal that the grid below is settled.
  const availability = () =>
    page.waitForResponse((r) => r.url().includes('/api/availability'), { timeout: 15_000 });

  const dayCount = await days.count();
  for (let index = 0; index < Math.min(dayCount, 10); index += 1) {
    if (index > 0) {
      await Promise.all([availability(), days.nth(index).click()]);
    }
    if (await slots.count()) {
      await slots.first().click();
      await page.getByRole('button', { name: 'ถัดไป' }).click();
      await expect(page.getByRole('heading', { name: 'ยืนยันการจอง' })).toBeVisible();
      return;
    }
  }
  throw new Error('no bookable day found in the next 10 days');
}

test('tells the customer when the slot was taken while they were filling the form', async ({
  page,
}) => {
  await reachConfirmStep(page);

  // Somebody else got there first. 409 is what the API returns for that.
  await page.route('**/api/bookings', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'ช่วงเวลานี้เพิ่งถูกจองไป', code: 'SLOT_TAKEN' }),
    });
  });

  // The shop needs a name and a number before it will take the booking.
  await page.getByPlaceholder('ชื่อที่ให้ร้านเรียก').fill('คุณทดสอบ');
  await page.getByPlaceholder('08xxxxxxxx').fill('0891112222');

  await page.getByRole('button', { name: 'ยืนยันการจอง' }).click();

  // Next.js keeps its own empty role=alert for route announcements, so narrow
  // to the banner by its text rather than matching every alert on the page.
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'ช่วงเวลานี้เพิ่งถูกจองไป' });
  await expect(alert).toContainText('ช่วงเวลานี้เพิ่งถูกจองไปเมื่อสักครู่');
  await expect(alert).toContainText('เลือกช่างคนอื่น');

  // Back on the time step with fresh options, not silently moved elsewhere.
  await expect(page.getByRole('heading', { name: 'เลือกวันและเวลา' })).toBeVisible();

  // The offer to change stylist has to actually go to the stylist step.
  await alert.getByRole('button', { name: 'เลือกช่างคนอื่น' }).click();
  await expect(page.getByRole('heading', { name: 'เลือกช่าง' })).toBeVisible();
  await expect(alert).toHaveCount(0);
});
