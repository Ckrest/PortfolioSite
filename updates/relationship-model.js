/** Resolve authored relationship intent against one exact public project pool. */

function relationCard(update) {
  return update ? {
    slug: update.slug,
    folder: update.folder,
    title: update.title,
    summary: update.summary,
    date: update.date,
    prominence: update.prominence,
  } : null;
}

function declaredTargets(update, field, policy) {
  const value = update[field];
  if (policy.cardinality === 'many') return Array.isArray(value) ? value : [];
  return value ? [value] : [];
}

function append(map, key, value) {
  map.set(key, [...(map.get(key) || []), value]);
}

function findCycles(updates, field, index) {
  const edges = new Map(
    updates
      .filter((item) => item[field] && index.has(item[field]))
      .map((item) => [item.slug, index.get(item[field]).slug]),
  );
  const errors = [];
  for (const start of edges.keys()) {
    const seen = new Set();
    let current = start;
    while (edges.has(current)) {
      if (seen.has(current)) {
        errors.push({
          code: 'cycle', source: start, kind: field, target: current,
          location: `metadata.${field}`,
          message: `${field} contains a cycle through "${current}"`,
        });
        break;
      }
      seen.add(current);
      current = edges.get(current);
    }
  }
  return errors;
}

export function resolveUpdateRelationships(updates, contract) {
  const metadata = contract?.metadata || {};
  const errors = [];
  const index = new Map();
  for (const update of updates) {
    for (const identity of new Set([update.slug, update.folder])) {
      const existing = index.get(identity);
      if (existing && existing !== update) {
        errors.push({
          code: 'identity-collision', source: update.slug, kind: 'identity', target: identity,
          location: 'metadata.slug',
          message: `Identity "${identity}" is already used by ${existing.slug}`,
        });
      } else {
        index.set(identity, update);
      }
    }
  }
  const resolutions = [];
  const parts = new Map();
  const supersededBy = new Map();
  const relatedFrom = new Map();

  for (const update of updates) {
    const seen = new Map();
    for (const [field, policy] of Object.entries(metadata)) {
      const targets = declaredTargets(update, field, policy);
      const duplicates = targets.filter((target, position) => targets.indexOf(target) !== position);
      if (duplicates.length) {
        errors.push({
          code: 'duplicate', source: update.slug, kind: field, target: duplicates[0],
          location: `metadata.${field}`,
          message: `${field} contains duplicate targets: ${[...new Set(duplicates)].join(', ')}`,
        });
      }
      for (const target of targets) {
        const previous = seen.get(target);
        if (previous && previous !== field) {
          errors.push({
            code: 'overlap', source: update.slug, kind: field, target,
            location: `metadata.${field}`,
            message: `Relationship target "${target}" must not be both ${previous} and ${field}`,
          });
        } else {
          seen.set(target, field);
        }
        const resolved = index.get(target) || null;
        if (resolved === update || target === update.slug || target === update.folder) {
          errors.push({
            code: 'self', source: update.slug, kind: field, target,
            location: `metadata.${field}`,
            message: `${field} cannot reference itself`,
          });
        }
        resolutions.push({
          source: update.slug,
          source_type: 'update',
          kind: field,
          target,
          location: `metadata.${field}`,
          status: resolved ? 'resolved' : 'pending',
        });
        if (!resolved) continue;
        if (field === 'part_of') append(parts, resolved.slug, update);
        if (field === 'supersedes') append(supersededBy, resolved.slug, update);
        if (field === 'related_to') append(relatedFrom, resolved.slug, update);
      }
    }
  }

  for (const [field, policy] of Object.entries(metadata)) {
    if (policy.acyclic) errors.push(...findCycles(updates, field, index));
  }

  for (const update of updates) {
    const partOf = update.part_of ? index.get(update.part_of) : null;
    const supersedes = update.supersedes ? index.get(update.supersedes) : null;
    const directRelated = (update.related_to || []).map((slug) => index.get(slug)).filter(Boolean);
    const inverseRelated = relatedFrom.get(update.slug) || [];
    const related = [...new Map(
      [...directRelated, ...inverseRelated].map((item) => [item.slug, item]),
    ).values()];
    let latest = update;
    const visited = new Set([update.slug]);
    while ((supersededBy.get(latest.slug) || []).length) {
      const next = [...supersededBy.get(latest.slug)]
        .sort((left, right) => new Date(right.date) - new Date(left.date))[0];
      if (visited.has(next.slug)) break;
      visited.add(next.slug);
      latest = next;
    }
    update.relationships = {
      ...(partOf ? { part_of: relationCard(partOf) } : {}),
      ...(supersedes ? { supersedes: relationCard(supersedes) } : {}),
      parts: (parts.get(update.slug) || [])
        .sort((left, right) => new Date(right.date) - new Date(left.date))
        .map(relationCard),
      superseded_by: (supersededBy.get(update.slug) || [])
        .sort((left, right) => new Date(right.date) - new Date(left.date))
        .map(relationCard),
      related: related.map(relationCard),
      ...(latest.slug !== update.slug ? { latest: relationCard(latest) } : {}),
    };
  }

  const uniqueErrors = [...new Map(errors.map(error => [
    [error.code, error.source, error.kind, error.target, error.location].join('\u0000'), error,
  ])).values()];
  return { errors: uniqueErrors, resolutions };
}

export function referenceResolution(sourceType, source, kind, target, location, index) {
  return {
    source,
    source_type: sourceType,
    kind,
    target,
    location,
    status: index.has(target) ? 'resolved' : 'pending',
  };
}
