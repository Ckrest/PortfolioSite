/**
 * Featured Section
 * Displays selected projects using the same card styling as timeline
 *
 * Configuration is in site.config.js under `featured`:
 *   items: ['slug1', 'slug2', ...]  - Project slugs to feature
 *   maxItems: 3                      - Maximum items to display
 *   showDate, showTags, showSummary  - Display options
 */

import { renderEntry } from '../../js/components/project-entry.js';

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#featured-project');
  const status = sectionEl.querySelector('#featured-status');

  if (!container) return;

  // Get featured config
  const featuredConfig = config.featured || {};
  const featuredSlugs = featuredConfig.items || [];
  const maxItems = featuredConfig.maxItems ?? 3;

  if (featuredSlugs.length === 0) {
    if (status) {
      status.textContent = 'Featured projects coming soon.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    const res = await fetch(config.data.projects, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Request failed');

    const manifest = await res.json();
    const projects = manifest.projects;

    // Find featured projects by slug, maintaining config order
    const featuredProjects = featuredSlugs
      .slice(0, maxItems)
      .map(slug => projects.find(p => p.slug === slug))
      .filter(Boolean); // Remove any not found

    if (featuredProjects.length === 0) {
      if (status) {
        status.textContent = 'Featured projects coming soon.';
        status.hidden = false;
      }
      container.setAttribute('aria-busy', 'false');
      return;
    }

    // Render each featured project using timeline-entry styling
    const html = featuredProjects.map(project => {
      return renderEntry(project, {
        variant: 'timeline',  // Use timeline styling
        size: project.size ?? 'medium',  // Use project size, default to medium
        showDate: featuredConfig.showDate ?? true,
        showTags: featuredConfig.showTags ?? true,
        showCta: false,
      });
    }).join('');

    container.innerHTML = `<div class="featured-entries">${html}</div>`;

    if (status) status.hidden = true;
    container.setAttribute('aria-busy', 'false');

    if (window.observeReveals) {
      window.observeReveals(container);
    }

  } catch (err) {
    console.error('Featured section error:', err);
    if (status) {
      status.textContent = 'Unable to load featured projects.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
  }
}
