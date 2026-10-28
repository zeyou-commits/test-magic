import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { entityReviewsKey, reviewsDb, type EntityReview } from "@/lib/ferry/entityReviews";
import { companiesQuery, portsQuery, vesselsQuery } from "@/lib/ferry/queries";
import { reviewCriteria, reviewScore } from "@/lib/ferry/reviewCriteria";
import { Button } from "@/components/ui/button";
import { reviewNumber } from "@/lib/ferry/reviewCriteria";

export function EntityReviewsModeration({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const filter = pendingOnly ? "pending" : status;
  const ports = useQuery(portsQuery).data ?? [];
  const vessels = useQuery(vesselsQuery).data ?? [];
  const companies = useQuery(companiesQuery).data ?? [];
  const query = useQuery({
    queryKey: [...entityReviewsKey, "moderation", filter, page],
    queryFn: async () => {
      let request = reviewsDb
        .from("bw_entity_reviews")
        .select("id,target_kind,target_id,scores,published_scores,status,updated_at,published_at", {
          count: "exact",
        })
        .order("updated_at", { ascending: false })
        .order("id")
        .range(page * 20, page * 20 + 19);
      if (filter !== "all") request = request.eq("status", filter);
      const { data, error, count } = await request;
      if (error)
        throw new Error(
          "Les avis guidés ne sont pas disponibles. Vérifiez vos droits et la migration.",
        );
      return { rows: data as EntityReview[], total: count ?? 0 };
    },
    retry: false,
  });
  const action = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await reviewsDb.rpc("bw_moderate_entity_review", {
        p_review: id,
        p_status: status,
      });
      if (error) throw new Error("La modération a échoué. Vérifiez vos droits et réessayez.");
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: entityReviewsKey });
      void client.invalidateQueries({ queryKey: ["admin", "counts"] });
      void client.invalidateQueries({ queryKey: ["bw-travellers"] });
    },
  });
  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Avis guidés · ports, navires et compagnies</h2>
        {!pendingOnly ? (
          <label>
            Afficher{" "}
            <select
              className="rounded-lg border p-2"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="pending">À vérifier</option>
              <option value="published">Publiés</option>
              <option value="hidden">Masqués</option>
              <option value="all">Tous</option>
            </select>
          </label>
        ) : null}
      </div>
      {query.isPending ? (
        <p role="status">Chargement des évaluations…</p>
      ) : query.isError ? (
        <p role="alert">
          {query.error.message}{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Réessayer
          </button>
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {query.data.total} évaluation(s). Une modification reste privée jusqu’à sa publication.
          </p>
          <ul className="space-y-3">
            {query.data.rows.map((r) => {
              const name =
                (r.target_kind === "port"
                  ? ports
                  : r.target_kind === "vessel"
                    ? vessels
                    : companies
                ).find((x) => x.id === r.target_id)?.name ?? "Fiche indisponible";
              return (
                <li className="rounded-xl border p-4" key={r.id}>
                  <strong>
                    {name} · {reviewNumber(reviewScore(r.target_kind, r.scores) ?? 0)}/5
                  </strong>
                  <p className="text-xs text-muted-foreground">
                    {r.target_kind === "port"
                      ? "Port"
                      : r.target_kind === "vessel"
                        ? "Navire"
                        : "Compagnie"}{" "}
                    · {new Date(r.updated_at).toLocaleString("fr-FR")} ·{" "}
                    {r.status === "pending"
                      ? "À vérifier"
                      : r.status === "published"
                        ? "Publié"
                        : "Masqué"}
                  </p>
                  <dl className="my-3 text-sm">
                    {reviewCriteria[r.target_kind].map((c) => (
                      <div key={c.code} className="flex justify-between gap-3">
                        <dt>{c.label}</dt>
                        <dd>{r.scores[c.code] ? `${r.scores[c.code]}/5` : "Non utilisé"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={action.isPending || r.status === "published"}
                      onClick={() => action.mutate({ id: r.id, status: "published" })}
                    >
                      Publier
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.isPending || r.status === "hidden"}
                      onClick={() => action.mutate({ id: r.id, status: "hidden" })}
                    >
                      Masquer
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </Button>
            <span>Page {page + 1}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={(page + 1) * 20 >= query.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </>
      )}
      {action.isError ? <p role="alert">{action.error.message}</p> : null}
    </section>
  );
}
