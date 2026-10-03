import type { Metadata } from "next";
import { authenticatedUser, authOptions } from "@/lib/platform/auth";
import { isOfflineMode } from "@/lib/platform/context";
import { StartFlow, type StartSession } from "./StartFlow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Démarrer — Orbis",
  description: "Votre site, votre compte, votre boîte mail : vos premiers brouillons de réponse, à relire.",
  robots: { index: false, follow: false },
};

/** Public page: step 1 needs no account. Later steps are enforced by session-only APIs. */
export default async function StartPage() {
  let session: StartSession = "anonymous";
  if (isOfflineMode()) session = "offline";
  else
    try {
      await authenticatedUser();
      session = "authenticated";
    } catch {
      session = "anonymous";
    }
  return <StartFlow session={session} authOptions={authOptions()} />;
}
