const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const TITLE_LIMIT = 4;
const CACHE_TTL_MS = 15 * 60 * 1000;
const PROVIDER_LIMIT = 4;

export interface TmdbProvider {
  id: number;
  name: string;
  logoUrl: string;
}

export interface TmdbTitle {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  rating: number | null;
  posterUrl: string | null;
  tmdbUrl: string;
  watchLink: string | null;
  providers: TmdbProvider[];
}

export interface TmdbPersonEnrichment {
  id: number;
  name: string;
  tmdbUrl: string;
  region: string;
  titles: TmdbTitle[];
  attribution: string;
}

interface CacheEntry {
  expiresAt: number;
  value: TmdbPersonEnrichment | null;
}

const cache = new Map<string, CacheEntry>();

function apiKey(): string | null {
  const key = process.env.TMDB_API_KEY?.trim();
  return key || null;
}

export function isTmdbConfigured(): boolean {
  return Boolean(apiKey());
}

/** App language → JustWatch/TMDB watch region (1B). */
export function regionForLang(lang: string): string {
  return lang.toLowerCase().startsWith("pt") ? "BR" : "US";
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    console.warn(`TMDB ${path} → ${res.status}`);
    return null;
  }

  return (await res.json()) as T;
}

function yearFromDate(date?: string | null): string | null {
  if (!date || date.length < 4) return null;
  return date.slice(0, 4);
}

function scoreCredit(c: {
  order?: number;
  popularity?: number;
  vote_count?: number;
  vote_average?: number;
  character?: string;
}): number {
  const order = typeof c.order === "number" ? c.order : 99;
  const popularity = c.popularity ?? 0;
  const votes = c.vote_count ?? 0;
  const rating = c.vote_average ?? 0;
  // Prefer billed cast + popular / rated titles
  return popularity * 2 + votes * 0.02 + rating * 3 - order * 4;
}

function providersFromResponse(
  data: {
    results?: Record<
      string,
      {
        link?: string;
        flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        rent?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        buy?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      }
    >;
  } | null,
  region: string
): { providers: TmdbProvider[]; watchLink: string | null } {
  const local = data?.results?.[region];
  if (!local) return { providers: [], watchLink: null };

  const seen = new Set<number>();
  const out: TmdbProvider[] = [];

  for (const list of [local.flatrate, local.rent, local.buy]) {
    if (!list) continue;
    for (const p of list) {
      if (seen.has(p.provider_id) || !p.logo_path) continue;
      seen.add(p.provider_id);
      out.push({
        id: p.provider_id,
        name: p.provider_name,
        logoUrl: `${IMAGE_BASE}/w45${p.logo_path}`,
      });
      if (out.length >= PROVIDER_LIMIT) break;
    }
    if (out.length >= PROVIDER_LIMIT) break;
  }

  return {
    providers: out,
    watchLink: typeof local.link === "string" ? local.link : null,
  };
}

async function watchProviders(
  mediaType: "movie" | "tv",
  id: number,
  region: string
): Promise<{ providers: TmdbProvider[]; watchLink: string | null }> {
  const data = await tmdbFetch<{
    results?: Record<
      string,
      {
        link?: string;
        flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        rent?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
        buy?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      }
    >;
  }>(`/${mediaType}/${id}/watch/providers`);
  return providersFromResponse(data, region);
}

function isActingPerson(person: {
  known_for_department?: string;
  known_for?: Array<{ media_type?: string }>;
}): boolean {
  const dept = (person.known_for_department ?? "").toLowerCase();
  if (dept === "acting") return true;
  // Some people omit department but are clearly performers in search results
  if (!dept && (person.known_for?.length ?? 0) > 0) return true;
  return false;
}

/**
 * Resolve an actor/actress by name and return top titles + regional watch providers.
 * Returns null when TMDB is not configured, no match, or the person is not an actor.
 */
export async function enrichActorFromTmdb(
  name: string,
  lang: string
): Promise<TmdbPersonEnrichment | null> {
  const trimmed = name.trim();
  if (!trimmed || !apiKey()) return null;

  const region = regionForLang(lang);
  const cacheKey = `${trimmed.toLowerCase()}|${region}|${lang.slice(0, 2)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const language = lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US";

  const search = await tmdbFetch<{
    results?: Array<{
      id: number;
      name: string;
      known_for_department?: string;
      popularity?: number;
      known_for?: Array<{ media_type?: string }>;
    }>;
  }>("/search/person", { query: trimmed, language });

  const candidates = (search?.results ?? [])
    .filter(isActingPerson)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  const person = candidates[0];
  if (!person) {
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }

  const credits = await tmdbFetch<{
    cast?: Array<{
      id: number;
      media_type?: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      vote_average?: number;
      vote_count?: number;
      popularity?: number;
      poster_path?: string | null;
      order?: number;
      character?: string;
      episode_count?: number;
    }>;
  }>(`/person/${person.id}/combined_credits`, { language });

  const cast = (credits?.cast ?? [])
    .filter((c) => c.media_type === "movie" || c.media_type === "tv")
    .filter((c) => (c.vote_count ?? 0) >= 20 || (c.popularity ?? 0) >= 8)
    .sort((a, b) => scoreCredit(b) - scoreCredit(a));

  const picked: typeof cast = [];
  const seenIds = new Set<string>();
  for (const c of cast) {
    const key = `${c.media_type}:${c.id}`;
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    picked.push(c);
    if (picked.length >= TITLE_LIMIT) break;
  }

  const titles: TmdbTitle[] = await Promise.all(
    picked.map(async (c) => {
      const mediaType = c.media_type === "tv" ? "tv" : "movie";
      const title = (mediaType === "tv" ? c.name : c.title) ?? "Untitled";
      const year = yearFromDate(
        mediaType === "tv" ? c.first_air_date : c.release_date
      );
      const { providers, watchLink } = await watchProviders(mediaType, c.id, region);
      return {
        id: c.id,
        mediaType,
        title,
        year,
        rating:
          typeof c.vote_average === "number" && c.vote_average > 0
            ? Math.round(c.vote_average * 10) / 10
            : null,
        posterUrl: c.poster_path ? `${IMAGE_BASE}/w92${c.poster_path}` : null,
        tmdbUrl: `https://www.themoviedb.org/${mediaType}/${c.id}`,
        watchLink,
        providers,
      };
    })
  );

  const value: TmdbPersonEnrichment = {
    id: person.id,
    name: person.name,
    tmdbUrl: `https://www.themoviedb.org/person/${person.id}`,
    region,
    titles,
    attribution: "TMDB",
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export interface TmdbTitleHit {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  posterUrl: string | null;
  overview: string | null;
  seasonCount: number | null;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string | null;
  profileUrl: string | null;
  order: number;
  tmdbUrl: string;
}

function tmdbLanguage(lang: string): string {
  return lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US";
}

/** Search movies and TV by title (for cast fallback after failed face ID). */
export async function searchTmdbTitles(
  query: string,
  lang: string,
  limit = 8
): Promise<TmdbTitleHit[]> {
  const trimmed = query.trim();
  if (!trimmed || !apiKey()) return [];

  const language = tmdbLanguage(lang);
  const data = await tmdbFetch<{
    results?: Array<{
      id: number;
      media_type?: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      overview?: string;
      popularity?: number;
    }>;
  }>("/search/multi", { query: trimmed, language, include_adult: "false" });

  const hits = (data?.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit);

  const out: TmdbTitleHit[] = [];
  for (const r of hits) {
    const mediaType = r.media_type === "tv" ? "tv" : "movie";
    let seasonCount: number | null = null;
    if (mediaType === "tv") {
      const detail = await tmdbFetch<{ number_of_seasons?: number }>(
        `/tv/${r.id}`,
        { language }
      );
      seasonCount =
        typeof detail?.number_of_seasons === "number"
          ? detail.number_of_seasons
          : null;
    }
    out.push({
      id: r.id,
      mediaType,
      title: (mediaType === "tv" ? r.name : r.title) ?? "Untitled",
      year: yearFromDate(
        mediaType === "tv" ? r.first_air_date : r.release_date
      ),
      posterUrl: r.poster_path ? `${IMAGE_BASE}/w92${r.poster_path}` : null,
      overview: r.overview?.trim() ? r.overview.trim() : null,
      seasonCount,
    });
  }
  return out;
}

function mapCastMembers(
  cast: Array<{
    id: number;
    name?: string;
    character?: string;
    profile_path?: string | null;
    order?: number;
  }>
): TmdbCastMember[] {
  return cast
    .filter((c) => Boolean(c.name?.trim()))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 60)
    .map((c) => ({
      id: c.id,
      name: c.name!.trim(),
      character: c.character?.trim() ? c.character.trim() : null,
      profileUrl: c.profile_path
        ? `${IMAGE_BASE}/w185${c.profile_path}`
        : null,
      order: typeof c.order === "number" ? c.order : 999,
      tmdbUrl: `https://www.themoviedb.org/person/${c.id}`,
    }));
}

/** Movie billed cast. */
export async function fetchMovieCast(
  movieId: number,
  lang: string
): Promise<TmdbCastMember[]> {
  if (!apiKey() || !Number.isFinite(movieId) || movieId <= 0) return [];
  const language = tmdbLanguage(lang);
  const data = await tmdbFetch<{
    cast?: Array<{
      id: number;
      name?: string;
      character?: string;
      profile_path?: string | null;
      order?: number;
    }>;
  }>(`/movie/${movieId}/credits`, { language });
  return mapCastMembers(data?.cast ?? []);
}

/**
 * TV cast for a season (preferred for novelas / series).
 * Falls back to series-level credits if season credits are empty.
 */
export async function fetchTvCast(
  tvId: number,
  season: number,
  lang: string
): Promise<TmdbCastMember[]> {
  if (!apiKey() || !Number.isFinite(tvId) || tvId <= 0) return [];
  const language = tmdbLanguage(lang);
  const seasonNum = Math.max(1, Math.floor(season || 1));

  const seasonCredits = await tmdbFetch<{
    cast?: Array<{
      id: number;
      name?: string;
      character?: string;
      profile_path?: string | null;
      order?: number;
    }>;
  }>(`/tv/${tvId}/season/${seasonNum}/credits`, { language });

  const seasonCast = mapCastMembers(seasonCredits?.cast ?? []);
  if (seasonCast.length > 0) return seasonCast;

  const seriesCredits = await tmdbFetch<{
    cast?: Array<{
      id: number;
      name?: string;
      character?: string;
      profile_path?: string | null;
      order?: number;
    }>;
  }>(`/tv/${tvId}/credits`, { language });
  return mapCastMembers(seriesCredits?.cast ?? []);
}
