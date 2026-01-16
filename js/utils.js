/**
 * Shared Utilities
 * Common functions used across the portfolio site
 */

// Media type constants
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif', 'avif'];

/**
 * Get media type from file path
 * @param {string} path - File path or URL
 * @returns {'video' | 'image' | null} Media type
 */
export function getMediaType(path) {
  if (!path) return null;

  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';

  return null;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a placeholder SVG data URI with the project title
 * Used when a project doesn't have a preview image
 */
export function generatePlaceholderDataUri(title) {
  const escapedTitle = escapeHtml(title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12141a"/>
      <stop offset="100%" stop-color="#0a0a12"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#a388ff"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" rx="24" fill="url(#bg)"/>
  <circle cx="520" cy="80" r="120" fill="#7c5cff" opacity="0.05"/>
  <circle cx="120" cy="280" r="80" fill="#a388ff" opacity="0.05"/>
  <rect x="80" y="60" width="480" height="200" rx="16" fill="none" stroke="#7c5cff" stroke-width="2" stroke-dasharray="8 4" opacity="0.4"/>
  <circle cx="320" cy="160" r="40" fill="#7c5cff" opacity="0.15"/>
  <rect x="300" y="145" width="40" height="30" rx="4" fill="#7c5cff" opacity="0.6"/>
  <rect x="220" y="200" width="200" height="28" rx="14" fill="#7c5cff" opacity="0.2"/>
  <text x="320" y="220" fill="#7c5cff" font-family="system-ui,sans-serif" font-size="12" font-weight="500" text-anchor="middle" opacity="0.8">PREVIEW COMING SOON</text>
  <text x="320" y="320" fill="#ffffff" font-family="system-ui,sans-serif" font-size="20" font-weight="600" text-anchor="middle">${escapedTitle}</text>
  <rect x="220" y="335" width="200" height="3" rx="1.5" fill="url(#accent)" opacity="0.6"/>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
