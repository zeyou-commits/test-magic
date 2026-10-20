import { createFileRoute, notFound } from "@tanstack/react-router";
import { articles } from "@/content/articles";
import { ArticlePage } from "@/components/editorial/ArticlePage";
import { seoHead } from "@/lib/seo/site";
export const Route = createFileRoute("/guide/$slug")({
  loader: ({ params }) => {
    const article = articles.find((a) => a.slug === params.slug);
    if (!article) throw notFound();
    return article;
  },
  head: ({ loaderData }) =>
    loaderData
      ? seoHead(
          `${loaderData.title} | Batogo`,
          loaderData.description,
          `/guide/${loaderData.slug}`,
          true,
        )
      : {
          meta: [{ title: "Dossier introuvable | Batogo" }, { name: "robots", content: "noindex" }],
        },
  component: ArticleRoute,
});

function ArticleRoute() {
  const article = Route.useLoaderData();
  return <ArticlePage article={article} />;
}
