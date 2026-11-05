import { expect, test } from "@playwright/test";
import { describeCompany, freshEmail, magicLinkFor, signUpByMagicLink, step } from "./helpers";

/**
 * /start golden path in a real browser, on the local stack (Supabase in Docker,
 * Mailpit, demo mailbox). Setup and limits: docs/product/e2e-start.md.
 */

test("description → magic link → Gmail (demo consent) → verified server-side; no model means no fake drafts", async ({ page }) => {
  await describeCompany(page, "MDK Peinture");

  // Instant preview: nothing is invented; every unanswered question stays « À confirmer ».
  const company = step(page, "Votre entreprise");
  await expect(company).toContainText("Profil de MDK Peinture confirmé.");
  await expect(company.getByText("À confirmer").first()).toBeVisible();
  await expect(company).not.toContainText("sur votre site");

  await signUpByMagicLink(page, freshEmail("gmail"));
  await expect(step(page, "Votre entreprise")).toContainText("MDK Peinture");
  // The session is real (counter-proof for the PKCE test below).
  expect((await page.request.get("/api/v1/inbox")).status()).toBe(200);

  // Step 3: the promise shown before any consent.
  const mailbox = step(page, "Votre boîte mail");
  await expect(mailbox).toContainText("Envoyer, transférer, supprimer ou déplacer un message.");
  await mailbox.getByRole("button", { name: "Connecter Gmail" }).click();

  // Demo consent page: clearly labelled fake, no real account.
  await page.waitForURL(/\/dev\/demo-mailbox\/connect\?account=ca_demo_/);
  await expect(page.getByText("Aucun compte réel n’est connecté.")).toBeVisible();
  await expect(page.getByText("Jamais envoyer, transférer ni supprimer")).toBeVisible();
  await page.getByRole("button", { name: "Autoriser" }).click();

  // Back on /start, the connection is re-verified by the server, not taken from the redirect.
  await page.waitForURL(/\/start/);
  await expect(step(page, "Votre boîte mail")).toContainText("Gmail vérifié côté serveur");

  // Step 4 with no AI model configured: an honest blocker, no button, no simulated draft.
  const drafts = step(page, "Vos premiers brouillons");
  await expect(drafts).toContainText("Aucun modèle d’IA n’est configuré.");
  await expect(drafts.getByRole("button", { name: "Préparer mes premiers brouillons" })).toHaveCount(0);

  // State lives on the server: a reload lands on the same step.
  await page.reload();
  await expect(step(page, "Votre boîte mail")).toContainText("Gmail vérifié côté serveur");
  await expect(step(page, "Vos premiers brouillons")).toHaveAttribute("aria-current", "step");

  // Nothing was written into the mailbox.
  await page.goto("/dev/demo-mailbox");
  await expect(page.getByText(/0 brouillon créé par Orbis/)).toBeVisible();
  await expect(page.getByText(/comptes connectés :.*gmail/)).toBeVisible();
  await expect(page.getByText("Aucun brouillon pour l’instant.")).toBeVisible();
});

test("refusing the Outlook consent leaves the mailbox unconnected", async ({ page }) => {
  await describeCompany(page, "Refus SARL");
  await signUpByMagicLink(page, freshEmail("refuse"));
  await step(page, "Votre boîte mail").getByRole("button", { name: "Connecter Outlook" }).click();
  await page.waitForURL(/\/dev\/demo-mailbox\/connect/);
  await page.getByRole("button", { name: "Refuser" }).click();
  await page.waitForURL(/\/start/);
  const mailbox = step(page, "Votre boîte mail");
  await expect(mailbox).toHaveAttribute("aria-current", "step");
  await expect(mailbox).not.toContainText("vérifié côté serveur");
  await expect(step(page, "Vos premiers brouillons")).not.toHaveAttribute("aria-current", "step");
});

test("a magic link opened in another browser does not open a session (PKCE)", async ({ page, browser }) => {
  const email = freshEmail("pkce");
  await describeCompany(page, "Autre Navigateur");
  await page.getByRole("button", { name: "Brancher ma boîte pour de vrai" }).click();
  await page.getByLabel("J’accepte les").check();
  await page.getByLabel("E-mail professionnel").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  const link = await magicLinkFor(email);

  const other = await browser.newContext();
  const intruder = await other.newPage();
  await intruder.goto(link);
  await intruder.waitForLoadState("networkidle");
  const response = await intruder.request.get("/api/v1/inbox");
  expect(response.status()).toBe(401);
  await other.close();
});

test("signed-out visitors cannot reach the inbox, the mailbox connection or the demo consent", async ({ request }) => {
  expect((await request.get("/api/v1/inbox")).status()).toBe(401);
  const consent = await request.post("/api/dev/demo-mailbox/consent", {
    form: { account: "ca_demo_abc", decision: "approve" },
    headers: { Origin: "http://127.0.0.1:3000" },
  });
  expect([401, 403]).toContain(consent.status());
});
