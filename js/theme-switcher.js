/**
 * Theme & Background Switcher
 * ===========================
 * Easy theme and background switching for the portfolio.
 *
 * Theme commands (console):
 *   setTheme('warm-earth')
 *   setTheme('soft-dark')
 *   setTheme('paper-ink')
 *   setTheme('botanical')
 *   setTheme('default')  // Original dark theme
 *
 * Background commands (console):
 *   setBg('mesh')   - Soft gradient mesh
 *   setBg('glow')   - Animated glow orbs
 *   setBg('grain')  - Noise texture
 *   setBg('dots')   - Dot pattern
 *   setBg('clean')  - Solid color only
 *
 * Keyboard shortcuts:
 *   T - Cycle themes
 *   B - Cycle backgrounds
 */

const THEMES = ['default', 'soft-dark', 'warm-earth', 'paper-ink', 'botanical'];
const BACKGROUNDS = ['mesh', 'glow', 'grain', 'dots', 'clean'];
let currentThemeIndex = 0;
let currentBgIndex = 0;

// Initialize from current HTML attribute and localStorage
function initTheme() {
  // Priority: localStorage > HTML attribute > default
  const savedTheme = localStorage.getItem('portfolio-theme');
  const htmlTheme = document.documentElement.dataset.theme;
  const initialTheme = (savedTheme && THEMES.includes(savedTheme))
    ? savedTheme
    : (htmlTheme && THEMES.includes(htmlTheme) ? htmlTheme : 'default');

  // Set theme (this handles index and DOM)
  setTheme(initialTheme, false);  // Don't save to localStorage on init

  // Background
  const currentBg = getCurrentBg();
  currentBgIndex = BACKGROUNDS.indexOf(currentBg);
  if (currentBgIndex === -1) currentBgIndex = 0;

  const savedBg = localStorage.getItem('portfolio-bg');
  if (savedBg && BACKGROUNDS.includes(savedBg)) {
    setBg(savedBg, false);  // Don't save on init
  }
}

// Get current background from body classes
function getCurrentBg() {
  for (const bg of BACKGROUNDS) {
    if (document.body.classList.contains(`bg-${bg}`)) return bg;
  }
  return 'mesh';
}

// Set theme by name
function setTheme(themeName, save = true) {
  if (themeName === 'default') {
    delete document.documentElement.dataset.theme;
  } else if (THEMES.includes(themeName)) {
    document.documentElement.dataset.theme = themeName;
  } else {
    console.warn(`Unknown theme: ${themeName}. Available: ${THEMES.join(', ')}`);
    return;
  }

  currentThemeIndex = THEMES.indexOf(themeName);
  if (save) {
    localStorage.setItem('portfolio-theme', themeName);
  }
  console.log(`🎨 Theme: ${themeName}`);
}

// Cycle to next theme
function nextTheme() {
  currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
  setTheme(THEMES[currentThemeIndex]);
}

// Set background by name
function setBg(bgName, save = true) {
  if (!BACKGROUNDS.includes(bgName)) {
    console.warn(`Unknown background: ${bgName}. Available: ${BACKGROUNDS.join(', ')}`);
    return;
  }

  // Remove all bg- classes
  BACKGROUNDS.forEach(bg => document.body.classList.remove(`bg-${bg}`));

  // Add new one
  document.body.classList.add(`bg-${bgName}`);
  currentBgIndex = BACKGROUNDS.indexOf(bgName);
  if (save) {
    localStorage.setItem('portfolio-bg', bgName);
  }
  console.log(`🖼️ Background: ${bgName}`);
}

// Cycle to next background
function nextBg() {
  currentBgIndex = (currentBgIndex + 1) % BACKGROUNDS.length;
  setBg(BACKGROUNDS[currentBgIndex]);
}

// Keyboard shortcuts: T for themes, B for backgrounds
document.addEventListener('keydown', (e) => {
  // Only trigger if not in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key.toLowerCase()) {
    case 't':
      nextTheme();
      break;
    case 'b':
      nextBg();
      break;
  }
});

// Make functions globally available
window.setTheme = setTheme;
window.nextTheme = nextTheme;
window.setBg = setBg;
window.nextBg = nextBg;
window.THEMES = THEMES;
window.BACKGROUNDS = BACKGROUNDS;

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// Log available options on load
console.log('🎨 Theme & Background switcher loaded');
console.log('   Press T to cycle themes, B to cycle backgrounds');
console.log('   Or use: setTheme("name"), setBg("name")');
console.log('   Themes:', THEMES.join(', '));
console.log('   Backgrounds:', BACKGROUNDS.join(', '));
