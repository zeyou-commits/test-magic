// Veille : le texte d'un article, pour que Claude y trouve les horaires (pas seulement le titre).

const USER_AGENT = "Mozilla/5.0 (compatible; BledWay-Veille/1.1; +https://www.bledway.com)";

const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&lsquo;|&#8217;|&#8216;/g, "'")
    .replace(/&laquo;|&#171;/g, "«")
    .replace(/&raquo;|&#187;/g, "»")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&ccedil;/g, "ç")
    .replace(/&ecirc;/g, "ê")
    .replace(/&ocirc;/g, "ô")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/g, " ");

/** Le texte lisible d'une page : ses paragraphes, dans l'ordre. */
export function articleText(html: string, limit = 5000) {
  const clean = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const paragraphs = [...clean.matchAll(/<(p|h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => decodeEntities(match[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 30);
  const text = [...new Set(paragraphs)].join("\n");
  return text.slice(0, limit);
}

/** Un lien Google Actualités cache l'adresse de l'article : on la demande à Google, comme son lecteur. */
async function resolveGoogleNews(url: string, signal: AbortSignal) {
  const id = url.match(/\/articles\/([^?/]+)/)?.[1];
  if (!id) return null;
  const page = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal });
  const html = await page.text();
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  if (!ts || !sg) return null;
  const inner = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    Number(ts),
    sg,
  ]);
  const response = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": USER_AGENT },
    body: `f.req=${encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]]))}`,
    signal,
  });
  const body = await response.text();
  const found = body.match(/https?:\/\/[^\\"]+/g)?.find((link) => !link.includes("google.com"));
  return found ?? null;
}

/** L'adresse réelle et le texte de l'article ; null si la page ne se lit pas (on garde alors le titre). */
export async function readArticle(url: string): Promise<{ url: string; text: string } | null> {
  const signal = AbortSignal.timeout(12_000);
  try {
    const real = url.includes("news.google.com") ? await resolveGoogleNews(url, signal) : url;
    if (!real) return null;
    const response = await fetch(real, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      redirect: "follow",
      signal,
    });
    if (!response.ok) return null;
    const text = articleText(await response.text());
    return text.length > 80 ? { url: response.url || real, text } : null;
  } catch {
    return null;
  }
}
