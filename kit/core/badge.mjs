export function badgeParts(v) {
  if (!v) return [];
  const t = v.byTrust ?? {};
  const parts = [];
  if (t.official) parts.push(`✓ ${t.officialPassed ?? t.official}/${t.official} answers verified`);
  const derived = (t.derived ?? 0) + (t.simulator ?? 0) + (t.student ?? 0);
  if (!t.official && derived) parts.push(`✓ ${derived} results derived`);
  else if (!t.official && !derived && v.cases) parts.push(`✓ ${v.passed}/${v.cases} cases verified`);
  if (v.realityChecks) parts.push(`${v.realityChecks} reality checks`);
  if (v.claims?.total) parts.push(`your work: ${v.claims.right}/${v.claims.total} right`);
  return parts;
}

export const badgeText = (v) => badgeParts(v).join(" · ");
