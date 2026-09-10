import { fail,ok } from "@/lib/api/http";
import { isLocalMutation } from "@/lib/api/local-request";
import { readCompanySite } from "@/lib/runtime/company-site";
import { z } from "zod";
export const runtime="nodejs";
let active=0;
export async function POST(request:Request){
 if(!isLocalMutation(request))return fail("Lecture disponible depuis l’espace local.",403);
 const parsed=z.object({website:z.string().trim().min(4).max(2000)}).safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return fail("Saisissez une adresse de site valide.");
 if(active>=2)return fail("Deux lectures sont déjà en cours. Réessayez dans quelques secondes.",429);
 active++;try{return ok(await readCompanySite(parsed.data.website));}catch{return fail("Impossible de lire ce site public. Vérifiez son adresse ou décrivez votre activité pour continuer.",422);}finally{active--;}
}
