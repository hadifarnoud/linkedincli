/**
 * Voyager response summarizers.
 *
 * Voyager responses use a nested `{data, included}` shape: many fields hold URN
 * strings that resolve to records in `included`. The helpers here build a URN
 * index once per call and walk the structure conservatively — when a field is
 * uncertain we omit it rather than guess wrong.
 */

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function extractActivityId(urn: string | undefined): string | undefined {
  if (!urn) return undefined;
  const m = urn.match(/urn:li:activity:(\d+)/);
  return m ? m[1] : undefined;
}

function buildIncludedIndex(payload: unknown): Map<string, Json> {
  const idx = new Map<string, Json>();
  if (!isObject(payload)) return idx;
  const included = asArray(payload.included);
  for (const entry of included) {
    if (!isObject(entry)) continue;
    const urn = asString(entry.entityUrn) ?? asString(entry.objectUrn);
    if (urn) idx.set(urn, entry);
  }
  return idx;
}

function resolve(idx: Map<string, Json>, ref: unknown): Json | undefined {
  if (typeof ref !== 'string') return undefined;
  return idx.get(ref);
}

/**
 * Voyager list payloads put items in `elements` in one of three shapes:
 * a direct object, a `{value: "urn:..."}` wrapper, or a bare URN string.
 * Resolve any of those to the underlying record (looking up `included`
 * for the URN cases) so summarizers don't silently drop ref-style items.
 */
function resolveElement(idx: Map<string, Json>, el: unknown): Json | undefined {
  if (typeof el === 'string') {
    return resolve(idx, el);
  }
  if (!isObject(el)) return undefined;
  if (typeof el.value === 'string') {
    return resolve(idx, el.value) ?? el;
  }
  if (isObject(el.value)) {
    return el.value as Json;
  }
  return el;
}

function pickText(entry: Json | undefined): string | undefined {
  if (!entry) return undefined;
  const text = entry.text;
  if (typeof text === 'string') return text;
  if (isObject(text) && typeof text.text === 'string') return text.text as string;
  const commentary = entry.commentary;
  if (isObject(commentary)) {
    if (typeof commentary.text === 'string') return commentary.text as string;
    const ct = commentary.text;
    if (isObject(ct) && typeof ct.text === 'string') return ct.text as string;
  }
  return undefined;
}

interface AuthorSummary {
  name?: string;
  public_id?: string;
  urn?: string;
}

function summarizeProfileEntity(entry: Json | undefined): AuthorSummary | undefined {
  if (!entry) return undefined;
  const first = asString(entry.firstName) ?? '';
  const last = asString(entry.lastName) ?? '';
  const fullName = asString(entry.name) ?? `${first} ${last}`.trim();
  const out: AuthorSummary = {};
  if (fullName) out.name = fullName;
  const publicId = asString(entry.publicIdentifier);
  if (publicId) out.public_id = publicId;
  const urn = asString(entry.entityUrn) ?? asString(entry.objectUrn);
  if (urn) out.urn = urn;
  return Object.keys(out).length > 0 ? out : undefined;
}

function summarizeCompanyEntity(entry: Json | undefined): AuthorSummary | undefined {
  if (!entry) return undefined;
  const out: AuthorSummary = {};
  const name = asString(entry.name);
  if (name) out.name = name;
  const universalName = asString(entry.universalName);
  if (universalName) out.public_id = universalName;
  const urn = asString(entry.entityUrn) ?? asString(entry.objectUrn);
  if (urn) out.urn = urn;
  return Object.keys(out).length > 0 ? out : undefined;
}

function summarizeAuthor(idx: Map<string, Json>, actorOrRef: unknown): AuthorSummary | undefined {
  if (typeof actorOrRef === 'string') {
    const entry = resolve(idx, actorOrRef);
    if (!entry) return undefined;
    const isCompany = actorOrRef.startsWith('urn:li:fsd_company') ||
      actorOrRef.startsWith('urn:li:company');
    return isCompany ? summarizeCompanyEntity(entry) : summarizeProfileEntity(entry);
  }
  if (!isObject(actorOrRef)) return undefined;
  const out: AuthorSummary = {};
  const rawName = actorOrRef.name;
  const name = asString(rawName) ?? (isObject(rawName) ? asString(rawName.text) : undefined);
  if (name) out.name = name;
  const urn = asString(actorOrRef.urn);
  if (urn) out.urn = urn;

  const actorImageRef = asString(actorOrRef.image);
  if (actorImageRef) {
    const profileRef = resolve(idx, actorImageRef);
    const resolved = summarizeProfileEntity(profileRef) ?? summarizeCompanyEntity(profileRef);
    if (resolved) {
      if (resolved.public_id) out.public_id = resolved.public_id;
      if (!out.urn && resolved.urn) out.urn = resolved.urn;
      if (!out.name && resolved.name) out.name = resolved.name;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function summarizeMedia(content: unknown): unknown[] {
  if (!isObject(content)) return [];
  const out: unknown[] = [];
  for (const [key, value] of Object.entries(content)) {
    const k = key.toLowerCase();
    if (k.includes('image') && isObject(value)) out.push({ type: 'image' });
    if (k.includes('video') && isObject(value)) out.push({ type: 'video' });
    if (k.includes('article') && isObject(value)) {
      const navCtx = value.navigationContext;
      let url: string | undefined;
      if (isObject(navCtx)) url = asString(navCtx.actionTarget);
      out.push({ type: 'article', url });
    }
    if (k.includes('document') && isObject(value)) out.push({ type: 'document' });
  }
  return out;
}

interface PostSummary {
  activity_urn?: string;
  activity_id?: string;
  share_urn?: string;
  author?: AuthorSummary;
  text?: string;
  posted_at?: number;
  reactions_count?: number;
  comments_count?: number;
  media?: unknown[];
}

function summarizePostElement(idx: Map<string, Json>, element: Json): PostSummary {
  const out: PostSummary = {};
  const meta = isObject(element.updateMetadata) ? (element.updateMetadata as Json) : undefined;

  const activityUrn = asString(element.entityUrn) ?? asString(meta?.urn);
  if (activityUrn) {
    out.activity_urn = activityUrn;
    const id = extractActivityId(activityUrn);
    if (id) out.activity_id = id;
  }

  const shareUrn = asString(element.preDashEntityUrn) ?? asString(meta?.shareUrn);
  if (shareUrn) out.share_urn = shareUrn;

  const author = summarizeAuthor(idx, element.actor);
  if (author) out.author = author;

  const commentary = element.commentary;
  const text = pickText(isObject(commentary) ? commentary : element);
  if (typeof text === 'string') out.text = text;

  const createdAt = asNumber(element.createdAt) ?? asNumber(meta?.createdAt);
  if (createdAt !== undefined) out.posted_at = createdAt;

  const social = element.socialDetail ?? element.socialContent;
  if (isObject(social)) {
    const counts = isObject(social.totalSocialActivityCounts)
      ? (social.totalSocialActivityCounts as Json)
      : isObject(social.socialActivityCounts)
        ? (social.socialActivityCounts as Json)
        : social;
    const reactions = asNumber(counts.numLikes) ?? asNumber(counts.reactionsCount) ?? asNumber(counts.numReactions);
    if (reactions !== undefined) out.reactions_count = reactions;
    const comments = asNumber(counts.numComments) ?? asNumber(counts.commentsCount);
    if (comments !== undefined) out.comments_count = comments;
  }

  const media = summarizeMedia(element.content);
  if (media.length > 0) out.media = media;

  return out;
}

export function summarizePostsList(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const idx = buildIncludedIndex(raw);
  const elements = asArray(raw.elements);

  const items: PostSummary[] = [];
  for (const el of elements) {
    const target = resolveElement(idx, el);
    if (!target) continue;
    items.push(summarizePostElement(idx, target));
  }

  const out: Json = { items };
  if (raw.paging !== undefined) out.paging = raw.paging;
  return out;
}

interface CommentSummary {
  comment_urn?: string;
  author?: AuthorSummary;
  text?: string;
  created_at?: number;
  reactions_count?: number;
  reply_count?: number;
}

function summarizeCommentElement(idx: Map<string, Json>, element: Json): CommentSummary {
  const out: CommentSummary = {};
  const urn = asString(element.entityUrn) ?? asString(element.urn);
  if (urn) out.comment_urn = urn;

  const author = summarizeAuthor(idx, element.commenter);
  if (author) out.author = author;

  const text = pickText(element);
  if (typeof text === 'string') out.text = text;

  const createdAt = asNumber(element.createdAt) ?? asNumber(element.createdTime);
  if (createdAt !== undefined) out.created_at = createdAt;

  const social = element.socialDetail;
  if (isObject(social)) {
    const counts = isObject(social.totalSocialActivityCounts)
      ? (social.totalSocialActivityCounts as Json)
      : social;
    const r = asNumber(counts.numLikes) ?? asNumber(counts.numReactions);
    if (r !== undefined) out.reactions_count = r;
    const replies = asNumber(counts.numComments);
    if (replies !== undefined) out.reply_count = replies;
  }
  const replyCount = asNumber(element.totalReplies);
  if (replyCount !== undefined) out.reply_count = replyCount;
  return out;
}

export function summarizeCommentsList(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const idx = buildIncludedIndex(raw);
  const elements = asArray(raw.elements);
  const items: CommentSummary[] = [];
  for (const el of elements) {
    const target = resolveElement(idx, el);
    if (!target) continue;
    items.push(summarizeCommentElement(idx, target));
  }
  const out: Json = { items };
  if (raw.paging !== undefined) out.paging = raw.paging;
  return out;
}

interface ReactionSummary {
  reactor?: AuthorSummary;
  reaction_type?: string;
  created_at?: number;
}

function summarizeReactionElement(idx: Map<string, Json>, element: Json): ReactionSummary {
  const out: ReactionSummary = {};
  const reactor = element.reactorLockup ?? element.reactor ?? element.actor;
  const author = summarizeAuthor(idx, reactor);
  if (author) out.reactor = author;

  const rtype = asString(element.reactionType) ?? asString(element.type);
  if (rtype) out.reaction_type = rtype;

  const createdAt = asNumber(element.createdAt) ?? asNumber(element.lastModifiedTime);
  if (createdAt !== undefined) out.created_at = createdAt;
  return out;
}

export function summarizeReactionsList(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const idx = buildIncludedIndex(raw);
  const elements = asArray(raw.elements);
  const items: ReactionSummary[] = [];
  for (const el of elements) {
    const target = resolveElement(idx, el);
    if (!target) continue;
    items.push(summarizeReactionElement(idx, target));
  }
  const out: Json = { items };
  if (raw.paging !== undefined) out.paging = raw.paging;
  return out;
}
