import { seoHead } from "@/lib/seo/site";
import { createFileRoute } from "@tanstack/react-router";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { CHARTER_RULES } from "@/components/panel/CharterGate";

const title = "Charte de la communauté — BledWay";
const description =
  "Les règles des salons, questions et messages privés BledWay : entraide entre voyageurs, respect, informations vérifiées et modération.";

export const Route = createFileRoute("/charte")({
  head: () => seoHead(title, description, "/charte"),
  component: CharterPage,
});

function CharterPage() {
  return (
    <SiteLayout>
      <PageHero
        overline="Communauté"
        title="Charte de la communauté"
        intro="Les salons BledWay servent à s'entraider pendant le voyage : au port, à bord et à l'arrivée. Cette charte s'applique aux salons, aux questions sur les lignes et aux messages privés."
      />
      <div className="mx-auto mt-8 max-w-3xl space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">L'essentiel</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {CHARTER_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Ce qui est interdit</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Les insultes, le harcèlement, les menaces et les propos racistes, sexistes ou haineux.
            </li>
            <li>
              Les numéros de téléphone, adresses e-mail, liens et coordonnées, les vôtres comme ceux
              des autres.
            </li>
            <li>La publicité, la revente de billets, les arnaques et les demandes d'argent.</li>
            <li>Les fausses informations volontaires sur un départ, un retard ou un navire.</li>
            <li>Les messages répétés à l'identique ou en rafale.</li>
            <li>Tout contenu illégal ou contraire aux droits d'autrui.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">
            Les informations des voyageurs
          </h2>
          <p className="mt-1">
            Ce que partagent les voyageurs est un témoignage, utile mais non vérifié. Seule la
            compagnie maritime confirme un départ, un horaire ou une annulation. BledWay ne vend
            aucun billet.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Les messages officiels</h2>
          <p className="mt-1">
            Les membres de l'équipe portent un badge « Admin » ou « Modérateur ». Un message marqué
            « Officiel » est publié au nom de BledWay. Personne d'autre ne peut utiliser ces badges.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">La modération</h2>
          <p className="mt-1">
            Les messages contenant un lien, une coordonnée ou un mot refusé ne partent pas. Chacun
            peut signaler un message. L'équipe peut masquer un message, empêcher un compte d'écrire
            pendant 24 heures ou l'exclure des salons pendant 7 jours. Plusieurs messages refusés à
            la suite bloquent aussi l'écriture pendant 24 heures.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">Vos notifications</h2>
          <p className="mt-1">
            Vous êtes prévenu quand quelqu'un vous mentionne ou répond à votre message. Chaque salon
            peut être mis en sourdine avec la cloche, et toutes les notifications de la communauté
            se coupent depuis votre compte.
          </p>
        </section>
        <p>
          En écrivant dans un salon, vous acceptez cette charte et les{" "}
          <a className="text-primary underline" href="/conditions-utilisation">
            conditions d'utilisation
          </a>
          .
        </p>
      </div>
    </SiteLayout>
  );
}
