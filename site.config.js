/**
 * Site Configuration
 * ==================
 * This is THE control file for your site layout.
 *
 * To rearrange sections: Move items in the `sections` array
 * To disable a section:  Add its name to `disabled` array
 * To add a new section:  Create folder in sections/, add to array
 */

export default {
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION ORDER
  // ═══════════════════════════════════════════════════════════════════════════
  // Sections render in this order. Just rearrange to change layout!

  sections: [
    // Fixed sections (header/footer stay in place)
    { name: 'header', fixed: true },

    // Content sections - rearrange these freely!
    { name: 'hero', navLabel: null },           // No nav link (it's the intro)
    { name: 'featured', navLabel: 'Featured' },
    { name: 'roadmap', navLabel: null },        // Phase progress indicator
    { name: 'timeline', navLabel: 'Work' },
    { name: 'contact', navLabel: 'Contact' },

    // Footer always last
    { name: 'footer', fixed: true },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DISABLED SECTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  // Add section names here to hide them without deleting files

  disabled: [
    // 'hero',      // Uncomment to hide hero
    // 'featured',  // Uncomment to hide featured
    // 'timeline',  // Uncomment to hide timeline
    // 'contact',   // Uncomment to hide contact
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE PHASE
  // ═══════════════════════════════════════════════════════════════════════════
  // Change this to switch which phase shows as "Current" (1, 2, or 3)

  activePhase: 1,

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMELINE SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  timeline: {
    // Days before level-3 items get bundled into summary cards
    // Items newer than this show individually; older ones group together
    recentThresholdDays: 14,

    // Simulated "current date" for testing bundling behavior
    // Set to a date string like '2026-03-01' to test how timeline looks at that point
    // Remove or set to null to use actual current date
    // currentDate: '2026-07-01',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA SOURCES
  // ═══════════════════════════════════════════════════════════════════════════
  // Paths to data files that sections can use

  data: {
    site: 'data/site.json',
    projects: 'projects/manifest.json',  // Generated from project folders
    phases: 'data/phases.json',
  },
};
