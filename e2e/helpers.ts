import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

/** A fresh address per test: the local stack keeps accounts between runs. */
export function freshEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@orbis.example`;
}

/** Latest magic link Supabase sent to `email`, read from the local Mailpit (never a real inbox). */
export async function magicLinkFor(email: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const id = (await search.json()).messages?.[0]?.ID as string | undefined;
    if (id) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const match = /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(message.HTML ?? "") ?? /(\S*\/auth\/v1\/verify\S*)/.exec(message.Text ?? "");
      if (match) return match[1].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No magic link for ${email} in Mailpit (${MAILPIT}). Is the local stack up (pnpm local:up)?`);
}

/**
 * Step 1 is rate limited per client (6 reads / 10 min, shared in Postgres).
 * Locally no proxy sets X-Forwarded-For, so give each test its own
 * documentation-range address (RFC 5737) instead of sharing "unknown".
 */
export async function asDistinctClient(page: Page) {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${octet()}.${octet()}` });
}

/** Step 1 through the description path: no site is fetched, nothing leaves the machine. */
export async function describeCompany(page: Page, name: string) {
  await asDistinctClient(page);
  await page.goto("/start");
  await page.getByRole("button", { name: "Je décris en deux phrases" }).click();
  await page.getByLabel("Nom de l’entreprise").fill(name);
  await page
    .getByLabel("Ce que vous faites, et pour qui")
    .fill("Peintre en bâtiment près de Lille. Nous peignons intérieurs et façades pour les particuliers et les syndics.");
  await page.getByRole("button", { name: "Préparer mon profil" }).click();
  await page.getByRole("button", { name: "C’est bien mon entreprise, continuer" }).click();
}

/** Step 2: sign up by magic link, opened in the same browser (PKCE). */
export async function signUpByMagicLink(page: Page, email: string) {
  await page.getByRole("button", { name: "Brancher ma boîte pour de vrai" }).click();
  await page.getByLabel("J’accepte les").check();
  await page.getByLabel("E-mail professionnel").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(await magicLinkFor(email));
  await page.waitForURL(/\/start$/);
  await expect(step(page, "Votre compte")).toContainText("Connecté");
}

/** One step of the /start list, by its heading. */
export function step(page: Page, heading: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: heading }) });
}
