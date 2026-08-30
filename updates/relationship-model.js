/** Resolve authored relationship intent against one exact public project pool. */

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
      .map((item) => [item.key, index.get(item[field]).key]),
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
  const index = new Map(updates.map((update) => [update.key, update]));
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
          code: 'duplicate', source: update.key, kind: field, target: duplicates[0],
          location: `metadata.${field}`,
          message: `${field} contains duplicate targets: ${[...new Set(duplicates)].join(', ')}`,
        });
      }
      for (const target of targets) {
        const previous = seen.get(target);
        if (previous && previous !== field) {
          errors.push({
            code: 'overlap', source: update.key, kind: field, target,
            location: `metadata.${field}`,
            message: `Relationship target "${target}" must not be both ${previous} and ${field}`,
          });
        } else {
          seen.set(target, field);
        }
        const resolved = index.get(target) || null;
        if (resolved === update || target === update.key) {
          errors.push({
            code: 'self', source: update.key, kind: field, target,
            location: `metadata.${field}`,
            message: `${field} cannot reference itself`,
          });
        }
        resolutions.push({
          source: update.key,
          source_type: 'update',
          kind: field,
          target,
          location: `metadata.${field}`,
          status: resolved ? 'resolved' : 'pending',
        });
        if (!resolved) continue;
        if (field === 'part_of') append(parts, resolved.key, update);
        if (field === 'supersedes') append(supersededBy, resolved.key, update);
        if (field === 'related_to') append(relatedFrom, resolved.key, update);
      }
    }
  }

  for (const [field, policy] of Object.entries(metadata)) {
    if (policy.acyclic) errors.push(...findCycles(updates, field, index));
  }

  for (const update of updates) {
    const partOf = update.part_of ? index.get(update.part_of) : null;
    const supersedes = update.supersedes ? index.get(update.supersedes) : null;
    const directRelated = (update.related_to || []).map((documentId) => index.get(documentId)).filter(Boolean);
    const inverseRelated = relatedFrom.get(update.key) || [];
    const related = [...new Map(
      [...directRelated, ...inverseRelated].map((item) => [item.key, item]),
    ).values()];
    let latest = update;
    const visited = new Set([update.key]);
    while ((supersededBy.get(latest.key) || []).length) {
      const next = [...supersededBy.get(latest.key)]
        .sort((left, right) => new Date(right.date) - new Date(left.date))[0];
      if (visited.has(next.key)) break;
      visited.add(next.key);
      latest = next;
    }
    update.relationships = {
      ...(partOf ? { part_of: partOf.key } : {}),
      ...(supersedes ? { supersedes: supersedes.key } : {}),
      parts: (parts.get(update.key) || [])
        .sort((left, right) => new Date(right.date) - new Date(left.date))
        .map((item) => item.key),
      superseded_by: (supersededBy.get(update.key) || [])
        .sort((left, right) => new Date(right.date) - new Date(left.date))
        .map((item) => item.key),
      related: related.map((item) => item.key),
      ...(latest.key !== update.key ? { latest: latest.key } : {}),
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
