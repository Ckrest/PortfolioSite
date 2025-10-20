# Repository Guidelines

- Keep this project framework-free with inline `<style>` and `<script>` blocks inside `index.html` unless a change explicitly calls for new files.
- Favor semantic HTML sectioning (`<section>`, `<header>`, `<article>`) and keep accessibility attributes (ARIA labels, `aria-live`, etc.) intact or improved when updating markup.
- Prefer CSS custom properties already defined in `:root`; introduce new tokens sparingly and document their purpose with descriptive names.
- Write JavaScript in modern ES modules style (const/let, arrow functions where appropriate) without external dependencies. Keep data-fetching logic resilient with clear status messaging.
- When editing timelines or interaction logic, make sure IntersectionObserver hooks degrade gracefully if JavaScript is disabled.
- Update documentation or data contracts in lock-step with UI changes so the site remains easy to maintain.
