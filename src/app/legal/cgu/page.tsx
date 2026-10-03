import type { Metadata } from "next";
import Link from "next/link";
import { Todo } from "@/components/legal/Todo";

export const metadata: Metadata = {
  title: "Conditions générales — Orbis",
  description: "Conditions générales d’utilisation et de vente de l’abonnement Orbis.",
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <article>
      <h1>Conditions générales d’utilisation et de vente</h1>
      <p className="text-sm text-muted">
        Dernière mise à jour : <Todo>date</Todo>
      </p>

      <h2>1. Objet et parties</h2>
      <p>
        Les présentes conditions encadrent l’utilisation du service Orbis et la souscription de son abonnement. Le service
        est édité par <Todo>nom de la société éditrice</Todo>, <Todo>forme juridique</Todo>, SIREN <Todo>numéro SIREN</Todo>
        , dont le siège est situé <Todo>adresse du siège social</Todo> (« Orbis »). Voir les{" "}
        <Link href="/legal/mentions">mentions légales</Link>.
      </p>
      <p>
        Orbis s’adresse aux professionnels (entreprises, indépendants) qui l’utilisent pour leur activité.{" "}
        <Todo>
          préciser si des consommateurs peuvent souscrire ; si oui, ajouter le droit de rétractation et le médiateur de la
          consommation
        </Todo>
        .
      </p>
      <p>
        En créant un compte, vous acceptez les présentes conditions au nom de l’entreprise que vous représentez et déclarez
        avoir le pouvoir de l’engager.
      </p>

      <h2>2. Description du service</h2>
      <p>Orbis prépare des projets de réponse aux e-mails reçus par votre entreprise. Concrètement :</p>
      <ul>
        <li>
          vous connectez une boîte Gmail ou Outlook par une autorisation OAuth, via notre prestataire Composio. Les accès
          demandés permettent de lire les messages et de créer des brouillons (Gmail : <code>gmail.readonly</code>,{" "}
          <code>gmail.compose</code> ; Outlook : <code>Mail.ReadWrite</code>, <code>User.Read</code>,{" "}
          <code>offline_access</code>). Aucune autorisation d’envoi n’est demandée ;
        </li>
        <li>
          Orbis lit les e-mails entrants récents (par défaut 14 jours, au plus 50 messages lors du premier passage), les
          classe et crée des <strong>brouillons</strong> de réponse directement dans votre boîte ;
        </li>
        <li>
          si vous l’activez, Orbis prépare de nouveaux brouillons en continu (environ toutes les 15 minutes) ;
        </li>
        <li>
          Orbis peut préparer des brouillons de relance lorsqu’une demande reste sans réponse après un nombre de jours ouvrés
          défini, avec au plus deux relances par demande ;
        </li>
        <li>
          une liste « Demandes » récapitule les demandes reçues (contact, besoin résumé, budget ou délai tels qu’exprimés par
          le client) ;
        </li>
        <li>
          une « Fiche entreprise » regroupe les informations sur votre activité, proposées à partir de vos e-mails envoyés et
          utilisées seulement après votre validation ;
        </li>
        <li>un rapport hebdomadaire présente des chiffres agrégés (nombre de demandes, de brouillons, etc.).</li>
      </ul>

      <h3>Ce que le service ne fait pas</h3>
      <p>
        La fonction de brouillons d’Orbis <strong>n’envoie jamais d’e-mail</strong>, ne transfère ni ne supprime aucun
        message de votre boîte. Chaque brouillon reste dans votre messagerie jusqu’à ce que vous décidiez de le modifier, de
        l’envoyer vous-même ou de le supprimer.
      </p>

      <h2>3. Votre responsabilité sur les brouillons</h2>
      <p>
        Les brouillons sont produits par un modèle d’intelligence artificielle. Ils peuvent contenir des erreurs, des
        omissions ou des informations inexactes (prix, délais, disponibilités, engagements). <strong>
          Vous devez relire chaque brouillon avant tout envoi
        </strong>
        . L’envoi d’un e-mail relève de votre seule décision et de votre seule responsabilité.
      </p>
      <p>
        Les e-mails reçus sont traités comme des données non fiables : une instruction contenue dans un e-mail ne peut pas
        déclencher d’envoi, aucun outil mis à disposition du modèle ne permettant d’envoyer un message.
      </p>

      <h2>4. Compte et accès</h2>
      <p>
        Le compte est créé avec une adresse e-mail (et, selon les options proposées, un mot de passe, un lien de connexion
        par e-mail ou une connexion Google ou Microsoft). Vous êtes responsable de la confidentialité de vos accès et des
        actions réalisées depuis votre compte. Vous garantissez disposer des droits nécessaires pour connecter la boîte mail
        concernée et faire traiter les e-mails qu’elle contient.
      </p>

      <h2>5. Usage acceptable</h2>
      <p>
        Vous vous engagez à ne pas utiliser Orbis pour des activités illicites, pour l’envoi de communications non
        sollicitées, ni pour tenter de contourner les limites techniques du service (y compris les limites de fréquence
        appliquées aux pages publiques). Orbis peut suspendre un accès en cas d’usage manifestement abusif, après
        information sauf urgence.
      </p>

      <h2>6. Abonnement, essai et prix</h2>
      <h3>Essai gratuit</h3>
      <p>
        Un essai gratuit est proposé à l’ouverture de l’espace. Sa durée et le nombre de brouillons inclus sont indiqués
        sur la page Abonnement. À la fin de l’essai, la création de brouillons s’arrête sauf souscription d’une formule
        payante.
      </p>
      <h3>Formules</h3>
      <p>
        Deux formules sont proposées : <strong>Essentiel</strong> et <strong>Équipe</strong>. Chaque formule comprend un
        nombre de brouillons par mois et un plafond de coût qui protège votre espace. Les prix en vigueur sont ceux affichés
        sur la page Abonnement au moment de la souscription, tels que fournis par notre prestataire de paiement Stripe :{" "}
        <Todo>prix HT / TTC de chaque formule, périodicité de facturation</Todo>.
      </p>
      <h3>Paiement</h3>
      <p>
        Le paiement est réalisé par Stripe. Orbis ne reçoit ni ne conserve vos numéros de carte. L’abonnement est
        renouvelé automatiquement à chaque période jusqu’à résiliation.
      </p>
      <h3>Résiliation</h3>
      <p>
        Vous pouvez résilier à tout moment depuis le portail client Stripe accessible dans la page Abonnement. La résiliation
        prend effet à la fin de la période en cours ; le service reste disponible jusqu’à cette date.
      </p>
      <h3>Suppression du compte</h3>
      <p>
        Le propriétaire de l’espace peut supprimer son compte et son espace en ligne depuis les Réglages. La suppression
        résilie immédiatement l’abonnement, sans remboursement automatique au prorata de la période entamée.{" "}
        <Todo>politique de remboursement</Todo>. Les conséquences sur les données sont décrites dans la{" "}
        <Link href="/legal/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>7. Données personnelles</h2>
      <p>
        Le traitement des données est décrit dans la <Link href="/legal/confidentialite">politique de confidentialité</Link>{" "}
        et la liste des <Link href="/legal/sous-traitants">sous-traitants</Link>. Pour les e-mails de vos clients et
        contacts, Orbis agit en tant que sous-traitant pour votre compte ; <Todo>accord de traitement des données (DPA) annexé ou référencé</Todo>.
      </p>

      <h2>8. Disponibilité</h2>
      <p>
        Orbis s’efforce de maintenir le service accessible mais ne garantit pas une disponibilité sans interruption. Le
        service dépend de prestataires tiers (messagerie, modèle d’IA, hébergement) dont les incidents peuvent l’affecter.{" "}
        <Todo>engagement de niveau de service, le cas échéant</Todo>.
      </p>

      <h2>9. Responsabilité</h2>
      <p>
        Orbis est tenu d’une obligation de moyens. Orbis n’est pas responsable du contenu des e-mails que vous envoyez, ni
        des conséquences d’un brouillon envoyé sans relecture. <Todo>plafond de responsabilité et exclusions</Todo>.
      </p>

      <h2>10. Propriété intellectuelle</h2>
      <p>
        Le service et ses composants restent la propriété d’Orbis. Vous conservez la propriété de vos contenus et données ;
        vous accordez à Orbis le droit de les traiter uniquement pour fournir le service.
      </p>

      <h2>11. Modification des conditions</h2>
      <p>
        Orbis peut faire évoluer les présentes conditions. Les changements importants vous seront notifiés{" "}
        <Todo>délai et modalités de notification</Todo> avant leur entrée en vigueur.
      </p>

      <h2>12. Droit applicable et litiges</h2>
      <p>
        Les présentes conditions sont soumises au <Todo>droit applicable</Todo>. En cas de litige, et après une tentative de
        résolution amiable, compétence est attribuée aux <Todo>tribunaux compétents</Todo>.{" "}
        <Todo>médiateur de la consommation, uniquement si des consommateurs sont acceptés (cible actuelle : professionnels)</Todo>.
      </p>

      <h2>13. Contact</h2>
      <p>
        <Todo>adresse e-mail de contact</Todo>
      </p>
    </article>
  );
}
