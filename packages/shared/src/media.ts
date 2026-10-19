/**
 * Embeddable video providers for the cause gallery (docs/PLAN.md section 6).
 *
 * Only links that match one of these patterns are accepted as video media.
 * `embedFor` turns a share link into the player URL the cause page iframes.
 */

export interface EmbedProvider {
  /** Stable key stored on `Media.provider`. */
  provider: 'youtube' | 'tiktok' | 'instagram' | 'x' | 'vimeo' | 'twitch';
  label: string;
  /** Hostnames the provider owns, without `www.`. */
  hosts: readonly string[];
  /** Patterns tested against the full URL. The first capture group is the media id. */
  patterns: readonly RegExp[];
  /** Build the player URL for a captured id. */
  embed: (id: string, options: EmbedOptions) => string;
}

export interface EmbedOptions {
  /** Hostname that embeds the player. Twitch refuses to play without it. */
  parent: string;
}

export const DEFAULT_EMBED_PARENT = 'causes.sera.cx';

const YOUTUBE_ID = '([A-Za-z0-9_-]{11})';

export const EMBED_PROVIDERS: readonly EmbedProvider[] = [
  {
    provider: 'youtube',
    label: 'YouTube',
    hosts: ['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    patterns: [
      new RegExp(`^https?://(?:www\\.|m\\.)?youtube(?:-nocookie)?\\.com/watch\\?(?:[^#]*&)?v=${YOUTUBE_ID}`),
      new RegExp(`^https?://(?:www\\.|m\\.)?youtube(?:-nocookie)?\\.com/(?:embed|shorts|live)/${YOUTUBE_ID}`),
      new RegExp(`^https?://youtu\\.be/${YOUTUBE_ID}`),
    ],
    embed: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
  },
  {
    provider: 'tiktok',
    label: 'TikTok',
    hosts: ['tiktok.com'],
    patterns: [/^https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/, /^https?:\/\/(?:www\.)?tiktok\.com\/embed\/v2\/(\d+)/],
    embed: (id) => `https://www.tiktok.com/embed/v2/${id}`,
  },
  {
    provider: 'instagram',
    label: 'Instagram',
    hosts: ['instagram.com'],
    patterns: [/^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.-]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/],
    embed: (id) => `https://www.instagram.com/p/${id}/embed/`,
  },
  {
    provider: 'x',
    label: 'X',
    hosts: ['x.com', 'twitter.com', 'mobile.twitter.com'],
    patterns: [/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(\d+)/],
    embed: (id) => `https://platform.twitter.com/embed/Tweet.html?id=${id}`,
  },
  {
    provider: 'vimeo',
    label: 'Vimeo',
    hosts: ['vimeo.com', 'player.vimeo.com'],
    patterns: [/^https?:\/\/(?:www\.)?vimeo\.com\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d+)/, /^https?:\/\/player\.vimeo\.com\/video\/(\d+)/],
    embed: (id) => `https://player.vimeo.com/video/${id}`,
  },
  {
    provider: 'twitch',
    label: 'Twitch',
    hosts: ['twitch.tv', 'm.twitch.tv', 'clips.twitch.tv'],
    patterns: [
      /^https?:\/\/(?:www\.|m\.)?twitch\.tv\/videos\/(\d+)/,
      /^https?:\/\/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/,
      /^https?:\/\/(?:www\.|m\.)?twitch\.tv\/[A-Za-z0-9_]+\/clip\/([A-Za-z0-9_-]+)/,
      /^https?:\/\/(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})\/?(?:[?#]|$)/,
    ],
    embed: (id, { parent }) => {
      const p = encodeURIComponent(parent);
      if (/^\d+$/.test(id)) return `https://player.twitch.tv/?video=${id}&parent=${p}&autoplay=false`;
      if (/^[A-Za-z0-9_]{3,25}$/.test(id) && !id.includes('-')) {
        return `https://player.twitch.tv/?channel=${id}&parent=${p}&autoplay=false`;
      }
      return `https://clips.twitch.tv/embed?clip=${id}&parent=${p}&autoplay=false`;
    },
  },
];

export interface EmbedResult {
  provider: EmbedProvider['provider'];
  embedUrl: string;
  /** The provider's own id for the item. */
  id: string;
}

/**
 * Match a share link against the provider allowlist. Returns the provider and
 * the player URL, or null when the link is not embeddable. Only http(s) URLs
 * are considered; query strings and fragments are allowed on the input.
 */
export function embedFor(url: string, options: Partial<EmbedOptions> = {}): EmbedResult | null {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const opts: EmbedOptions = { parent: options.parent ?? DEFAULT_EMBED_PARENT };
  for (const provider of EMBED_PROVIDERS) {
    if (!provider.hosts.includes(host)) continue;
    for (const pattern of provider.patterns) {
      const m = pattern.exec(trimmed);
      const id = m?.[1];
      if (id) return { provider: provider.provider, embedUrl: provider.embed(id, opts), id };
    }
  }
  return null;
}

/** True when `url` can be embedded in the gallery. */
export function isEmbeddable(url: string): boolean {
  return embedFor(url) !== null;
}
