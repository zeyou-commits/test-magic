import { createFileRoute, notFound } from "@tanstack/react-router";
import { articles } from "@/content/articles";
import { ArticlePage } from "@/components/editorial/ArticlePage";
import { seoHead } from "@/lib/seo/site";
import { lineQueries } from "@/components/editorial/LineBlocks";
export const Route = createFileRoute("/guide/$slug")({
  loader: async ({ context, params }) => {
    const article = articles.find((a) => a.slug === params.slug);
    if (!article) throw notFound();
    // Dossier lié à une ligne : carte, navires, compagnies et départs viennent des données du site.
    if (article.line) {
      await Promise.all(lineQueries.map((query) => context.queryClient.ensureQueryData(query as never)));
    }
    return article;
  },
  head: ({ loaderData }) =>
    loaderData
      ? seoHead(
          `${loaderData.title} | BledWay`,
          loaderData.description,
          `/guide/${loaderData.slug}`,
          true,
          loaderData.illustration
            ? { path: loaderData.illustration.share, width: 1200, height: 630, alt: loaderData.illustration.alt }
            : undefined,
        )
      : {
          meta: [{ title: "Dossier introuvable | BledWay" }, { name: "robots", content: "noindex" }],
        },
  component: ArticleRoute,
});

function ArticleRoute() {
  const article = Route.useLoaderData();
  return <ArticlePage article={article} />;
}
