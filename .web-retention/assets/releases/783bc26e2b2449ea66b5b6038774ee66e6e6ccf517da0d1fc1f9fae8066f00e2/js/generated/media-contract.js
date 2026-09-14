// Generated from updates/_media-contract.json; do not edit.
export const MEDIA_CONTRACT = {
  "schema": "portfolio-site/media-contract@1",
  "kinds": [
    "image",
    "video"
  ],
  "fits": [
    "contain",
    "cover"
  ],
  "placements": [
    "cards-only",
    "cards-and-detail"
  ],
  "playback": [
    "player",
    "loop"
  ],
  "fields": [
    "kind",
    "src",
    "description",
    "poster"
  ],
  "previewFields": [
    "kind",
    "src",
    "description",
    "poster",
    "placement",
    "fit"
  ],
  "imageExtensions": [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg"
  ],
  "videoExtensions": [
    ".mp4",
    ".webm",
    ".mov",
    ".mkv",
    ".avi"
  ],
  "clipProfile": {
    "version": 1,
    "container": "mp4",
    "codec": "libx264",
    "crf": 23,
    "preset": "medium",
    "pixelFormat": "yuv420p",
    "maxFrameRate": 30
  },
  "usages": {
    "image": [
      ""
    ],
    "video": [
      ""
    ],
    "gallery": [
      "images[]"
    ],
    "comparison": [
      "before",
      "after"
    ]
  },
  "playableFormats": {
    ".mp4": [
      "h264",
      "av1"
    ],
    ".webm": [
      "vp8",
      "vp9",
      "av1"
    ]
  }
};
