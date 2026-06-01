/**
 * Parse a Voyager `/me` response into the bits we need (profile id + name).
 *
 * With the `application/vnd.linkedin.normalized+json+2.1` Accept header, `/me`
 * comes back as `{ data, included }` where `data['*miniProfile']` is a URN
 * reference and the actual miniProfile object lives in `included`. Older/flat
 * shapes are handled too as fallbacks.
 */
export function extractMeProfile(me: any): {
  urnId?: string;
  name?: string;
  entityUrn?: string;
} {
  if (!me || typeof me !== 'object') return {};

  const data = me.data ?? me;
  const included: any[] = Array.isArray(me.included) ? me.included : [];
  const miniProfile = included.find(
    (item) => typeof item?.entityUrn === 'string' && item.entityUrn.includes('fs_miniProfile'),
  );

  const entityUrn: string =
    (typeof data?.entityUrn === 'string' && data.entityUrn) ||
    (typeof data?.['*miniProfile'] === 'string' && data['*miniProfile']) ||
    data?.miniProfile?.entityUrn ||
    miniProfile?.entityUrn ||
    me?.miniProfile?.entityUrn ||
    '';

  const urnId = entityUrn.split(':').pop() || undefined;

  const first = data?.firstName ?? miniProfile?.firstName ?? me?.firstName;
  const last = data?.lastName ?? miniProfile?.lastName ?? me?.lastName;
  const name = [first, last].filter(Boolean).join(' ') || undefined;

  return { urnId, name, entityUrn: entityUrn || undefined };
}
