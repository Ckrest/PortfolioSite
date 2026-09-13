/** Canonical portfolio connections. Pages expose views; connections own intent. */
import { getBlockContract } from '../updates/generated/block-registry.js';
import { chronological, documentKind } from './document-model.js';

import { RELATIONSHIP_CONTRACT } from './generated/relationship-contract.js';
export const CONNECTION_KINDS = Object.freeze(RELATIONSHIP_CONTRACT.connections);
export const CONNECTION_FIELDS = Object.freeze(['projects', 'items', 'capabilities', 'evidence']);

export function connectionIdentity(value) {
  const { kind } = value || {};
  let { source, target } = value || {};
  const policy = CONNECTION_KINDS[kind];
  if (!policy || !/^doc_[a-f0-9]{32}$/.test(source) || !/^doc_[a-f0-9]{32}$/.test(target)) throw new Error('Connection requires a supported kind and stable page IDs');
  if (source === target) throw new Error('A connection cannot target its own page');
  if (value.origin && ![source, target].includes(value.origin)) throw new Error('Connection origin must be one of its endpoints');
  if (policy.symmetric && source > target) [source, target] = [target, source];
  return { id: `${kind}:${source}:${target}`, kind, source, target };
}

export function connectionForSelection(page, field, target) {
  const direct = Object.entries(CONNECTION_KINDS).find(([, policy]) => policy.field === field);
  if (direct) return connectionIdentity({ kind: direct[0], source: page, target });
  const inverse = Object.entries(CONNECTION_KINDS).find(([, policy]) => policy.inverse === field);
  if (!inverse) throw new Error(`Unknown connection selection: ${field}`);
  return connectionIdentity({ kind: inverse[0], source: target, target: page });
}

export function overlaySelections(page, edges, values) {
  const proposed = new Map(edges.map(edge => [edge.id, { ...edge }]));
  const before = connectionSelections(page, edges);
  for (const field of CONNECTION_FIELDS.filter(field => Object.hasOwn(values, field))) {
    const left = Array.isArray(before[field]) ? before[field] : before[field] ? [before[field]] : [];
    const right = Array.isArray(values[field]) ? values[field] : values[field] ? [values[field]] : [];
    for (const target of new Set([...left, ...right])) {
      const edge = connectionForSelection(page, field, target);
      proposed.set(edge.id, { ...proposed.get(edge.id), ...edge, origin: proposed.get(edge.id)?.origin || page, present: right.includes(target) });
    }
  }
  return [...proposed.values()];
}

export function applyConnectionViews(documents, views) {
  for (const page of documents) {
    const view = views[page.key] || {};
    page.connections = { ...view };
  }
}

/** Views include pending/inactive intent for authoring. Public projections use resolved edges only. */
export function connectionSelections(page, edges) {
  const view = {};
  for (const edge of edges) {
    if (edge.present === false || edge.present === 0) continue;
    const policy = CONNECTION_KINDS[edge.kind];
    if (!policy) throw new Error(`Unknown connection kind: ${edge.kind}`);
    const field = edge.source === page ? policy.field : edge.target === page ? policy.inverse : null;
    if (!field) continue;
    const target = edge.source === page ? edge.target : edge.source;
    if (policy.one && edge.source === page) view[field] = target;
    else (view[field] ||= []).push(target);
  }
  for (const value of Object.values(view)) if (Array.isArray(value)) value.sort();
  return view;
}

/** Validate one affected component and return the sets whose absence/presence was read. */
export function resolveConnections(documents, edges, { scope = documents.map(item => item.key || item.id) } = {}) {
  const index = new Map(documents.map(item => [item.key || item.id, item]));
  const normalized = [], errors = [], resolutions = [], seen = new Set();
  const incident = new Map();
  const fail = (edge, code, message) => errors.push({ source: edge.source, target: edge.target, kind: edge.kind, code, message });
  for (const value of edges) {
    let edge;
    try { edge = { ...value, ...connectionIdentity(value) }; }
    catch (error) { fail(value, 'shape', error.message); continue; }
    if (seen.has(edge.id)) { fail(edge, 'duplicate', 'The same connection was supplied twice'); continue; }
    seen.add(edge.id);
    if (edge.present === false || edge.present === 0) continue;
    normalized.push(edge);
    for (const id of [edge.source, edge.target]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(edge);
    }
  }
  // Narrative references remain authored blocks; their endpoint resolution and
  // dependency effects use this same authority as canonical connections.
  const requested=new Set(scope);
  const referenceScope=new Set(scope);
  function blocks(source,items,path='blocks') {
    for(const [position,block] of (items || []).entries()) {
      const contract=getBlockContract(block.type);
      const target=contract?.referenceType==='update' && block[contract.referenceField];
      if(target && (requested.has(source.key || source.id) || requested.has(String(target)))) {
        const sourceId=source.key || source.id;
        const endpoint=index.get(String(target));
        const status=!endpoint || endpoint.active===false?'missing':endpoint.accepted===false?'pending':'resolved';
        const edge={source:sourceId,target:String(target),kind:block.type};
        resolutions.push({...edge,source_type:documentKind(source),status,location:`${path}[${position}]`});
        referenceScope.add(sourceId);referenceScope.add(String(target));
        if(status==='missing') fail(edge,'missing','Narrative reference endpoint is unavailable');
        if(sourceId===String(target) && !contract.allowSelfReference) fail(edge,'self','Narrative reference cannot target its source');
      }
      if(block.type==='group') blocks(source,block.blocks,`${path}[${position}].blocks`);
    }
  }
  for(const source of documents) if(source.accepted!==false && source.active!==false) blocks(source,source.blocks);
  const affected = new Set(referenceScope), pending = [...referenceScope];
  while (pending.length) {
    for (const edge of incident.get(pending.pop()) || []) {
      for (const id of [edge.source, edge.target]) if (!affected.has(id)) { affected.add(id); pending.push(id); }
    }
  }
  const active = [];
  for (const edge of normalized) {
    const policy = CONNECTION_KINDS[edge.kind];
    const source = index.get(edge.source), target = index.get(edge.target);
    const relevant = affected.has(edge.source) || affected.has(edge.target);
    let status = 'resolved';
    if (!source || !target || source.active === false || target.active === false) status = 'missing';
    else if (!policy.source.includes(documentKind(source)) || !policy.target.includes(documentKind(target))) status = 'inactive';
    else if (source.accepted === false || target.accepted === false) status = 'pending';
    if (relevant) {
      resolutions.push({ ...edge, source_type: documentKind(source), status, location: `connections.${edge.kind}` });
      if (status === 'missing') fail(edge, 'missing', 'Connection endpoint is unavailable');
    }
    if (status !== 'resolved') continue;
    active.push(edge);
    if (!relevant) continue;
  }
  // A project can have several parents; visit every branch of the DAG.
  const outgoing = new Map();
  for (const edge of active.filter(edge => CONNECTION_KINDS[edge.kind].acyclic)) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge);
  }
  const complete = new Set(), visiting = new Set();
  function visit(id) {
    if (complete.has(id)) return;
    visiting.add(id);
    for (const edge of outgoing.get(id) || []) {
      if (visiting.has(edge.target)) fail(edge, 'cycle', 'Project membership contains a cycle');
      else visit(edge.target);
    }
    visiting.delete(id); complete.add(id);
  }
  for (const id of affected) visit(id);
  const publicEdges = active.map(edge => ({ ...edge, present: true }));
  const views = Object.fromEntries([...index].map(([id]) => [id, connectionSelections(id, publicEdges)]));
  for (const [id, fields] of Object.entries(views)) {
    for (const [field, ids] of Object.entries(fields)) if (Array.isArray(ids)) {
      fields[field] = chronological(ids.map(key => ({ ...index.get(key), key }))).map(item => item.key);
    }
  }
  for (const fields of Object.values(views)) {
    fields.display_projects = mostSpecificProjects(fields.projects || [], views);
  }
  return { errors, resolutions, views, dependencies: [...affected].sort() };
}

/** Suppress reachable ancestors only through publicly resolved project links. */
export function mostSpecificProjects(projects, views) {
  const ancestors = new Set();
  for (const project of projects) {
    const visited = new Set([project]), pending = [...(views[project]?.projects || [])];
    while (pending.length) {
      const parent = pending.pop();
      if (visited.has(parent)) continue;
      visited.add(parent); ancestors.add(parent);
      pending.push(...(views[parent]?.projects || []));
    }
  }
  return projects.filter(project => !ancestors.has(project));
}
