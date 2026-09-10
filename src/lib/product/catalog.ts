export type Flow = {
  id: string;
  version: string;
  title: string;
  department: string;
  industry: string;
  input: string;
  output: string;
  acceptance: string;
  engine: string;
  steps: string[];
  capabilities: string[];
  approval: string;
  memory: string;
  availability: "document" | "integration";
};
type Group = {
  department: string;
  industry: string;
  engine: string;
  capabilities: string[];
  rows: string;
};
// Each row is an authored business contract: title | required input | deliverable | acceptance criterion.
const groups: Group[] = [
  {
    department: "Commercial",
    industry: "Tous secteurs",
    engine: "request-analysis",
    capabilities: ["crm", "enrichment", "ai"],
    rows: `Qualifier une demande entrante|Demande et critères ICP|Fiche de qualification et questions manquantes|Chaque critère ICP renvoie à une preuve
Préparer une relance commerciale|Historique de contact et offre|Relance contextualisée avec prochain pas|Aucun engagement absent de l'offre
Analyser un appel de découverte|Transcription et grille de qualification|Besoins, objections et prochaine action|Les objections sont citées depuis la transcription
Préparer une proposition commerciale|Brief client et catalogue tarifaire|Proposition structurée avec hypothèses|Prix exclusivement issus du catalogue fourni
Répondre à un questionnaire fournisseur|Questionnaire et documentation approuvée|Matrice de réponses avec références|Chaque réponse non documentée est signalée
Prioriser un pipeline commercial|Export CRM et dates d'activité|Liste priorisée avec justification|Aucune opportunité créée sans ligne source
Préparer un renouvellement de contrat|Contrat et historique d'utilisation|Brief de renouvellement et risques|Dates et montants concordent avec le contrat
Analyser une affaire perdue|Notes de vente et retours du prospect|Causes probables et actions d'amélioration|Faits et hypothèses sont séparés
Préparer un plan de compte|Dossier entreprise et contacts autorisés|Carte des interlocuteurs et plan d'approche|Rôles non vérifiés restent des hypothèses
Préparer une campagne de prospection|ICP, offre et liste consentie|Segments et séquences à valider|Aucun envoi et aucune collecte hors du périmètre`,
  },
  {
    department: "Marketing",
    industry: "Tous secteurs",
    engine: "content-draft",
    capabilities: ["knowledge", "ai", "publishing"],
    rows: `Construire un calendrier éditorial|Objectifs, audience et événements|Planning de quatre semaines|Chaque publication sert un objectif explicite
Transformer un webinaire en contenus|Transcription et charte de marque|Article, posts et newsletter|Aucune citation inventée
Rédiger une étude de cas client|Interview et résultats autorisés|Étude de cas prête à relire|Tous les chiffres sont sourcés
Préparer une newsletter sectorielle|Articles sélectionnés et audience|Newsletter hiérarchisée|Sources et dates de publication présentes
Créer un brief SEO|Sujet, audience et recherche fournie|Plan d'article et intentions à couvrir|Aucun volume de recherche inventé
Préparer des variantes publicitaires|Offre, contraintes et canal|Variantes de messages publicitaires|Aucune promesse commerciale non approuvée
Analyser les retours d'une campagne|Rapport de campagne et objectifs|Bilan et tests suivants|Métriques reprises sans estimation cachée
Adapter un contenu à plusieurs marchés|Contenu source et marchés cibles|Adaptations localisées|Les adaptations ne changent pas les faits
Préparer un lancement produit|Fiche produit, audience et calendrier|Plan de lancement et messages|Les fonctionnalités sont limitées à la fiche
Construire une FAQ de conversion|Questions prospects et documentation|FAQ par étape d'achat|Chaque réponse cite la documentation`,
  },
  {
    department: "Service client",
    industry: "Tous secteurs",
    engine: "request-analysis",
    capabilities: ["helpdesk", "knowledge", "ai"],
    rows: `Préparer une réponse à un ticket|Ticket et base de connaissance|Réponse et motif d'escalade|Aucune procédure non documentée
Trier les demandes de support|Export de tickets et règles de priorité|Classification et priorités|Les tickets critiques sont identifiés séparément
Analyser les causes de réclamations|Réclamations anonymisées|Thèmes récurrents et exemples|Chaque thème possède des tickets sources
Préparer un geste commercial|Réclamation et politique commerciale|Recommandation à faire approuver|Aucun remboursement exécuté
Construire un guide de résolution|Incidents résolus et procédures|Guide étape par étape|Les étapes correspondent aux résolutions documentées
Préparer un onboarding client|Contrat, périmètre et calendrier|Plan d'accueil et liste des prérequis|Les responsabilités sont explicites
Détecter les risques de départ client|Retours et indicateurs fournis|Dossiers de risque argumentés|Les scores ne sont pas présentés comme des probabilités
Préparer une revue de compte client|Historique et objectifs du client|Bilan, risques et plan d'action|Les indicateurs sont traçables
Répondre à une demande de remboursement|Commande et politique de remboursement|Réponse motivée à valider|Conditions appliquées sans remboursement automatique
Mettre à jour un article d'aide|Article actuel et changements produit|Nouvelle version et différences|Aucune instruction obsolète conservée sans signalement`,
  },
  {
    department: "Finance",
    industry: "Tous secteurs",
    engine: "research-brief",
    capabilities: ["accounting", "knowledge", "ai"],
    rows: `Préparer une relance de facture|Factures et échéances|Relances classées par retard|Montants et échéances identiques aux sources
Analyser des écarts budgétaires|Budget et dépenses exportées|Écarts et questions à investiguer|Calculs à rapprocher du fichier source avant décision
Préparer un dossier de clôture|Checklist et pièces comptables|Liste des pièces présentes et manquantes|Aucune écriture comptable automatique
Comparer des propositions fournisseurs|Devis comparables et critères|Tableau comparatif documenté|Différences de périmètre signalées
Préparer une synthèse de trésorerie|Prévisionnel et encaissements|Commentaire des flux et points d'attention|Hypothèses séparées des flux constatés
Contrôler un dossier de frais|Justificatifs et politique interne|Anomalies à vérifier|Aucun paiement ou rejet définitif
Préparer un reporting mensuel|Indicateurs validés et commentaires|Note de gestion pour direction|Chaque montant possède une référence
Analyser des abonnements logiciels|Inventaire et factures SaaS|Doublons et pistes de rationalisation|Aucune résiliation automatique
Préparer un dossier de financement|Business plan et pièces demandées|Dossier structuré et manquants|Aucun chiffre prévisionnel inventé
Préparer une revue de marge|Prix, coûts et périmètres fournis|Synthèse des facteurs de marge|Aucune marge affirmée sans coûts complets`,
  },
  {
    department: "Ressources humaines",
    industry: "Tous secteurs",
    engine: "content-draft",
    capabilities: ["knowledge", "ai", "hris"],
    rows: `Rédiger une fiche de poste|Responsabilités et grille interne|Fiche de poste structurée|Critères liés au poste sans attributs protégés
Préparer un guide d'entretien|Fiche de poste et compétences|Questions et grille d'observation|Aucun classement automatisé des candidats
Construire un parcours d'intégration|Rôle, équipe et procédures|Plan des trente premiers jours|Chaque tâche a un responsable à confirmer
Préparer un plan de formation|Besoins exprimés et compétences|Parcours de formation proposé|Les écarts sont issus des besoins fournis
Synthétiser une enquête interne|Réponses anonymisées|Thèmes et pistes d'amélioration|Aucune réidentification des répondants
Mettre à jour un livret d'accueil|Livret et politiques approuvées|Version révisée et changements|Les nouvelles règles sont validées par RH
Préparer une campagne de recrutement|Poste et proposition employeur|Messages et supports de recrutement|Aucune promesse contractuelle inventée
Documenter une passation de poste|Notes et liste des responsabilités|Dossier de passation|Les accès sensibles ne sont jamais reproduits
Préparer un entretien de développement|Objectifs et autoévaluation|Trame de discussion|Aucune décision de promotion automatisée
Construire une FAQ RH|Politiques internes approuvées|Réponses sourcées pour collaborateurs|Les questions individuelles sont escaladées`,
  },
  {
    department: "Opérations",
    industry: "Tous secteurs",
    engine: "research-brief",
    capabilities: ["knowledge", "ai", "project"],
    rows: `Transformer une réunion en plan d'action|Transcription de réunion|Décisions et actions avec propriétaires|Responsables non mentionnés restent à attribuer
Documenter une procédure opérationnelle|Notes terrain et procédure existante|Procédure versionnée|Les exceptions et contrôles sont explicites
Préparer un suivi de projet|Avancement et jalons|Rapport risques, blocages et actions|Aucun avancement inventé
Analyser un incident opérationnel|Chronologie et comptes rendus|Retour d'expérience et actions|Cause racine incertaine présentée comme hypothèse
Construire une checklist qualité|Norme interne et étapes de production|Checklist par étape|Aucune certification revendiquée
Préparer une consultation fournisseur|Besoin et critères d'achat|Cahier des charges|Critères d'acceptation mesurables
Analyser un processus répétitif|Description des étapes et volumes|Cartographie et options d'automatisation|Les dépendances humaines sont conservées
Préparer une réunion de direction|Rapports des équipes|Ordre du jour orienté décisions|Chaque décision possède son contexte
Synthétiser des retours terrain|Comptes rendus des opérateurs|Problèmes récurrents et pistes|Fréquences calculées uniquement sur le corpus
Préparer un plan de continuité|Processus critiques et contacts|Scénarios et procédures à valider|Aucun test de continuité prétendu réalisé`,
  },
  {
    department: "Juridique & achats",
    industry: "Tous secteurs",
    engine: "research-brief",
    capabilities: ["knowledge", "ai"],
    rows: `Préparer une revue de contrat|Contrat et grille juridique interne|Clauses et écarts à faire revoir|Avis final réservé au juriste
Analyser un dossier d'appel d'offres|Règlement et pièces de consultation|Exigences, échéances et matrice de réponse|Aucune échéance omise sans alerte
Préparer un mémoire technique|Dossier de consultation et références|Brouillon de mémoire sourcé|Aucune certification ou référence inventée
Vérifier la complétude d'un dossier|Liste des pièces et documents|Matrice de complétude|Chaque statut renvoie à une pièce
Comparer des versions de contrat|Deux versions d'un contrat|Différences et impacts à revoir|Aucune conclusion juridique définitive
Préparer un registre de décisions|Comptes rendus approuvés|Registre daté et sourcé|Décisions et propositions distinctes
Préparer une politique interne|Exigences et pratiques validées|Projet de politique à approuver|Aucune conformité légale garantie
Analyser une demande de sous-traitance|Dossier fournisseur et critères|Questions et risques à vérifier|Pas de validation fournisseur automatique
Préparer une négociation achat|Offres et contraintes|Brief de négociation|Le mandat et les limites sont explicites
Suivre les obligations contractuelles|Contrats et responsables|Calendrier d'obligations à valider|Dates extraites avec référence de clause`,
  },
  {
    department: "Commerce & immobilier",
    industry: "Commerce / Immobilier",
    engine: "content-draft",
    capabilities: ["knowledge", "ai", "crm"],
    rows: `Rédiger une fiche produit e-commerce|Caractéristiques et visuels décrits|Fiche produit et variantes|Aucune propriété technique inventée
Répondre à un avis client|Avis et politique de marque|Réponse personnalisée|Aucune donnée personnelle reproduite
Préparer un guide d'achat|Catalogue et besoins clients|Guide comparatif|Comparaisons limitées aux données disponibles
Analyser des motifs de retour produit|Retours et références produits|Motifs et actions proposées|Pas de causalité affirmée sans preuve
Préparer une campagne saisonnière|Stocks, dates et offres|Plan de campagne|Disponibilités limitées aux stocks fournis
Rédiger une annonce immobilière|Fiche du bien et diagnostics|Annonce et questions manquantes|Surface et diagnostics recopiés sans invention
Préparer un dossier de visite|Fiche bien et besoins du visiteur|Brief de visite et questions|Aucune promesse de rentabilité
Synthétiser une assemblée de copropriété|Procès-verbal approuvé|Décisions et échéances|Aucune modification des résolutions
Préparer un suivi de location|Contrat et échanges|Réponse et prochaines démarches|Validation professionnelle avant action juridique
Préparer une estimation comparative|Biens comparables fournis|Analyse des différences|Pas de valeur certifiée sans expertise`,
  },
  {
    department: "Industrie & bâtiment",
    industry: "Industrie / Bâtiment",
    engine: "research-brief",
    capabilities: ["knowledge", "ai", "project"],
    rows: `Préparer un compte rendu de chantier|Notes de chantier et planning|Compte rendu et réserves|Aucune réception de travaux prononcée
Préparer un devis travaux|Métrés et bordereau de prix|Brouillon de devis et hypothèses|Quantités et prix entièrement sourcés
Analyser des réserves de réception|Liste des réserves et contrats|Plan de traitement proposé|Aucune réserve levée automatiquement
Préparer un dossier de maintenance|Historique et manuel équipement|Checklist et questions techniques|Aucune opération dangereuse non documentée
Synthétiser des fiches techniques|Fiches fabricants fournies|Comparatif technique|Unités conservées et différences signalées
Préparer un dossier de consultation travaux|Plans décrits et besoins|Lots et exigences|Validation technique avant publication
Analyser des non-conformités|Rapports et critères qualité|Synthèse et actions correctives proposées|Aucune certification de conformité
Préparer un plan d'approvisionnement|Planning et besoins matières|Liste des dépendances et commandes à prévoir|Aucune commande passée
Rédiger un rapport d'intervention|Notes technicien et équipement|Rapport client structuré|Actions réalisées distinctes des recommandations
Préparer une réponse SAV industriel|Incident et documentation machine|Réponse documentée et escalades|Instructions de sécurité reprises des sources`,
  },
  {
    department: "Services professionnels",
    industry: "Conseil / Agences / IT",
    engine: "meeting-prep",
    capabilities: ["knowledge", "ai", "project"],
    rows: `Préparer un atelier de cadrage|Brief et objectifs client|Agenda, questions et décisions attendues|Les inconnues critiques sont mises en évidence
Construire un brief créatif|Marque, audience et livrables|Brief créatif et critères de validation|Contraintes de droits mentionnées
Préparer un audit de processus client|Entretien et procédures|Constats et opportunités classées|Aucune économie présentée comme mesurée sans données
Préparer une proposition de mission conseil|Diagnostic et périmètre|Proposition, livrables et exclusions|Charges estimées identifiées comme hypothèses
Préparer une revue de sprint|Tickets et objectifs du sprint|Bilan et points à décider|Tickets terminés vérifiés dans l'export
Documenter un besoin fonctionnel|Entretien et contraintes|Spécification et critères d'acceptation|Exigences ambiguës transformées en questions
Préparer un dossier de recette|Spécification et critères|Scénarios de test et résultats attendus|Aucun test déclaré exécuté
Préparer une passation client agence|Livrables et procédures|Dossier de transmission|Aucun secret ou mot de passe inclus
Analyser des demandes de changement|Demandes et périmètre signé|Impact et arbitrages|Aucune modification contractuelle automatique
Préparer une revue stratégique client|Objectifs et indicateurs fournis|Brief de revue et options|Recommandations distinguées des résultats constatés`,
  },
];

export const flows: Flow[] = groups.flatMap((g, gi) =>
  g.rows.split("\n").map((row, i) => {
    const [title, input, output, acceptance] = row.split("|");
    return {
      id: `flow-${String(gi * 10 + i + 1).padStart(3, "0")}`,
      version: "1.0.0",
      title,
      department: g.department,
      industry: g.industry,
      input,
      output,
      acceptance,
      engine: g.engine,
      capabilities: g.capabilities,
      steps: [
        `Vérifier : ${input}`,
        `Préparer : ${output}`,
        `Contrôler : ${acceptance}`,
        "Soumettre le livrable à votre validation",
      ],
      approval: "Validation humaine avant toute utilisation ou action externe",
      memory: `Conserver uniquement les corrections approuvées pour « ${title} ». Ne jamais partager les informations entre clients.`,
      availability: "document",
    };
  }),
);
export const departments = groups.map((g) => g.department);
export const capabilityLabels: Record<string, string> = {
  ai: "Intelligence artificielle",
  crm: "CRM",
  enrichment: "Données & enrichissement",
  knowledge: "Documents & connaissances",
  publishing: "Publication",
  helpdesk: "Support client",
  accounting: "Comptabilité",
  hris: "RH",
  project: "Gestion de projet",
};
export function findFlow(id: string) {
  return flows.find((f) => f.id === id);
}
export function rankFlows(need: string, department: string) {
  const tokens = need
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  return flows
    .map((flow) => {
      const haystack =
        `${flow.title} ${flow.input} ${flow.output} ${flow.department} ${flow.industry}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      const matches = tokens.filter((t) => haystack.includes(t));
      return {
        flow,
        score: matches.length + (flow.department === department ? 5 : 0),
        reason:
          flow.department === department
            ? `Correspond à votre priorité : ${department}`
            : matches.length
              ? `Correspondances avec votre besoin : ${matches.slice(0, 3).join(", ")}`
              : "Autre piste à explorer",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
