export const plans = [
  {
    name: "Solo",
    monthly: 149,
    description: "Une entreprise, ses premières missions et ses règles.",
    features: [
      "Catalogue de 100 cas préconçus",
      "Contexte et mémoire par mission",
      "Fournisseurs propres ou gérés selon disponibilité",
    ],
  },
  {
    name: "Business",
    monthly: 399,
    description: "Plusieurs équipes et un accompagnement au déploiement.",
    features: [
      "Gouvernance et suivi de qualité ciblés",
      "Déploiement de plusieurs processus",
      "Volume et accompagnement définis au contrat",
    ],
  },
  {
    name: "Partner",
    monthly: null,
    description: "Un intégrateur qui déploie chez plusieurs clients.",
    features: [
      "Plans clients et modèles réutilisables",
      "Conditions commerciales sur mesure",
      "Prestations d’intégration facturées par le partenaire",
    ],
  },
];
export function businessMonthly(seats: number) {
  if (!Number.isInteger(seats) || seats < 1 || seats > 50)
    throw new Error("Invalid seats");
  return 399 + Math.max(0, seats - 5) * 39;
}
export function estimateBill(
  platform: number,
  runs: number,
  costPerRun: number,
  managed: boolean,
) {
  if ([platform, runs, costPerRun].some((v) => !Number.isFinite(v) || v < 0))
    throw new Error("Invalid estimate");
  const provider = runs * costPerRun;
  const managedFee = managed ? provider * 0.2 : 0;
  return {
    platform,
    provider,
    managedFee,
    orbis: platform + (managed ? provider + managedFee : 0),
    total: platform + provider + managedFee,
  };
}
