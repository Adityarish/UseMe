import { expect, test } from "@playwright/test";

test("homepage remains usable on mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Share anything, instantly/i })).toBeVisible();
  const input = page.getByPlaceholder("your-custom-name");
  await input.fill(`mobile-${Date.now()}`);
  await expect(page.getByText(/Available — make it yours/i)).toBeVisible();
  await page.getByRole("button", { name: /Open \/ Continue/i }).click();
  await expect(page.getByRole("heading", { name: /mobile-/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish secure link/i })).toBeVisible();
});
