import { describe, expect, it } from 'vitest';

import { DEFAULT_EMBED_PARENT, EMBED_PROVIDERS, embedFor, isEmbeddable } from '../src/media.js';

describe('EMBED_PROVIDERS', () => {
  it('covers the six allowed providers', () => {
    expect(EMBED_PROVIDERS.map((p) => p.provider)).toEqual(['youtube', 'tiktok', 'instagram', 'x', 'vimeo', 'twitch']);
  });
});

describe('embedFor', () => {
  it('YouTube: watch, short link, shorts and live', () => {
    const want = { provider: 'youtube', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' };
    expect(embedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toEqual(want);
    expect(embedFor('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toEqual(want);
    expect(embedFor('https://youtu.be/dQw4w9WgXcQ?si=abc')).toEqual(want);
    expect(embedFor('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual(want);
    expect(embedFor('https://www.youtube.com/live/dQw4w9WgXcQ')).toEqual(want);
  });

  it('TikTok, Instagram, X and Vimeo', () => {
    expect(embedFor('https://www.tiktok.com/@kasih.turtles/video/7301234567890123456')).toEqual({
      provider: 'tiktok',
      embedUrl: 'https://www.tiktok.com/embed/v2/7301234567890123456',
      id: '7301234567890123456',
    });
    expect(embedFor('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz')).toEqual({
      provider: 'instagram',
      embedUrl: 'https://www.instagram.com/p/C1a2B3c4D5e/embed/',
      id: 'C1a2B3c4D5e',
    });
    expect(embedFor('https://instagram.com/p/C1a2B3c4D5e')?.provider).toBe('instagram');
    expect(embedFor('https://x.com/seracx/status/1812345678901234567')).toEqual({
      provider: 'x',
      embedUrl: 'https://platform.twitter.com/embed/Tweet.html?id=1812345678901234567',
      id: '1812345678901234567',
    });
    expect(embedFor('https://twitter.com/seracx/status/1812345678901234567')?.provider).toBe('x');
    expect(embedFor('https://vimeo.com/123456789')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/123456789',
      id: '123456789',
    });
  });

  it('Twitch videos, clips and channels carry the parent host', () => {
    expect(embedFor('https://www.twitch.tv/videos/1234567890')).toEqual({
      provider: 'twitch',
      embedUrl: `https://player.twitch.tv/?video=1234567890&parent=${DEFAULT_EMBED_PARENT}&autoplay=false`,
      id: '1234567890',
    });
    expect(embedFor('https://www.twitch.tv/kasihturtles', { parent: 'localhost' })?.embedUrl).toBe(
      'https://player.twitch.tv/?channel=kasihturtles&parent=localhost&autoplay=false',
    );
    expect(embedFor('https://clips.twitch.tv/FunnyClip-abc123')?.embedUrl).toContain('clips.twitch.tv/embed?clip=FunnyClip-abc123');
  });

  it('returns null for anything off the allowlist', () => {
    expect(embedFor('https://example.org/video.mp4')).toBeNull();
    expect(embedFor('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(embedFor('https://evil.example/https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(embedFor('https://www.youtube.com/channel/UCabc')).toBeNull();
    expect(embedFor('javascript:alert(1)')).toBeNull();
    expect(embedFor('not a url')).toBeNull();
    expect(isEmbeddable('https://vimeo.com/123')).toBe(true);
    expect(isEmbeddable('https://vimeo.com/about')).toBe(false);
  });
});
