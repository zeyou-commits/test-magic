import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { entityReviewsKey, ownEntityReviewsQuery, reviewsDb } from "@/lib/ferry/entityReviews";
import { companiesQuery, portsQuery, vesselsQuery } from "@/lib/ferry/queries";
import { Button } from "@/components/ui/button";
import { reviewScore } from "@/lib/ferry/reviewCriteria";
import { reviewNumber } from "@/lib/ferry/reviewCriteria";
export function MyEntityReviews({ userId }: { userId: string }) {
  const query = useQuery(ownEntityReviewsQuery(userId));
  const client = useQueryClient();
  const ports = useQuery(portsQuery).data ?? [];
  const ships = useQuery(vesselsQuery).data ?? [];
  const companies = useQuery(companiesQuery).data ?? [];
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await reviewsDb.rpc("bw_delete_entity_review", { p_review: id });
      if (error) throw new Error("La suppression a échoué.");
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: entityReviewsKey });
      void client.invalidateQueries({ queryKey: ["bw-travellers"] });
      void client.invalidateQueries({ queryKey: ["admin", "counts"] });
    },
  });
  return (
    <section className="my-5">
      <h3 className="font-semibold">Mes évaluations par critères</h3>
      {query.isPending ? (
        <p role="status">Chargement…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : !query.data.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Vos notes sur les ports, les navires et les compagnies apparaîtront ici.
        </p>
      ) : (
        <ul className="divide-y">
          {query.data.map((r) => {
            const name =
              (r.target_kind === "port"
                ? ports
                : r.target_kind === "vessel"
                  ? ships
                  : companies
              ).find((x) => x.id === r.target_id)?.name ?? "Fiche";
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <a
                    className="font-semibold text-primary underline"
                    href={`/?select=${r.target_kind}&id=${encodeURIComponent(r.target_id)}`}
                  >
                    {name}
                  </a>
                  <p className="text-sm">
                    {reviewNumber(reviewScore(r.target_kind, r.scores) ?? 0)}/5 ·{" "}
                    {r.status === "pending"
                      ? "En attente de vérification"
                      : r.status === "published"
                        ? "Publiée"
                        : "Masquée"}
                  </p>
                  <small className="text-muted-foreground">
                    {new Date(r.updated_at).toLocaleDateString("fr-FR")}
                    {r.status === "pending" && r.published_scores
                      ? " · Ancienne note toujours publiée"
                      : ""}
                  </small>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm("Supprimer définitivement cette évaluation ?"))
                      remove.mutate(r.id);
                  }}
                >
                  Supprimer
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {remove.isError ? <p role="alert">{remove.error.message}</p> : null}
    </section>
  );
}
