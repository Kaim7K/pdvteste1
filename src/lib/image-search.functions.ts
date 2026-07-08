import { createServerFn } from "@tanstack/react-start";

export type ImageResult = { url: string; thumb: string; source: string; title: string };

async function fetchOpenverse(q: string, page: number): Promise<ImageResult[]> {
  try {
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", q);
    url.searchParams.set("page_size", "12");
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "PDV/1.0 (contato@pdv.local)" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: Array<{ url?: string; thumbnail?: string; foreign_landing_url?: string; title?: string }>;
    };
    return (json.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        url: r.thumbnail || r.url!,
        thumb: r.thumbnail || r.url!,
        source: r.foreign_landing_url || r.url!,
        title: r.title || "",
      }));
  } catch {
    return [];
  }
}

async function fetchWikimedia(q: string, page: number): Promise<ImageResult[]> {
  try {
    const offset = (page - 1) * 12;
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", `${q} filetype:bitmap`);
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", "12");
    url.searchParams.set("gsroffset", String(offset));
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "400");
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { title: string; imageinfo?: Array<{ url: string; thumburl: string; descriptionurl: string }> }> };
    };
    const pages = json.query?.pages ?? {};
    const out: ImageResult[] = [];
    for (const p of Object.values(pages)) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      out.push({
        url: ii.thumburl || ii.url,
        thumb: ii.thumburl || ii.url,
        source: ii.descriptionurl || ii.url,
        title: p.title.replace(/^File:/, ""),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export const searchImages = createServerFn({ method: "GET" })
  .validator((data: { query: string; page?: number }) => data)
  .handler(async ({ data }): Promise<{ results: ImageResult[] }> => {
    const q = data.query.trim();
    if (!q) return { results: [] };
    const page = Math.max(1, data.page ?? 1);

    // Executa em paralelo e combina resultados
    const [ov, wm] = await Promise.all([fetchOpenverse(q, page), fetchWikimedia(q, page)]);

    // Intercala para diversidade
    const results: ImageResult[] = [];
    const max = Math.max(ov.length, wm.length);
    for (let i = 0; i < max; i++) {
      if (ov[i]) results.push(ov[i]);
      if (wm[i]) results.push(wm[i]);
    }
    return { results: results.slice(0, 24) };
  });
