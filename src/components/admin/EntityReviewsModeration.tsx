import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { entityReviewsKey, reviewsDb, type EntityReview } from "@/lib/ferry/entityReviews";
import { companiesQuery, portsQuery, vesselsQuery } from "@/lib/ferry/queries";
import { reviewCriteria, reviewScore } from "@/lib/ferry/reviewCriteria";
import { Button } from "@/components/ui/button";
import { reviewNumber } from "@/lib/ferry/reviewCriteria";
import { ReviewAuthor, useReviewAuthorsQuery } from "./ReviewAuthor";
import { ModerationCard, ModerationSection, moderationEmpty, StatusFilter } from "./ModerationCard";

export function EntityReviewsModeration({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const [status, setStatus] = useState<"pending" | "published" | "hidden" | "all">("pending");
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
  // Qui a noté : profil de l’auteur pour chaque avis affiché (équipe seulement).
  const authors = useReviewAuthorsQuery(
    "entity_review",
    (query.data?.rows ?? []).map((r) => r.id),
  );
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
  const KIND = { port: "Port", vessel: "Navire", company: "Compagnie" } as const;
  return (
    <ModerationSection
      title="Avis guidés"
      count={filter === "pending" ? query.data?.total : undefined}
      hint="Ports, navires et compagnies, notés critère par critère. Une modification reste privée jusqu’à sa publication ; l’auteur est prévenu de votre décision."
      toolbar={
        pendingOnly ? null : (
          <StatusFilter
            label="Avis affichés"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(0);
            }}
            options={[
              { value: "pending", label: "À vérifier" },
              { value: "published", label: "Publiés" },
              { value: "hidden", label: "Masqués" },
              { value: "all", label: "Tous" },
            ]}
          />
        )
      }
    >
      {query.isPending ? (
        <p role="status" className="bo-mod__empty">
          Chargement des évaluations…
        </p>
      ) : query.isError ? (
        <p role="alert" className="bo-mod__empty">
          {query.error.message}{" "}
          <button type="button" className="bo-link" onClick={() => void query.refetch()}>
            Réessayer
          </button>
        </p>
      ) : !query.data.rows.length ? (
        moderationEmpty(filter === "pending" ? "Aucun avis guidé à vérifier." : "Aucun avis ici.")
      ) : (
        <>
          <ul className="bo-modlist">
            {query.data.rows.map((r) => {
              const name =
                (r.target_kind === "port"
                  ? ports
                  : r.target_kind === "vessel"
                    ? vessels
                    : companies
                ).find((x) => x.id === r.target_id)?.name ?? "Fiche indisponible";
              return (
                <ModerationCard
                  key={r.id}
                  title={`${name} · ${reviewNumber(reviewScore(r.target_kind, r.scores) ?? 0)}/5`}
                  status={r.status}
                  meta={`${KIND[r.target_kind]} · ${new Date(r.updated_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`}
                  author={<ReviewAuthor info={authors.data?.[r.id]} lookup={authors.lookup} />}
                  actions={
                    <>
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
                    </>
                  }
                >
                  <dl className="bo-scores">
                    {reviewCriteria[r.target_kind].map((c) => (
                      <div key={c.code}>
                        <dt>{c.label}</dt>
                        <dd>{r.scores[c.code] ? `${r.scores[c.code]}/5` : "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </ModerationCard>
              );
            })}
          </ul>
          {query.data.total > 20 ? (
            <div className="bo-pager">
              <Button
                size="sm"
                variant="outline"
                disabled={!page}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <span>
                Page {page + 1} sur {Math.ceil(query.data.total / 20)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(page + 1) * 20 >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          ) : null}
        </>
      )}
      {action.isError ? (
        <p role="alert" className="bo-mod__empty">
          {action.error.message}
        </p>
      ) : null}
    </ModerationSection>
  );
}
