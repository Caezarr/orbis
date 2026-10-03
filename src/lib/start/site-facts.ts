import { injectionSignals } from "@/lib/runtime/inbox-replies";
import type { FactCategory, StartFact } from "./flow";
import type { Segment, SitePage } from "./site-page";

/*
 * Deterministic step-1 extractors, focused on French and Belgian small
 * businesses. Input: pages parsed by site-page.ts. Output: facts, each carrying
 * an exact quote (a verbatim substring of one visible segment, of the page
 * metadata, of a schema.org value or a link) and the URL of the page it comes
 * from. No model, no network. Nothing is inferred beyond what the quote says:
 * `value` is a span of the quote (or a normalised phone/ID read from it).
 */

export type ExtractedFact = StartFact & {
  category: FactCategory;
  value: string;
  confidence: "high" | "medium";
  via: "text" | "meta" | "structured" | "link";
  sourceUrl: string;
};

const MAX_QUOTE = 280;
const CAPS: Record<FactCategory, number> = {
  activity: 2,
  services: 10,
  zone: 4,
  prices: 4,
  delays: 3,
  hours: 2,
  contact: 4,
  address: 1,
  audience: 1,
  history: 2,
  certifications: 6,
  faq: 6,
  legal: 6,
  social: 6,
};
export const MAX_FACTS = 60;

// ------------------------------------------------------------------ quoting

/** "Tél.", "M.", "St." are not sentence ends. */
const ABBREVIATION = /(?:^|[\s(])(?:t[ée]l|tel|fax|m|mme|mlle|st|ste|av|bd|n|no|cf|etc|ex|env)$/i;

/** Verbatim span of `text` around [start, end): its sentence, windowed to `max` on word boundaries. */
export function quoteAround(text: string, start: number, end: number, max = MAX_QUOTE) {
  let s = 0;
  for (let i = start - 1; i > 0; i--)
    if (/[.!?]/.test(text[i]) && /\s/.test(text[i + 1] ?? "") && !ABBREVIATION.test(text.slice(Math.max(0, i - 6), i))) {
      s = i + 2;
      break;
    }
  let e = text.length;
  for (let i = end; i < text.length; i++)
    if (/[.!?]/.test(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
      e = i + 1;
      break;
    }
  // A list ordinal glued to its item ("3 Vous recevez le devis") is layout, not text.
  if (s < start) {
    const ordinal = /^\s*\d{1,2}\s+(?=\p{Lu})/u.exec(text.slice(s, start));
    if (ordinal) s += ordinal[0].length;
  }
  if (e - s <= max) return text.slice(s, e).trim();
  const room = Math.max(0, max - (end - start));
  let ws = Math.max(s, start - Math.floor(room / 2));
  let we = Math.min(e, ws + max);
  ws = Math.max(s, we - max);
  if (ws > s) {
    const sp = text.indexOf(" ", ws);
    if (sp !== -1 && sp < start) ws = sp + 1;
  }
  if (we < e) {
    const sp = text.lastIndexOf(" ", we);
    if (sp > end) we = sp;
  }
  return text.slice(ws, we).trim();
}

// ------------------------------------------------------------------ patterns

const L = "A-Za-zÀ-ÖØ-öø-ÿŒœ";
const UP = "A-ZÀ-ÖØ-ÞŒ";
/** A place name: "Lille", "Villeneuve-d'Ascq", "La Bassée", "Saint-Amand-les-Eaux", "Braine-l'Alleud". */
const PLACE = `(?:(?:La|Le|Les|L['’])\\s?)?[${UP}][${L}'’]+(?:-[${L}'’]+)*(?:\\s(?:sur|sous|en|lès|les|le|la|de|du)(?:[\\s-][${UP}][${L}'’-]+)+)?`;
const DAYS = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";
const MONTHS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const NOT_PLACE = new RegExp(`^(?:${DAYS}|${MONTHS}|A|Z|Noël|Pâques)$`, "i");

const ZONE_FROM_TO = new RegExp(`\\b[dD]e\\s+(${PLACE})\\s+(?:à|a|jusqu['’]à)\\s+(${PLACE})`, "gu");
const ZONE_UNTIL = new RegExp(`\\bjusqu['’](?:à|au|aux)\\s+(${PLACE})`, "gu");
const ZONE_RADIUS =
  /\b(?:dans un |sur un )?rayon (?:d['’]environ |de )?\d{1,3}\s?(?:km|kilomètres)\b|\b\d{1,3}\s?(?:km|kilomètres) (?:autour|alentour|aux alentours|à la ronde)[^.,;]{0,40}/giu;
const REGIONS =
  /\b(?:métropole (?:lilloise|lyonnaise|bordelaise|nantaise|toulousaine|rennaise|grenobloise|niçoise|rouennaise|européenne de Lille)|agglomération (?:de |d['’])[A-ZÀ-Ý][\p{L}'’-]+|Hauts-de-France|Île-de-France|Ile-de-France|Normandie|Bretagne|Occitanie|Nouvelle-Aquitaine|Grand Est|Auvergne-Rhône-Alpes|Provence-Alpes-Côte d['’]Azur|Pays de la Loire|Centre-Val de Loire|Bourgogne-Franche-Comté|Wallonie|Région bruxelloise|Bruxelles-Capitale|Brabant wallon|province (?:de |du )?(?:Hainaut|Namur|Liège|Luxembourg|Brabant wallon)|Hainaut|Flandre(?:-occidentale)?|Côte d['’]Opale|Flandre intérieure|Pévèle|Mélantois|Weppes|Avesnois|Cambrésis|Douaisis|Valenciennois|côté belge|toute la Belgique|toute la France|France entière|Benelux)\b/giu;
const DEPARTMENTS =
  /\b(?:Nord|Pas-de-Calais|Somme|Aisne|Oise|Paris|Seine-et-Marne|Yvelines|Essonne|Hauts-de-Seine|Seine-Saint-Denis|Val-de-Marne|Val-d['’]Oise|Rhône|Gironde|Haute-Garonne|Bouches-du-Rhône|Loire-Atlantique|Ille-et-Vilaine|Isère|Alpes-Maritimes|Hérault|Var|Bas-Rhin|Haut-Rhin|Moselle|Marne|Ardennes|Seine-Maritime|Calvados|Finistère|Morbihan|[\p{Lu}][\p{L}-]+)\s\((\d{2}|2A|2B|97\d)\)|\bdépartements?\s(?:du |de la |des |de l['’])?(?:\d{2}\b|[\p{Lu}][\p{L}-]+(?:\s(?:et|,)\s(?:du |de la |de l['’])?[\p{Lu}][\p{L}-]+)*)/gu;
const ZONE_TRIGGER =
  /\b(?:zones? d['’]intervention|secteurs? d['’]intervention|nous intervenons|j['’]interviens|on intervient|intervient|intervention (?:sur|dans)|interventions? (?:sur|dans)|nous nous déplaçons|je me déplace|déplacements? (?:gratuits?|offerts?)|communes? desservies|villes? desservies|nous desservons|dans toute? la|dans tout le|sur toute? la|sur tout le|dans un rayon|aux alentours de|environs de|basée? à|situés? à|installée? à)\b/iu;
const ZONE_HEADING = /o[uù] (?:j['’]interviens|nous intervenons|intervenons-nous|intervenir)|zones?\s+(?:d['’]intervention|desservies?)|secteurs?|communes?\s+desservies|villes?\s+desservies|périmètre/i;

const PHONE_CANDIDATE = /(?:(?:\+|00)(?:33|32)[\s.]?(?:\(0\)[\s.]?)?|\b0)[1-9](?:[\s./-]?\d){7,8}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_CONTEXT = /t[ée]l(?:[ée]phone)?\b|portable|mobile|fixe|gsm|appel|joindre|contact|☎|📞/i;
const STREET =
  /\b\d{1,4}(?:\s?(?:bis|ter|[a-dA-D]))?,?\s(?:rue|avenue|av\.|boulevard|bd|chemin|place|route|impasse|allée|allee|quai|chaussée|chaussee|cours|faubourg|square|résidence|lotissement|parc|voie|sentier|clos|hameau|lieu-dit|drève|rond-point|zone|ZI|ZA|ZAC)\s[^,\n]{2,60}|\b(?:rue|avenue|chaussée|place|boulevard|chemin|route|drève|square|quai|allée)\s(?:[^,\n\d]{2,50})\s\d{1,4}[a-z]?\b/iu;
const POSTAL_CITY = new RegExp(`(?:^|\\s|,)(?:F-|B-|FR-|BE-)?(\\d{5}|[1-9]\\d{3})\\s+(${PLACE})`, "u");
const HOURS_TIME = /\b\d{1,2}\s?(?:h|H|:)\s?\d{0,2}\b/;
const HOURS_DAY = new RegExp(`\\b(?:${DAYS})s?\\b`, "i");
const HOURS_ALWAYS = /\b24\s?h?\s?\/\s?24\b|\b7\s?j(?:ours)?\s?\/\s?7\b|\b7 jours sur 7\b/i;
const MONEY =
  /(?:(?:à partir de|dès|de|entre|environ|forfait(?: de)?)\s+)?\d{1,3}(?:[\s. ]\d{3})*(?:,\d{1,2})?\s?(?:€|euros?\b|EUR\b)(?:\s?(?:HT|TTC))?(?:\s?(?:\/|par)\s?(?:m²|m2|ml|m\b|h\b|heure|jour|mois|an|pièce|personne|séance|unité|intervention|nuit))?|€\s?\d{1,3}(?:[\s.]\d{3})*(?:,\d{1,2})?/giu;
const MONEY_EXCLUDE = /capital|amende|pénalit|indemnité forfaitaire|frais de recouvrement|médiat/i;
const FREE_QUOTE =
  /\bdevis\b[^.!?]{0,40}\b(?:gratuits?|offerts?)\b(?:[^.!?]{0,20}sans engagement)?|\b(?:gratuits?|offerts?)\b[^.!?]{0,25}\bdevis\b|\b(?:gratuit|devis)[^.!?]{0,15}sans engagement\b|\bestimation gratuite\b/iu;
const PRICE_WORDS = /\btarifs?\b|\bprix\b|\bà partir de\b|\bforfaits?\b/i;
const DELAY =
  /\b(?:sous|en|dans les|dans un délai de|délai(?: moyen)? de|d['’]ici|en moins de|réponse sous|rappel sous|intervention sous)\s+(?:\d{1,3}|vingt-quatre|quarante-huit|une?|deux|trois|quatre|cinq|huit|dix|quinze)\s?(?:h\b|heures?|jours?(?: ouvrés| ouvrables)?|j\b|semaines?|mois)\b|\bdélais?\b[^.!?]{0,30}?\b\d{1,3}\s?(?:h\b|heures?|jours?|semaines?|mois)\b|\ble jour même\b|\bdans la journée\b|\bintervention(?:s)? rapides?\b|\bréponse rapide\b|\ben urgence\b|\burgences?\b|\bdélais? (?:courts?|rapides?|respectés?|maîtrisés?)\b|\bdisponible dès\b|\bsans délai\b/iu;

const CERTIFICATIONS: [RegExp, string][] = [
  [/\bRGE\b|Reconnu Garant de l['’]Environnement/i, "RGE"],
  [/\bQualibat\b/i, "Qualibat"],
  [/\bQualifelec\b/i, "Qualifelec"],
  [/\bQualiPAC\b/i, "QualiPAC"],
  [/\bQualiSol\b/i, "QualiSol"],
  [/\bQualiBois\b/i, "QualiBois"],
  [/\bQualiPV\b/i, "QualiPV"],
  [/\bQualit['’]?EnR\b/i, "Qualit’EnR"],
  [/\bQualigaz\b/i, "Qualigaz"],
  [/\bHandibat\b/i, "Handibat"],
  [/\bÉco ?Artisan\b|\bEco ?Artisan\b/i, "Éco Artisan"],
  [/\bMaître artisan\b/i, "Maître artisan"],
  [/\bArtisan d['’]art\b/i, "Artisan d’art"],
  [/\bMeilleur Ouvrier de France\b|\bM\.?O\.?F\.?\b(?=[^a-z])/u, "Meilleur Ouvrier de France"],
  [/\bCompagnons? du Devoir\b/i, "Compagnons du Devoir"],
  [/\b(?:assurance|garantie)\s+(?:responsabilité\s+civile\s+)?décennale\b|\bdécennale\b/i, "Assurance décennale"],
  [/\bresponsabilité civile (?:professionnelle|pro)\b|\bRC Pro\b/i, "Responsabilité civile professionnelle"],
  [/\bQualiopi\b/i, "Qualiopi"],
  [/\bISO\s?(?:9001|14001|45001|27001)\b/i, "ISO"],
  [/\bCertibiocide\b/i, "Certibiocide"],
  [/\bAFNOR\b|\bNF Service\b/i, "NF / AFNOR"],
  [/\bAccès à la profession\b/i, "Accès à la profession"],
  [/\bVCA\b/, "VCA"],
  [/\bentrepreneur agréé\b|\bagréation\b/i, "Entrepreneur agréé"],
  [/\bGarantie de parfait achèvement\b/i, "Garantie de parfait achèvement"],
  [/\bOrdre des (?:architectes|experts-comptables|avocats|médecins|vétérinaires|géomètres)\b/i, "Inscrit à l’Ordre"],
];
const LEGAL_FORM =
  /\b(SARL|SASU|SAS|EURL|SNC|SCI|SCOP|SELARL|SELAS|EIRL|SRL|SPRL|SCRL|SComm|ASBL|SA|EI)\b(?=[^.]{0,60}(?:capital|RCS|immatricul|siège|SIRE[NT]|TVA|BCE|société|entreprise))|\b(?:micro-entreprise|micro-entrepreneur|auto-entrepreneur|entreprise individuelle|société à responsabilité limitée|société par actions simplifiée)\b/u;
const AUDIENCE_WORDS =
  /\b(particuliers|professionnels|entreprises|copropriétés|syndics?(?: de copropriété)?|collectivités|bailleurs(?: sociaux)?|commerçants|artisans|indépendants|TPE|PME|agences immobilières|architectes|promoteurs|administrations|associations|restaurants|hôtels)\b/giu;
const AUDIENCE_CONTEXT = /\b(?:pour (?:les |des )?|chez (?:les|des)\b|auprès (?:des|de)\b|clients?\b|clientèle\b|travaill|accompagn|destin|au service (?:des|de)\b|aussi bien|que pour)/i;
const HISTORY =
  /\bdepuis (?:plus de |près de |presque )?\d{1,3} ans\b|\bdepuis (?:19|20)\d{2}\b|\b(?:fondée?|créée?|établie?|implantée?|installée?|lancée?) (?:en|depuis) (?:19|20)\d{2}\b|\b\d{1,3} ans d['’](?:expérience|existence|expertise|activité)\b|\bplus de \d{1,3} ans\b[^.]{0,30}\b(?:expérience|métier|savoir-faire)\b|\bdepuis (?:trois|quatre|cinq|deux) générations\b/iu;
const SERVICE_HEADING =
  /\b(?:services?|prestations?|nos métiers|mes métiers|savoir-faire|nos activités|domaines? d['’]intervention|expertises?|ce que (?:nous faisons|je fais)|nos offres|offres|travaux|solutions|spécialités)\b/i;
const FAQ_HEADING = /\bfaq\b|questions?(?: fréquentes| les plus posées| courantes)?|vos questions/i;
const SOCIAL: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(?:x|twitter)\.com$/, "X (Twitter)"],
  [/(^|\.)pinterest\.[a-z.]+$/, "Pinterest"],
  [/(^|\.)houzz\.[a-z.]+$/, "Houzz"],
  [/(^|\.)trustpilot\.com$/, "Trustpilot"],
  [/(^|\.)g\.page$|^maps\.google\.[a-z.]+$|^(?:www\.)?google\.[a-z.]+$|^goo\.gl$|^maps\.app\.goo\.gl$/, "Fiche Google"],
];
const PLACEHOLDER_TEXT = /(?:^|\s|:)à (?:compléter|renseigner|définir|venir)\b|\blorem ipsum\b|\bXXX+\b|\[(?:nom|adresse|numéro|ville)[^\]]*\]/i;
const SHARE_LINK = /sharer|share\?|intent\/tweet|shareArticle|\/plugins\//i;

/** schema.org business types → French activity label (value only; the quote is the type). */
const SCHEMA_TYPES: Record<string, string> = {
  HousePainter: "Peintre en bâtiment",
  Plumber: "Plombier",
  Electrician: "Électricien",
  RoofingContractor: "Couvreur",
  GeneralContractor: "Entreprise générale du bâtiment",
  HVACBusiness: "Chauffage, ventilation, climatisation",
  Locksmith: "Serrurier",
  MovingCompany: "Déménageur",
  HomeAndConstructionBusiness: "Bâtiment et habitat",
  AutoRepair: "Garage automobile",
  Bakery: "Boulangerie",
  Restaurant: "Restaurant",
  BeautySalon: "Institut de beauté",
  HairSalon: "Salon de coiffure",
  Dentist: "Cabinet dentaire",
  AccountingService: "Expertise comptable",
  LegalService: "Services juridiques",
  Attorney: "Avocat",
  Notary: "Notaire",
  RealEstateAgent: "Agence immobilière",
  InsuranceAgency: "Agence d’assurance",
  ProfessionalService: "Services aux professionnels",
  Florist: "Fleuriste",
  Store: "Commerce",
  LodgingBusiness: "Hébergement",
  ChildCare: "Garde d’enfants",
  CleaningService: "Nettoyage",
  Landscaper: "Paysagiste",
};
const DAY_FR: Record<string, string> = {
  Monday: "lundi",
  Tuesday: "mardi",
  Wednesday: "mercredi",
  Thursday: "jeudi",
  Friday: "vendredi",
  Saturday: "samedi",
  Sunday: "dimanche",
};
const BUSINESS_HINT = /Business|Organization|Organisation|Contractor|Service|Store|Painter|Plumber|Electrician|Locksmith|Agent|Agency|Restaurant|Salon|Repair|Dentist|Attorney|Notary|Bakery|Florist|Company/;

// ------------------------------------------------------------------ helpers

const digits = (s: string) => s.replace(/\D/g, "");
export function luhn(num: string) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return num.length > 0 && sum % 10 === 0;
}
/** Belgian enterprise / VAT number (10 digits, mod 97). */
export function belgianNumberValid(raw: string) {
  const d = digits(raw).padStart(10, "0");
  if (d.length !== 10 || !/^[01]/.test(d)) return false;
  return 97 - (Number(d.slice(0, 8)) % 97) === Number(d.slice(8));
}
/** French VAT key: (12 + 3 × (SIREN mod 97)) mod 97. */
export function frenchVatValid(raw: string) {
  const m = raw.replace(/\s/g, "").match(/^FR(\d{2})(\d{9})$/i);
  if (!m) return false;
  return luhn(m[2]) && Number(m[1]) === (12 + 3 * (Number(m[2]) % 97)) % 97;
}
/** "07 87 30 74 73" / "+32 475 12 34 56": FR (10 digits) or BE (9-10 digits) national formats. */
export function phoneValid(raw: string) {
  let d = digits(raw);
  if (/^00/.test(d)) d = d.slice(2);
  if (/^33/.test(d) && raw.trim().match(/^(\+|00)/)) return d.replace(/^330?/, "").length === 9;
  if (/^32/.test(d) && raw.trim().match(/^(\+|00)/)) {
    const n = d.replace(/^320?/, "");
    return n.length === 8 || (n.length === 9 && n.startsWith("4"));
  }
  return d.startsWith("0") && (d.length === 10 || (d.length === 9 && !d.startsWith("00")));
}
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const typesOf = (o: Record<string, unknown>) => arr(o["@type"]).map(String);
const safeStr = (v: unknown) => {
  const s = str(v);
  return s && !injectionSignals(s).length ? s.slice(0, 600) : "";
};

const sentence = (q: string) => /[.!?…]$/.test(q) && q.split(" ").length >= 3;
/** A full sentence beats a button label; among fragments, the longer one wins. */
const betterQuote = (next: string, prev: string) => !sentence(prev) && (sentence(next) || next.length > prev.length);

function dedupeKey(label: string, value: string) {
  if (label === "Téléphone") {
    let d = digits(value);
    if (/^00/.test(d)) d = d.slice(2);
    if (/^3[23]/.test(d) && d.length >= 11) d = `0${d.slice(2).replace(/^0/, "")}`;
    return `tel${d}`;
  }
  if (label === "SIRET" || label === "SIREN" || label === "N° de TVA") return `${label}${digits(value)}`;
  return value.toLowerCase().replace(/[\s.’'-]/g, "");
}

class FactSet {
  facts: ExtractedFact[] = [];
  private keys = new Set<string>();
  private counts = new Map<FactCategory, number>();
  add(f: Omit<ExtractedFact, "id">) {
    if (this.facts.length >= MAX_FACTS) return false;
    const quote = f.quote.trim().slice(0, 600);
    const value = f.value.trim().slice(0, 300);
    if (quote.length < 2 || !value) return false;
    const key = `${f.category}|${dedupeKey(f.label, value)}`;
    const qkey = `${f.category}|${f.label}|q|${quote.toLowerCase()}`;
    if (this.keys.has(key) || this.keys.has(qkey)) {
      // Same fact seen again: keep the more explicit quote (a sentence beats a button label).
      const prev = this.facts.find((p) => `${p.category}|${dedupeKey(p.label, p.value)}` === key);
      if (prev && prev.via !== "structured" && f.via !== "structured" && quote.length <= 220 && betterQuote(quote, prev.quote)) {
        prev.quote = quote;
        prev.sourceUrl = f.sourceUrl;
        prev.via = f.via;
      }
      return false;
    }
    if ((this.counts.get(f.category) ?? 0) >= CAPS[f.category]) return false;
    this.keys.add(key);
    this.keys.add(qkey);
    this.counts.set(f.category, (this.counts.get(f.category) ?? 0) + 1);
    this.facts.push({ ...f, quote, value, id: `f${this.facts.length + 1}` });
    return true;
  }
  has(category: FactCategory) {
    return (this.counts.get(category) ?? 0) > 0;
  }
}

type Seg = Segment & { url: string; i: number; all: Segment[] };

// ------------------------------------------------------------------ structured data

function fromJsonLd(page: SitePage, out: FactSet, meta: { name?: string; description?: string }) {
  const url = page.url;
  const add = (category: FactCategory, label: string, value: string, quote: string, confidence: "high" | "medium" = "high") =>
    value && quote && out.add({ category, label, value, quote, sourceUrl: url, confidence, via: "structured" });
  for (const node of page.jsonLd) {
    const types = typesOf(node);
    if (types.includes("FAQPage")) {
      for (const q of arr(node.mainEntity).slice(0, 10)) {
        const o = q as Record<string, unknown>;
        const question = safeStr(o?.name);
        const answer = safeStr((o?.acceptedAnswer as Record<string, unknown>)?.text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        if (question && answer && /\?\s*$/.test(question)) add("faq", "Question du site", question.slice(0, 200), answer.slice(0, MAX_QUOTE));
      }
      continue;
    }
    if (types.includes("Service") || types.includes("Offer")) {
      const name = safeStr(node.name) || safeStr((node.itemOffered as Record<string, unknown>)?.name);
      if (name) add("services", "Prestation", name.slice(0, 120), safeStr(node.description).slice(0, MAX_QUOTE) || name);
      continue;
    }
    const business = types.some((t) => BUSINESS_HINT.test(t) || t in SCHEMA_TYPES) || "address" in node || "telephone" in node;
    if (!business) continue;
    meta.name ??= safeStr(node.name) || undefined;
    meta.description ??= safeStr(node.description) || undefined;
    for (const t of types) if (SCHEMA_TYPES[t]) add("activity", "Type d’activité déclaré", SCHEMA_TYPES[t], `schema.org : ${t}`);
    const phone = safeStr(node.telephone);
    if (phone && phoneValid(phone)) add("contact", "Téléphone", phone, phone);
    const email = safeStr(node.email).replace(/^mailto:/i, "");
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) add("contact", "E-mail", email, email);
    for (const a of arr(node.address).slice(0, 1)) {
      const o = a as Record<string, unknown>;
      const line =
        typeof a === "string"
          ? safeStr(a)
          : [safeStr(o.streetAddress), [safeStr(o.postalCode), safeStr(o.addressLocality)].filter(Boolean).join(" "), safeStr(o.addressCountry)]
              .filter(Boolean)
              .join(", ");
      if (line.length > 5) add("address", "Adresse", line, line);
    }
    const areas = arr(node.areaServed)
      .map((a) => (typeof a === "string" ? safeStr(a) : safeStr((a as Record<string, unknown>)?.name)))
      .filter(Boolean)
      .slice(0, 20);
    if (areas.length) add("zone", "Zone desservie (données du site)", areas.join(", ").slice(0, 300), areas.join(", "));
    // value in French, quote as declared (schema.org day names).
    const hours = arr(node.openingHours).map(safeStr).filter(Boolean);
    const hoursFr = [...hours];
    for (const spec of arr(node.openingHoursSpecification).slice(0, 7)) {
      const o = spec as Record<string, unknown>;
      const raw = arr(o?.dayOfWeek).map((d) => String(d).replace(/^https?:\/\/schema\.org\//, ""));
      if (!raw.length || !o.opens || !o.closes) continue;
      hours.push(`${raw.join(", ")} ${str(o.opens)}-${str(o.closes)}`);
      hoursFr.push(`${raw.map((d) => DAY_FR[d] ?? d).join(", ")} ${str(o.opens)}-${str(o.closes)}`);
    }
    if (hours.length) add("hours", "Horaires", hoursFr.join(" ; ").slice(0, 300), hours.join(" ; "));
    const founded = safeStr(node.foundingDate);
    if (/^(19|20)\d{2}/.test(founded)) add("history", "Date de création", `Créée en ${founded.slice(0, 4)}`, `foundingDate : ${founded}`);
    const legalName = safeStr(node.legalName);
    if (legalName) {
      const form = legalName.match(LEGAL_FORM);
      add("legal", "Raison sociale", legalName, legalName);
      if (form) add("legal", "Forme juridique", form[1] ?? form[0], legalName);
    }
    const vat = safeStr(node.vatID).replace(/\s/g, "");
    if (frenchVatValid(vat)) add("legal", "N° de TVA", vat, safeStr(node.vatID));
    else if (/^BE/i.test(vat) && belgianNumberValid(vat.slice(2))) add("legal", "N° de TVA", vat, safeStr(node.vatID));
    const tax = safeStr(node.taxID);
    const td = digits(tax);
    if (td.length === 14 && luhn(td)) add("legal", "SIRET", tax, tax);
    else if (td.length === 9 && luhn(td)) add("legal", "SIREN", tax, tax);
    else if (td.length === 10 && belgianNumberValid(td)) add("legal", "N° d’entreprise (BCE)", tax, tax);
    const priceRange = safeStr(node.priceRange);
    if (priceRange && /\d/.test(priceRange)) add("prices", "Gamme de prix", priceRange, priceRange);
    const rating = node.aggregateRating as Record<string, unknown> | undefined;
    if (rating && (rating.ratingValue || rating.reviewCount)) {
      const q = `ratingValue : ${str(String(rating.ratingValue ?? ""))}, reviewCount : ${str(String(rating.reviewCount ?? rating.ratingCount ?? ""))}`;
      add("social", "Note moyenne déclarée", `${rating.ratingValue ?? "?"}/5 (${rating.reviewCount ?? rating.ratingCount ?? "?"} avis)`, q, "medium");
    }
    for (const s of arr(node.sameAs).map(safeStr).filter(Boolean)) socialLink(s, url, out, "structured");
    for (const offer of [...arr(node.makesOffer), ...arr((node.hasOfferCatalog as Record<string, unknown>)?.itemListElement)].slice(0, 12)) {
      const o = offer as Record<string, unknown>;
      const name = safeStr(o?.name) || safeStr((o?.itemOffered as Record<string, unknown>)?.name);
      if (name) add("services", "Prestation", name.slice(0, 120), name);
    }
    for (const k of arr(node.knowsAbout).map(safeStr).filter(Boolean).slice(0, 8)) add("services", "Prestation", k.slice(0, 120), k, "medium");
  }
}

function socialLink(href: string, pageUrl: string, out: FactSet, via: "link" | "structured") {
  try {
    const u = new URL(href);
    if (u.protocol !== "https:" && u.protocol !== "http:") return;
    if (SHARE_LINK.test(u.href)) return;
    const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
    for (const [re, label] of SOCIAL) {
      if (!re.test(host)) continue;
      if (label === "Fiche Google" && !/maps|g\.page|goo\.gl|cid=|\/maps/.test(u.href)) return;
      if (label !== "Fiche Google" && u.pathname.replace(/\/$/, "").length < 2) return;
      // The value is what the owner recognises: the profile path, not the network name again.
      const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
      const value = label === "Fiche Google" ? "Lien vers votre fiche trouvé sur le site" : `${host}${path}`.slice(0, 80);
      out.add({ category: "social", label, value, quote: u.href, sourceUrl: pageUrl, confidence: "high", via });
      return;
    }
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ text extractors

function zone(seg: Seg, out: FactSet) {
  const t = seg.text;
  const parts: { v: string; at: number; end: number; strong: boolean }[] = [];
  for (const m of t.matchAll(ZONE_FROM_TO)) {
    if (NOT_PLACE.test(m[1]) || NOT_PLACE.test(m[2]) || m[1].length < 3 || m[2].length < 3) continue;
    parts.push({ v: m[0].replace(/^D/, "d"), at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, strong: true });
  }
  for (const m of t.matchAll(ZONE_UNTIL)) {
    if (NOT_PLACE.test(m[1])) continue;
    const at = m.index ?? 0;
    if (parts.some((p) => at >= p.at && at < p.end)) continue;
    parts.push({ v: m[0], at, end: at + m[0].length, strong: false });
  }
  for (const re of [ZONE_RADIUS, REGIONS, DEPARTMENTS])
    for (const m of t.matchAll(re)) parts.push({ v: m[0].trim(), at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, strong: re !== REGIONS || /métropole|agglomération/i.test(m[0]) });
  const trigger = ZONE_TRIGGER.test(t);
  const headed = seg.path.some((h) => ZONE_HEADING.test(h));
  const strong = parts.some((p) => p.strong);
  // A lone "jusqu'à <Mot>" or region needs a zone wording or a zone section around it.
  if (!strong && !(parts.length && (trigger || headed))) {
    if (!(headed && seg.tag !== "h2" && new RegExp(`${PLACE}\\s?,\\s?${PLACE}`, "u").test(t))) return;
    out.add({ category: "zone", label: "Zone d’intervention", value: t.slice(0, 200), quote: quoteAround(t, 0, Math.min(t.length, 40)), sourceUrl: seg.url, confidence: "medium", via: seg.tag === "meta" ? "meta" : "text" });
    return;
  }
  parts.sort((a, b) => a.at - b.at);
  const first = parts[0];
  const last = parts[parts.length - 1];
  const quote = quoteAround(t, first.at, Math.min(last.end, first.at + MAX_QUOTE - 40));
  const value = [...new Set(parts.map((p) => p.v))].join(", ");
  out.add({ category: "zone", label: "Zone d’intervention", value, quote, sourceUrl: seg.url, confidence: strong || trigger ? "high" : "medium", via: seg.tag === "meta" ? "meta" : "text" });
}

function contact(seg: Seg, out: FactSet) {
  const t = seg.text;
  for (const m of t.matchAll(PHONE_CANDIDATE)) {
    if (!phoneValid(m[0])) continue;
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 40), at);
    if (/sire[nt]|tva|rcs|bce|capital|fax|télécopie|n°\s*$/i.test(before)) continue;
    out.add({
      category: "contact",
      label: "Téléphone",
      value: m[0].trim(),
      quote: seg.nav ? m[0].trim() : quoteAround(t, at, at + m[0].length, 160),
      sourceUrl: seg.url,
      confidence: PHONE_CONTEXT.test(t) || t.length < 30 || seg.nav ? "high" : "medium",
      via: "text",
    });
  }
  for (const m of t.matchAll(EMAIL)) {
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(m[0]) || /sentry|wixpress|example\.|exemple\.|domain\.|votre-?email|nom@/i.test(m[0])) continue;
    out.add({ category: "contact", label: "E-mail", value: m[0], quote: quoteAround(t, m.index ?? 0, (m.index ?? 0) + m[0].length, 160), sourceUrl: seg.url, confidence: "high", via: "text" });
  }
}

/** End of "… 59251 Allennes-les-Marais" after a street match. */
function addressEnd(t: string, at: number) {
  const m = POSTAL_CITY.exec(t.slice(at));
  return m ? at + (m.index ?? 0) + m[0].length : Math.min(t.length, at + 120);
}
const THIRD_PARTY =
  /h[ée]berg|hosting|\b(?:OVH|o2switch|IONOS|1&1|Hostinger|Gandi|Wix|Squarespace|Vercel|Netlify|Amazon Web Services|Google (?:LLC|Ireland)|Shopify|WordPress\.com|Infomaniak|Scaleway|Combell|One\.com)\b|conception (?:du site|graphique)|réalisation du site|site (?:réalisé|conçu|créé) par|webdesign|agence web|crédits/i;
function thirdParty(seg: Seg) {
  return THIRD_PARTY.test(seg.text) || seg.path.some((h) => THIRD_PARTY.test(h));
}

function address(seg: Seg, out: FactSet) {
  if (out.has("address")) return;
  const t = seg.text;
  const street = t.match(STREET);
  if (street && POSTAL_CITY.test(t)) {
    const at = street.index ?? 0;
    out.add({ category: "address", label: "Adresse", value: t.slice(at, addressEnd(t, at)).trim(), quote: quoteAround(t, at, at + street[0].length, 200), sourceUrl: seg.url, confidence: "high", via: "text" });
    return;
  }
  // Street and "59251 Ville" in two consecutive blocks (an <address> with <br>).
  const next = seg.all[seg.i + 1]?.text ?? "";
  if (street && t.length <= 90 && POSTAL_CITY.test(next) && next.length <= 90 && /^(?:F-|B-)?\d{4,5}\s/.test(next)) {
    out.add({ category: "address", label: "Adresse", value: `${t}, ${next}`, quote: `${t} ${next}`, sourceUrl: seg.url, confidence: "high", via: "text" });
  }
}

function hours(seg: Seg, out: FactSet) {
  const t = seg.text;
  const headed = seg.path.some((h) => /horaires?|heures d['’]ouverture|ouverture/i.test(h));
  const dayTime = HOURS_DAY.test(t) && HOURS_TIME.test(t);
  const always = HOURS_ALWAYS.exec(t);
  if (!(dayTime || always || (headed && (HOURS_TIME.test(t) || /fermé|sur rendez-vous|sur rdv/i.test(t))))) return;
  if (t.length > 400 && !dayTime) return;
  const m = (dayTime ? HOURS_DAY.exec(t) : always) ?? HOURS_TIME.exec(t);
  const at = m?.index ?? 0;
  const quote = quoteAround(t, at, at + (m?.[0].length ?? 1), 200);
  out.add({ category: "hours", label: "Horaires", value: quote.slice(0, 160), quote, sourceUrl: seg.url, confidence: dayTime ? "high" : "medium", via: "text" });
}

function prices(seg: Seg, out: FactSet) {
  const t = seg.text;
  const free = FREE_QUOTE.exec(t);
  if (free) {
    const value = /sans engagement/i.test(free[0]) ? "Devis gratuit et sans engagement" : "Devis gratuit";
    out.add({ category: "prices", label: "Devis", value, quote: quoteAround(t, free.index, free.index + free[0].length, 200), sourceUrl: seg.url, confidence: "high", via: seg.tag === "meta" ? "meta" : "text" });
  }
  if (MONEY_EXCLUDE.test(t)) return;
  for (const m of t.matchAll(MONEY)) {
    if (!/\d/.test(m[0])) continue;
    const at = m.index ?? 0;
    out.add({
      category: "prices",
      label: "Prix indiqué",
      value: m[0].trim(),
      quote: quoteAround(t, at, at + m[0].length, 220),
      sourceUrl: seg.url,
      confidence: PRICE_WORDS.test(t) || /\/|par/.test(m[0]) ? "high" : "medium",
      via: seg.tag === "meta" ? "meta" : "text",
    });
  }
}

function delays(seg: Seg, out: FactSet) {
  const t = seg.text;
  if (/cookie|conserv|données personnelles|rétractation|paiement à|facture/i.test(t)) return;
  const m = DELAY.exec(t);
  if (!m) return;
  out.add({ category: "delays", label: "Délais", value: m[0], quote: quoteAround(t, m.index, m.index + m[0].length, 200), sourceUrl: seg.url, confidence: /\d|jour même|journée/.test(m[0]) ? "high" : "medium", via: "text" });
}

function certifications(seg: Seg, out: FactSet) {
  const t = seg.text;
  for (const [re, label] of CERTIFICATIONS) {
    const m = re.exec(t);
    if (!m) continue;
    out.add({ category: "certifications", label: "Assurance, label ou certification", value: label, quote: quoteAround(t, m.index, m.index + m[0].length, 200), sourceUrl: seg.url, confidence: "high", via: "text" });
  }
}

function legal(seg: Seg, out: FactSet) {
  const t = seg.text;
  const push = (label: string, value: string, at: number, len: number) =>
    out.add({ category: "legal", label, value, quote: quoteAround(t, at, at + len, 200), sourceUrl: seg.url, confidence: "high", via: "text" });
  for (const m of t.matchAll(/\b\d{3}\s?\d{3}\s?\d{3}\s?\d{5}\b/g))
    if (luhn(digits(m[0]))) push("SIRET", m[0], m.index ?? 0, m[0].length);
  for (const m of t.matchAll(/\b(?:SIREN|RCS|R\.C\.S\.|Siren|N° SIREN)[^\d]{0,25}(\d{3}\s?\d{3}\s?\d{3})\b(?!\s?\d)/g))
    if (luhn(digits(m[1]))) push("SIREN", m[1], m.index ?? 0, m[0].length);
  for (const m of t.matchAll(/\bFR\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/g))
    if (frenchVatValid(m[0])) push("N° de TVA", m[0].replace(/\s/g, ""), m.index ?? 0, m[0].length);
  for (const m of t.matchAll(/\bBE\s?[01]\d{3}[.\s]?\d{3}[.\s]?\d{3}\b/g))
    if (belgianNumberValid(m[0].slice(2))) push("N° de TVA", m[0], m.index ?? 0, m[0].length);
  for (const m of t.matchAll(/\b(?:BCE|numéro d['’]entreprise|n° d['’]entreprise|N° entreprise)\s*:?\s*([01]\d{3}[.\s]?\d{3}[.\s]?\d{3})\b/gi))
    if (belgianNumberValid(m[1])) push("N° d’entreprise (BCE)", m[1], m.index ?? 0, m[0].length);
  const rcs = /\bRCS\s(?:de\s)?([A-ZÀ-Ý][\p{L}-]+(?:[\s-][A-ZÀ-Ý][\p{L}-]+)?)/u.exec(t);
  if (rcs) push("Immatriculation", `RCS ${rcs[1]}`, rcs.index, rcs[0].length);
  const form = LEGAL_FORM.exec(t);
  if (form) push("Forme juridique", form[1] ?? form[0], form.index, form[0].length);
  const capital = /\bau capital (?:social )?de\s+\d[\d\s.,]*\s?(?:€|euros?)/i.exec(t);
  if (capital) push("Capital social", capital[0].replace(/^au /, ""), capital.index, capital[0].length);
}

function history(seg: Seg, out: FactSet) {
  const t = seg.text;
  const m = HISTORY.exec(t);
  if (!m) return;
  out.add({ category: "history", label: "Ancienneté", value: m[0], quote: quoteAround(t, m.index, m.index + m[0].length, 220), sourceUrl: seg.url, confidence: "high", via: seg.tag === "meta" ? "meta" : "text" });
}

function audience(seg: Seg, out: FactSet) {
  const t = seg.text;
  if (!AUDIENCE_CONTEXT.test(t)) return;
  const found = [...t.matchAll(AUDIENCE_WORDS)];
  if (!found.length) return;
  const words = [...new Set(found.map((m) => m[0].toLowerCase()))];
  const at = found[0].index ?? 0;
  const end = (found[found.length - 1].index ?? 0) + found[found.length - 1][0].length;
  out.add({ category: "audience", label: "Clientèle", value: words.join(", "), quote: quoteAround(t, at, end, 220), sourceUrl: seg.url, confidence: "medium", via: seg.tag === "meta" ? "meta" : "text" });
}

function services(page: SitePage, segs: Seg[], out: FactSet, servicesPage: boolean) {
  for (const seg of segs) {
    if (seg.nav || !/^h[2-5]$/.test(seg.tag)) continue;
    const parentIsServices = seg.path.slice(1).some((h) => SERVICE_HEADING.test(h)) || (seg.path.length >= 1 && SERVICE_HEADING.test(seg.path[seg.path.length - 1]));
    if (!(parentIsServices || (servicesPage && /^h[23]$/.test(seg.tag)))) continue;
    const name = seg.text;
    if (name.length < 3 || name.length > 80 || /\?$/.test(name) || SERVICE_HEADING.test(name) && name.split(" ").length <= 3) continue;
    // Its description: the next text block under this heading.
    const next = seg.all.slice(seg.i + 1, seg.i + 4).find((s) => !/^h[1-6]$/.test(s.tag) && !s.nav && s.text.length >= 20 && s.path[s.path.length - 1] === name.slice(0, 160));
    const quote = next ? quoteAround(next.text, 0, Math.min(next.text.length, 20), 220) : name;
    out.add({ category: "services", label: "Prestation", value: name, quote, sourceUrl: page.url, confidence: next ? "high" : "medium", via: "text" });
  }
}

function faq(segs: Seg[], out: FactSet, faqPage: boolean) {
  for (const seg of segs) {
    if (seg.nav || !/\?$/.test(seg.text) || seg.text.length < 12 || seg.text.length > 200) continue;
    const inFaq = faqPage || seg.path.some((h) => FAQ_HEADING.test(h));
    if (!inFaq && !/^(summary|dt|h[3-5]|button)$/.test(seg.tag)) continue;
    const answer = seg.all[seg.i + 1];
    if (!answer || /\?$/.test(answer.text) || /^h[1-6]$/.test(answer.tag) || answer.text.length < 15) continue;
    out.add({ category: "faq", label: "Question du site", value: seg.text, quote: quoteAround(answer.text, 0, Math.min(answer.text.length, 30), MAX_QUOTE), sourceUrl: seg.url, confidence: inFaq ? "high" : "medium", via: "text" });
  }
}

// ------------------------------------------------------------------ entry point

export type Extraction = {
  facts: ExtractedFact[];
  name?: string;
  description?: string;
  /** Description sentence used for the deterministic summary. */
  summary?: string;
};

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
};

/** Runs every extractor over the pages (home first). Earlier pages win ties. */
export function extractFacts(pages: SitePage[]): Extraction {
  const out = new FactSet();
  const meta: { name?: string; description?: string } = {};
  for (const page of pages) fromJsonLd(page, out, meta);
  const home = pages[0];
  if (home) {
    const description = home.description || meta.description || "";
    if (description)
      out.add({ category: "activity", label: "Présentation du site", value: quoteAround(description, 0, 10, 300), quote: quoteAround(description, 0, 10, 300), sourceUrl: home.url, confidence: "high", via: "meta" });
    const h1 = home.segments.find((s) => s.tag === "h1" && s.text.split(" ").length >= 2);
    if (h1) out.add({ category: "activity", label: "Titre principal", value: h1.text.slice(0, 200), quote: h1.text.slice(0, MAX_QUOTE), sourceUrl: home.url, confidence: "high", via: "text" });
  }
  for (const page of pages) {
    const path = pathOf(page.url);
    // Page metadata is scanned like a text block (the description often states the zone).
    const metaSegs: Segment[] = page.description ? [{ text: page.description, tag: "meta", path: [], nav: false }] : [];
    const all = [...metaSegs, ...page.segments];
    const segs: Seg[] = all.map((s, i) => ({ ...s, url: page.url, i, all }));
    const legalPage = /mentions|legal|cgv|conditions/.test(path);
    services(page, segs, out, /service|prestation|metier|activite|travaux|offre/.test(path));
    faq(segs, out, /faq|question/.test(path));
    for (const seg of segs) {
      // Template leftovers ("Assurance décennale : à compléter") are not facts.
      if (PLACEHOLDER_TEXT.test(seg.text)) continue;
      if (seg.nav) {
        contact(seg, out);
        continue;
      }
      if (!legalPage) {
        zone(seg, out);
        prices(seg, out);
        delays(seg, out);
        audience(seg, out);
        hours(seg, out);
      }
      // The legal notice also names the web host and the publisher's agency: not the business.
      if (thirdParty(seg)) continue;
      contact(seg, out);
      address(seg, out);
      certifications(seg, out);
      history(seg, out);
      legal(seg, out);
    }
    for (const link of page.links) {
      if (link.href.startsWith("tel:")) {
        const n = decodeURIComponent(link.href.slice(4)).replace(/\s/g, "");
        if (phoneValid(n)) out.add({ category: "contact", label: "Téléphone", value: link.text && phoneValid(link.text) ? link.text : n, quote: link.href, sourceUrl: page.url, confidence: "high", via: "link" });
      } else if (link.href.startsWith("mailto:")) {
        const e = decodeURIComponent(link.href.slice(7).split("?")[0]);
        if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)) out.add({ category: "contact", label: "E-mail", value: e, quote: link.href.split("?")[0], sourceUrl: page.url, confidence: "high", via: "link" });
      } else socialLink(link.href, page.url, out, "link");
    }
  }
  const order = (f: ExtractedFact) => (f.confidence === "high" ? 0 : 1);
  const facts = out.facts
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.category.localeCompare(b.f.category) || order(a.f) - order(b.f) || a.i - b.i)
    .map(({ f }) => f);
  return { facts, name: meta.name, description: meta.description, summary: home?.description || meta.description };
}
