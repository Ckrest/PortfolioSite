/** A project presents its direct contents and its own place in larger work. */
export function renderPage({ overview, content, capabilities, timeline, projectNotice, projectLinks }) {
  return `${projectNotice}${overview}${content}${timeline('items', 'Project work')}${projectLinks}${capabilities}`;
}
