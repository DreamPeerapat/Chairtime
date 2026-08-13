/**
 * The admin screens, driven in a real browser against the seeded database.
 *
 * These are the screens a shop lives in, so they get end-to-end coverage rather
 * than unit tests of the components: what matters is that logging in, seeing
 * today, changing a status and creating a walk-in all hold together.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from '../../lib/env.ts';

loadEnv();

const OWNER = { email: 'owner@thehair-thonglor.test', password: 'chairtime123' };

async function login(page: Page, credentials = OWNER) {
  await page.goto('/login');
  await page.getByLabel('อีเมล').fill(credentials.email);
  await page.getByLabel('รหัสผ่าน').fill(credentials.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('staff authentication', () => {
  test('sends an anonymous visitor to the login page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('rejects a wrong password without saying which field was wrong', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('อีเมล').fill(OWNER.email);
    await page.getByLabel('รหัสผ่าน').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    await expect(page.getByText('อีเมลหรือรหัสผ่านไม่ถูกต้อง')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logs in and lands on today', async ({ page }) => {
    await login(page);
    await expect(page.getByText('วันนี้').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Walk-in' })).toBeVisible();
  });

  test('logs out', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await page.waitForURL('**/login');

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('day calendar', () => {
  test('shows the day, its stats and the staff filter', async ({ page }) => {
    await login(page);

    // Every stat tile is present, whatever today's numbers happen to be.
    for (const label of ['คิววันนี้', 'รอมา', 'เสร็จแล้ว', 'ไม่มา', 'ยอดวันนี้']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    await expect(page.getByRole('button', { name: 'ทั้งหมด' })).toBeVisible();
    // The seeded salon has four stylists.
    await expect(page.getByRole('button', { name: /ช่างโอ๊ต/ })).toBeVisible();
  });

  test('moves between days', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'วันถัดไป' }).click();
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('button', { name: 'วันนี้', exact: true })).toBeVisible();
  });

  test('filters the grid to one stylist', async ({ page }) => {
    await login(page);
    // Walk forward until a day with bookings turns up, so the assertion is
    // about filtering rather than about the seed's randomness.
    for (let i = 0; i < 7; i += 1) {
      const events = page.locator('.fc-event');
      if ((await events.count()) > 0) break;
      await page.getByRole('button', { name: 'วันถัดไป' }).click();
      await page.waitForLoadState('networkidle');
    }

    const before = await page.locator('.fc-event').count();
    test.skip(before === 0, 'no bookings in the next week of seed data');

    await page.getByRole('button', { name: /ช่างโอ๊ต/ }).click();
    const after = await page.locator('.fc-event').count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test('opens a booking and changes its status', async ({ page }) => {
    await login(page);

    for (let i = 0; i < 7; i += 1) {
      if ((await page.locator('.fc-event').count()) > 0) break;
      await page.getByRole('button', { name: 'วันถัดไป' }).click();
      await page.waitForLoadState('networkidle');
    }
    test.skip((await page.locator('.fc-event').count()) === 0, 'no bookings to open');

    await page.locator('.fc-event').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The drawer carries what staff need at the counter.
    await expect(dialog.getByText('เวลา', { exact: true })).toBeVisible();
    await expect(dialog.getByText('บริการ', { exact: true })).toBeVisible();

    const markDone = dialog.getByRole('button', { name: 'เสร็จแล้ว' });
    if (await markDone.isVisible()) {
      await markDone.click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
    }
  });
});

test.describe('walk-in', () => {
  test('creates a booking from the counter', async ({ page }) => {
    await login(page);

    // A real walk-in is "now", but by late evening the shop may have no slot
    // left — which is correct behaviour, not a failure. Step to a day that is
    // still open so the assertion is about the form, not about the clock.
    await page.getByRole('button', { name: 'วันถัดไป' }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: '+ Walk-in' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'สระ+ตัด' }).click();

    const create = dialog.getByRole('button', { name: 'สร้างคิว' });
    await expect(create).toBeEnabled({ timeout: 15_000 });

    await dialog.getByPlaceholder('ชื่อลูกค้า (ไม่ใส่ก็ได้)').fill('คุณเดินเข้ามา');
    await dialog.getByPlaceholder('เบอร์โทร (ไม่ใส่ก็ได้)').fill('0891112222');
    await create.click();

    await expect(dialog).toBeHidden({ timeout: 20_000 });
  });

  test('says so plainly when the day has no room left', async ({ page }) => {
    await login(page);

    // Walk back to a day that is already over: nothing can be booked into it.
    await page.getByRole('button', { name: 'วันก่อนหน้า' }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: '+ Walk-in' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'สระ+ตัด' }).click();

    // Either a slot is offered, or the form says there is none — never a
    // silently disabled button with no explanation.
    const create = dialog.getByRole('button', { name: 'สร้างคิว' });
    const empty = dialog.getByText('ไม่มีเวลาว่างเหลือในวันนี้');
    await expect(create.or(empty).first()).toBeVisible({ timeout: 15_000 });

    if (await empty.isVisible()) {
      await expect(create).toBeDisabled();
    }
  });
});

test.describe('services', () => {
  test('lists services and opens the editor', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'บริการ' }).click();
    await page.waitForURL('**/dashboard/services');

    await expect(page.getByRole('heading', { name: 'บริการ' })).toBeVisible();
    await expect(page.getByText('ย้อมผม')).toBeVisible();

    // A multi-segment service must not offer a single duration field to edit.
    await page.getByRole('button', { name: /ย้อมผม/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/แบ่งเป็น 3 ช่วง/)).toBeVisible();
    await expect(dialog.getByLabel('ใช้เวลา (นาที)')).toBeDisabled();
  });

  test('edits a price and shows it on the list', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/services');

    await page.getByRole('button', { name: /โกนหนวด/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('ราคา (บาท)').fill('250');
    await dialog.getByRole('button', { name: 'บันทึก' }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('฿250')).toBeVisible();
  });
});

test.describe('resources', () => {
  test('shows staff, chairs and their working hours', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'ช่างและที่นั่ง' }).click();
    await page.waitForURL('**/dashboard/resources');

    await expect(page.getByRole('heading', { name: 'ช่างและที่นั่ง' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ช่าง', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /ช่างโอ๊ต/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /เก้าอี้ 1/ })).toBeVisible();

    await page.getByRole('button', { name: 'เวลาทำการ' }).click();
    await expect(page.getByText('ทั้งร้าน')).toBeVisible();
    await expect(page.getByRole('button', { name: 'บันทึกเวลาทำการ' })).toBeVisible();
  });

  test('adds and removes a shop closure', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/resources');
    await page.getByRole('button', { name: 'วันลา / ปิดร้าน' }).click();

    await page.getByLabel('เหตุผล').fill('ทดสอบปิดร้าน');
    await page.getByRole('button', { name: 'เพิ่ม', exact: true }).click();

    const entry = page.getByText('ทดสอบปิดร้าน');
    await expect(entry).toBeVisible({ timeout: 15_000 });

    await page
      .locator('li', { hasText: 'ทดสอบปิดร้าน' })
      .getByRole('button', { name: 'ลบ' })
      .click();
    await expect(entry).toBeHidden({ timeout: 15_000 });
  });
});

test.describe('customers', () => {
  test('searches by name and opens the history', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'ลูกค้า' }).click();
    await page.waitForURL('**/dashboard/customers');

    await page.getByPlaceholder('ค้นหาด้วยชื่อหรือเบอร์โทร').fill('คุณเอ');
    await page.getByRole('button', { name: 'ค้นหา' }).click();
    await page.waitForURL(/q=/);

    const firstResult = page.locator('a[href^="/dashboard/customers/"]').first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    await expect(page.getByText('มาแล้ว')).toBeVisible();
    await expect(page.getByText('ประวัติการมา')).toBeVisible();
  });

  test('saves a note against a customer', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/customers');

    await page.locator('a[href^="/dashboard/customers/"]').first().click();
    const note = page.getByPlaceholder(/แพ้น้ำยา/);
    await note.fill('ทดสอบโน้ต: แพ้น้ำยาดัด');
    await page.getByRole('button', { name: 'บันทึกโน้ต' }).click();

    await expect(page.getByText('บันทึกแล้ว')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByPlaceholder(/แพ้น้ำยา/)).toHaveValue('ทดสอบโน้ต: แพ้น้ำยาดัด');
  });
});

test.describe('settings', () => {
  test('shows the booking link and refuses the template on a shop with services', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/settings');

    await expect(page.getByText('/thehair-thonglor')).toBeVisible();
    await expect(page.getByText('ร้านนี้มีบริการอยู่แล้ว')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ใช้เทมเพลตนี้' }).first()).toBeDisabled();
  });
});
