import { Link } from 'react-router-dom';
import { plainTextExcerpt } from '../lib/markdown';

export function formatStoryDate(value) {
  if (!value) return '';
  const raw = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  return new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// About 200 words a minute, never less than one.
export const minutesToRead = words => Math.max(1, Math.ceil((words || 0) / 200));

// The writer's own excerpt if there is one, otherwise the opening of the article.
export function storySummary(post, length = 160) {
  if (post.excerpt) return post.excerpt;
  return plainTextExcerpt(stripLeadingTitle(post.body_preview || ''), length);
}

// Many posts start with the title as a "# Heading". The page already shows the
// title, so that first line is dropped instead of appearing twice.
export function stripLeadingTitle(md) {
  return (md || '').replace(/^\s*#\s+[^\n]*\n+/, '');
}

export function StoryMeta({ post, words }) {
  return (
    <p className="story-meta">
      <time dateTime={post.published_at}>{formatStoryDate(post.published_at)}</time>
      <span aria-hidden="true">·</span>
      <span>{minutesToRead(words ?? post.word_count)} min read</span>
    </p>
  );
}

export function StoryCover({ post, className = '' }) {
  return (
    <div className={`story-cover ${className}`}>
      {post.cover_path
        ? <img src={post.cover_path} alt="" loading="lazy" />
        : <span className="story-cover__empty nav__name" aria-hidden="true">Scorpio</span>}
    </div>
  );
}

export default function StoryCard({ post }) {
  return (
    <Link to={`/blog/${post.slug}`} className="story-card">
      <StoryCover post={post} />
      <StoryMeta post={post} />
      <h3 className="story-card__title">{post.title}</h3>
      <p className="story-card__summary">{storySummary(post, 140)}</p>
    </Link>
  );
}
