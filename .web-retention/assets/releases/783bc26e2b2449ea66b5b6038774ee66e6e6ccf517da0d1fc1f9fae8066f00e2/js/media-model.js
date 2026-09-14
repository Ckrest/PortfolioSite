/** Current media values, shared by public rendering and authoring. */
import { MEDIA_CONTRACT as contract } from './generated/media-contract.js';
export { MEDIA_CONTRACT } from './generated/media-contract.js';

export function mediaInputKind(name) {
  const suffix = String(name || '').toLowerCase().match(/\.[^.]+$/)?.[0];
  if (contract.videoExtensions.includes(suffix)) return 'video';
  if (contract.imageExtensions.includes(suffix)) return 'image';
  return null;
}

export function normalizeMediaPath(value) {
  return String(value || '').trim().replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
}

export function mediaErrors(value, { kind = null, preview = false, complete = true, provider = false, slot = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Media must be an object'];
  const errors = [];
  if (!contract.kinds.includes(value.kind) || (kind && value.kind !== kind)) errors.push(`kind must be ${kind || 'image or video'}`);
  for (const field of ['src', 'description']) {
    if ((value[field] != null && typeof value[field] !== 'string') || (complete && !String(value[field] || '').trim())) errors.push(`${field} requires meaningful text`);
  }
  if (!provider && value.src && !/^(?:staged:|blob:)/.test(value.src)
      && (/^(?:\/|[a-z][\w+.-]*:)/i.test(value.src) || normalizeMediaPath(value.src).split('/').includes('..'))) errors.push('src must be a document-relative asset');
  if (value.kind === 'video' && !provider && complete && !String(value.poster || '').trim()) errors.push('poster is required for local video');
  if (value.poster && typeof value.poster !== 'string') errors.push('poster must be a document-relative image');
  if (typeof value.poster === 'string' && !/^(?:staged:|blob:)/.test(value.poster) && (/^(?:\/|[a-z][\w+.-]*:)/i.test(value.poster) || normalizeMediaPath(value.poster).split('/').includes('..'))) errors.push('poster must be a document-relative image');
  if (value.kind === 'image' && Object.hasOwn(value, 'poster')) errors.push('Images cannot have video posters');
  if (slot && Object.keys(value).some(key => ![...contract.fields, 'label'].includes(key))) errors.push('Media slot contains unsupported fields');
  if (preview) {
    if (!contract.placements.includes(value.placement)) errors.push('placement must be cards-only or cards-and-detail');
    if (!contract.fits.includes(value.fit)) errors.push('fit must be contain or cover');
    if (Object.keys(value).some(key => !contract.previewFields.includes(key))) errors.push('Preview contains unsupported fields');
  }
  return errors;
}

export function detailPreviewVisible(document) {
  return Boolean(document?.preview?.src && document.preview.placement === 'cards-and-detail');
}

export function mediaUsages(document) {
  const usages = [];
  const visit = (blocks, prefix = 'blocks') => {
    (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
      if (!block || typeof block !== 'object') return;
      const path = `${prefix}[${index}]`;
      for (const slot of contract.usages[block.type] || []) {
        if (block.type === 'video' && block.sourceMode !== 'local') continue;
        const many = slot.endsWith('[]');
        const value = slot ? block[slot.replace(/\[\]$/, '')] : block;
        const items = many ? (Array.isArray(value) ? value : []) : [value];
        items.forEach((media, itemIndex) => {
          if (!media || typeof media !== 'object') return;
          usages.push({ block_id: block.id || null, block_type: block.type,
            path: path + (slot ? `.${slot.replace(/\[\]$/, '')}${many ? `[${itemIndex}]` : ''}` : ''),
            slot: slot ? `${slot.replace(/\[\]$/, '')}${many ? `[${itemIndex}]` : ''}` : '',
            label: String(media.description || block.description || block.type), media });
        });
      }
      if (block.type === 'group') visit(block.blocks, `${path}.blocks`);
    });
  };
  visit(document?.blocks);
  return usages;
}

export function previewDuplication(document, assets = {}) {
  if (!detailPreviewVisible(document)) return null;
  const map = Array.isArray(assets) ? Object.fromEntries(assets.map(a => [normalizeMediaPath(a.path), a])) : assets;
  const path = normalizeMediaPath(document.preview.src);
  const digest = map[path]?.digest || (typeof map[path] === 'string' ? map[path] : null);
  const matches = mediaUsages(document).filter(({ media }) => {
    const other = normalizeMediaPath(media.src);
    const otherDigest = map[other]?.digest || (typeof map[other] === 'string' ? map[other] : null);
    return media.kind === document.preview.kind && other && (other === path || (digest && otherDigest === digest));
  }).map(({ media, ...usage }) => ({ ...usage, src: media.src }));
  if (!matches.length) return null;
  return { code: 'preview-repeated-in-body', field: 'preview',
    message: 'This detail preview repeats media in the page body. You can keep the preview on cards only.',
    matches, fingerprint: JSON.stringify([document.key || document.id || '', path, digest,
      document.preview.placement, matches.map(m => [m.block_id, m.slot, m.src])]) };
}
