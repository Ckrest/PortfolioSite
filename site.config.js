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
    { name: 'capabilities', navLabel: 'Capabilities' },
    { name: 'roadmap', navLabel: null },        // Phase progress indicator
    { name: 'timeline', navLabel: 'Work' },      // Continues the roadmap

    // Footer always last (includes contact)
    { name: 'footer', fixed: true, navLabel: 'Contact', anchor: 'contact' },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DISABLED SECTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  // Add section names here to hide them without deleting files

  disabled: [
    // 'hero',      // Uncomment to hide hero
    // 'featured',  // Uncomment to hide featured
    'capabilities', // Detail pages remain public; hide direct homepage links
    // 'timeline',  // Uncomment to hide timeline
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE PHASE
  // ═══════════════════════════════════════════════════════════════════════════
  // Change this to switch which phase shows as "Current" (1, 2, or 3)

  activePhase: 3,

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURED SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Control which updates appear in the featured section
  // Updates are identified by slug (from manifest.json)

  featured: {
    // List of update slugs to feature (in display order)
    // Leave empty or comment out items to show "coming soon" message
    items: [
      'portfolio-site',
      'diagram-tool',
      'comfy-viewer',
    ],

    // How many items to show (will show up to this many from the list)
    maxItems: 3,

    // Display options
    showDate: true,
    showTags: true,
    showSummary: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMELINE SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  timeline: {
    // Keep recent small updates in the chronological archive instead of
    // presenting them in a separate Latest activity feed.
    showLatestActivity: false,

    // Small updates inside this rolling window form the compact Latest
    // activity list. The newest update date is the default reference so a
    // delayed deploy still describes its actual latest work truthfully.
    recentWindowDays: 7,
    recentMaxItems: 8,

    // Optional fixed reference date for testing the activity window.
    // Set to a date string like '2026-03-01' to test how timeline looks at that point
    // Remove or set to null to use the newest update date
    // currentDate: '2026-07-01',

    // ─────────────────────────────────────────────────────────────────────────
    // TAG DISPLAY
    // ─────────────────────────────────────────────────────────────────────────
    // Control how tags are displayed alongside timeline entries

    tagDisplay: {
      // Master toggle: set to false to hide all tag UI
      enabled: true,

      // Where to show tags on wide screens: 'inline' (on card) or 'margin' (sidecar)
      wideMode: 'inline',

      // Show aggregated tag strip (narrow: top, wide: in margin slot)
      showTagStrip: true,

      // Tags to highlight and filter on initial load (empty = show all)
      activeTags: [],

      // Tags to always hide from display
      hiddenTags: [],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA SOURCES
  // ═══════════════════════════════════════════════════════════════════════════
  // Paths to data files that sections can use

  data: {
    site: 'data/site.json',
    updates: 'updates/manifest.json',  // Generated from update folders
    capabilities: 'capabilities/manifest.json',
    phases: 'data/phases.json',
  },
};
