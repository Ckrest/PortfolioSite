import { loadJson } from '../../js/data-store.js';
import { renderEntry } from '../../js/components/update-entry.js';

export async function init(section) {
  const container = section.querySelector('#project-index');
  const status = section.querySelector('#project-index-status');
  try {
    const catalog = await loadJson('data/documents.json');
    if (catalog?.schema !== 'portfolio-document-index@2' || !Array.isArray(catalog.documents)) throw new Error('Invalid document catalog');
    const projects = catalog.documents.filter(item => item.kind === 'project');
    container.innerHTML = projects.map(item => renderEntry(item, { variant: 'timeline', headingLevel: 3, showDate: false })).join('');
    status.hidden = projects.length > 0;
    status.textContent = 'Projects will appear here as they are added.';
  } catch (error) {
    status.hidden = false;
    status.textContent = 'Unable to load projects.';
    console.error(error);
  } finally { container.setAttribute('aria-busy', 'false'); }
}
