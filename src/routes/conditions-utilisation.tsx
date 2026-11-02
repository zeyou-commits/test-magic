import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";

const title = "Conditions d'utilisation — BledWay";
const description =
  "Conditions d'utilisation de BledWay : accès au service, compte, contenus publiés par les voyageurs, modération et responsabilité.";

export const Route = createFileRoute("/conditions-utilisation")({
  head: () => seoHead(title, description, "/conditions-utilisation"),
  component: TermsPage,
});

function TermsPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Informations légales"
        title="Conditions d'utilisation"
        intro="Ces conditions encadrent l'usage de BledWay, service d'information indépendant sur les traversées entre l'Europe et l'Algérie."
      />
      <div className="mx-auto mt-8 max-w-3xl space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">Le service</h2>
          <p className="mt-1">
            BledWay rassemble des horaires, des positions de navires et des informations partagées
            par les voyageurs. Ces informations sont indicatives : seules les compagnies maritimes
            et les autorités portuaires font foi. BledWay ne vend aucun billet et peut faire évoluer
            ou interrompre tout ou partie du service.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Votre compte</h2>
          <p className="mt-1">
            Il faut avoir au moins 15 ans pour créer un compte et écrire dans les salons. Vous êtes
            responsable de l'usage de votre compte et de la confidentialité de vos accès. Un seul
            compte par personne.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Ce que vous publiez</h2>
          <p className="mt-1">
            Vous restez responsable de vos messages, questions, réponses et signalements. Vous vous
            engagez à respecter la{" "}
            <a className="text-primary underline" href="/charte">
              charte de la communauté
            </a>
            , la loi et les droits des autres. Vous autorisez BledWay à afficher ces contenus sur le
            service, le temps de leur conservation.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Modération</h2>
          <p className="mt-1">
            BledWay peut refuser, masquer ou retirer un contenu contraire à la charte ou à la loi,
            et suspendre l'écriture d'un compte, temporairement ou durablement. Un contenu illicite
            peut être signalé avec le bouton « Signaler » ou depuis la page{" "}
            <a className="text-primary underline" href="/contact">
              Contact
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Responsabilité</h2>
          <p className="mt-1">
            BledWay ne garantit pas l'exactitude des informations publiées par des tiers ou des
            voyageurs, ni la disponibilité permanente du service. Avant de partir, vérifiez toujours
            votre traversée auprès de la compagnie.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Données personnelles</h2>
          <p className="mt-1">
            L'usage de vos données est décrit dans la{" "}
            <a className="text-primary underline" href="/confidentialite">
              politique de confidentialité
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Évolution des conditions</h2>
          <p className="mt-1">
            Ces conditions et la charte peuvent évoluer. Quand la charte change, elle vous est
            présentée à nouveau avant votre message suivant.
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
