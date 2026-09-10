import { fail } from "@/lib/api/http";
export async function POST() {
  return fail(
    "Adaptateur OAuth non configuré. Aucun accès ni connexion n’a été créé.",
    501,
  );
}
