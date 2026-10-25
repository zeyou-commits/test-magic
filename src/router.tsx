import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Mobile : revenir à l'accueil montre toujours la carte, jamais une section plus bas.
    scrollRestoration: ({ location }) =>
      !(location.pathname === "/" && typeof window !== "undefined" && window.innerWidth < 768),
    defaultPreloadStaleTime: 0,
  });

  return router;
};
