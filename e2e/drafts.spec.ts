import { expect, test } from "@playwright/test";
import { describeCompany, freshEmail, signUpByMagicLink, step } from "./helpers";

/**
 * Step 4 of /start with the local demo model (ORBIS_AI_PROVIDER=demo, refused
 * in production): the real pipeline (triage, guard, ledger, mailbox broker)
 * runs on template output, without any model call. Run with
 * `E2E_DEMO_MODEL=1 pnpm test:e2e`. See docs/product/e2e-start.md.
 */
const CRON_SECRET = process.env.E2E_CRON_SECRET ?? "local-cron-secret-change-me-0123456789abcdef";

test.skip(process.env.E2E_DEMO_MODEL !== "1", "needs the server started with ORBIS_AI_PROVIDER=demo (E2E_DEMO_MODEL=1)");

test("step 4 with the demo model: labelled drafts, test mode writes nothing to the mailbox", async ({ page }) => {
  await describeCompany(page, "MDK Peinture");
  await signUpByMagicLink(page, freshEmail("drafts"));
  await step(page, "Votre boîte mail").getByRole("button", { name: "Connecter Gmail" }).click();
  await page.waitForURL(/\/dev\/demo-mailbox\/connect/);
  await page.getByRole("button", { name: "Autoriser" }).click();
  await page.waitForURL(/\/start/);
  await expect(step(page, "Votre boîte mail")).toContainText("Gmail vérifié côté serveur");

  // The fake model is announced before anything runs.
  const drafts = step(page, "Vos premiers brouillons");
  await expect(drafts).toContainText("Modèle factice local.");
  await expect(drafts).toContainText("Mode test.");
  await drafts.getByRole("button", { name: "Préparer mes premiers brouillons" }).click();

  // The scheduler pass (what GitHub Actions calls every 5 min in production).
  await expect
    .poll(async () => {
      const res = await page.request.post("/api/cron/inbox", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
      expect(res.status()).toBe(200);
      return (await page.locator("body").innerText()).match(/brouillons? prêts? à relire/) !== null;
    }, { timeout: 120_000, intervals: [3_000] })
    .toBe(true);

  await expect(drafts).toContainText("Brouillon de démonstration : modèle factice local");
  // The relayed site form is set aside for review, never drafted.
  await expect(drafts.getByRole("region", { name: "À vérifier par vous" })).toBeVisible();

  // Test mode: simulated receipts only, nothing written into the mailbox.
  await page.goto("/dev/demo-mailbox");
  await expect(page.getByText(/0 brouillon créé par Orbis/)).toBeVisible();
});
