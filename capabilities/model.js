export function capabilityCard(capability) {
  return capability ? {
    slug: capability.slug,
    folder: capability.folder,
    title: capability.title,
    summary: capability.summary,
    evidenceCount: Array.isArray(capability.evidence) ? capability.evidence.length : 0,
  } : null;
}

export function connectCapabilities(capabilities, updates) {
  const byUpdate = new Map();
  for (const capability of capabilities) {
    for (const update of capability.evidence) {
      byUpdate.set(update.slug, [...(byUpdate.get(update.slug) || []), capabilityCard(capability)]);
    }
  }
  for (const update of updates) {
    const connected = byUpdate.get(update.slug) || [];
    if (connected.length) update.capabilities = connected;
  }
}
