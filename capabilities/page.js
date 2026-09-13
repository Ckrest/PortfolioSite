/** Capability page composition, independent of the update page layout. */
export function renderPage({ overview, content, capabilities, timeline }) {
  return `${overview}${content}${capabilities}${timeline('evidence', 'Demonstrated work')}`;
}
