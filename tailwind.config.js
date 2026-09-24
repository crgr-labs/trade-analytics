/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./app.js",
    "./stitch_crypto_trade_journal_dashboard/**/*.{html,js}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-surface": "rgb(var(--c-on-surface) / <alpha-value>)",
        "surface-container-low": "rgb(var(--c-surface-container-low) / <alpha-value>)",
        "on-primary": "rgb(var(--c-on-primary) / <alpha-value>)",
        "on-primary-fixed-variant": "rgb(var(--c-on-primary-fixed-variant) / <alpha-value>)",
        "on-secondary-container": "rgb(var(--c-on-secondary-container) / <alpha-value>)",
        "on-secondary": "rgb(var(--c-on-secondary) / <alpha-value>)",
        "primary-container": "rgb(var(--c-primary-container) / <alpha-value>)",
        "tertiary-fixed": "rgb(var(--c-tertiary-fixed) / <alpha-value>)",
        "surface-tint": "rgb(var(--c-surface-tint) / <alpha-value>)",
        "secondary": "rgb(var(--c-secondary) / <alpha-value>)",
        "outline-variant": "rgb(var(--c-outline-variant) / <alpha-value>)",
        "error": "rgb(var(--c-error) / <alpha-value>)",
        "surface-dim": "rgb(var(--c-surface-dim) / <alpha-value>)",
        "on-tertiary-fixed-variant": "rgb(var(--c-on-tertiary-fixed-variant) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--c-on-surface-variant) / <alpha-value>)",
        "on-secondary-fixed-variant": "rgb(var(--c-on-secondary-fixed-variant) / <alpha-value>)",
        "surface-variant": "rgb(var(--c-surface-variant) / <alpha-value>)",
        "on-error": "rgb(var(--c-on-error) / <alpha-value>)",
        "on-background": "rgb(var(--c-on-background) / <alpha-value>)",
        "secondary-fixed": "rgb(var(--c-secondary-fixed) / <alpha-value>)",
        "error-container": "rgb(var(--c-error-container) / <alpha-value>)",
        "secondary-fixed-dim": "rgb(var(--c-secondary-fixed-dim) / <alpha-value>)",
        "on-tertiary-fixed": "rgb(var(--c-on-tertiary-fixed) / <alpha-value>)",
        "primary-fixed-dim": "rgb(var(--c-primary-fixed-dim) / <alpha-value>)",
        "inverse-on-surface": "rgb(var(--c-inverse-on-surface) / <alpha-value>)",
        "primary-fixed": "rgb(var(--c-primary-fixed) / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--c-surface-container-lowest) / <alpha-value>)",
        "tertiary-container": "rgb(var(--c-tertiary-container) / <alpha-value>)",
        "surface": "rgb(var(--c-surface) / <alpha-value>)",
        "on-secondary-fixed": "rgb(var(--c-on-secondary-fixed) / <alpha-value>)",
        "surface-container-high": "rgb(var(--c-surface-container-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--c-surface-container-highest) / <alpha-value>)",
        "on-tertiary-container": "rgb(var(--c-on-tertiary-container) / <alpha-value>)",
        "secondary-container": "rgb(var(--c-secondary-container) / <alpha-value>)",
        "outline": "rgb(var(--c-outline) / <alpha-value>)",
        "tertiary": "rgb(var(--c-tertiary) / <alpha-value>)",
        "on-primary-fixed": "rgb(var(--c-on-primary-fixed) / <alpha-value>)",
        "surface-container": "rgb(var(--c-surface-container) / <alpha-value>)",
        "tertiary-fixed-dim": "rgb(var(--c-tertiary-fixed-dim) / <alpha-value>)",
        "surface-bright": "rgb(var(--c-surface-bright) / <alpha-value>)",
        "background": "rgb(var(--c-background) / <alpha-value>)",
        "primary": "rgb(var(--c-primary) / <alpha-value>)",
        "on-primary-container": "rgb(var(--c-on-primary-container) / <alpha-value>)",
        "on-tertiary": "rgb(var(--c-on-tertiary) / <alpha-value>)",
        "inverse-primary": "rgb(var(--c-inverse-primary) / <alpha-value>)",
        "inverse-surface": "rgb(var(--c-inverse-surface) / <alpha-value>)",
        "on-error-container": "rgb(var(--c-on-error-container) / <alpha-value>)",
        "ground": "rgb(var(--c-ground) / <alpha-value>)",
        "warning": "rgb(var(--c-warning) / <alpha-value>)",
        "warning-container": "rgb(var(--c-warning-container) / <alpha-value>)",
        "on-warning-container": "rgb(var(--c-on-warning-container) / <alpha-value>)"
      },
      boxShadow: {
        "sm": "0 0 0 1px var(--ring-color), 0 1px 2px var(--shadow-1), 0 4px 12px var(--shadow-2)"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "gutter-desktop": "1.5rem",
        "margin-tablet": "1.5rem",
        "space-xl": "2rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "gutter": "1.25rem",
        "margin-desktop": "2rem",
        "space-lg": "1.25rem",
        "margin": "1rem"
      },
      fontFamily: {
        "body-sm": ["Inter", "sans-serif"],
        "headline-xl": ["Inter", "sans-serif"],
        "metric-display": ["JetBrains Mono", "monospace"],
        "headline-lg": ["Inter", "sans-serif"],
        "headline-sm": ["Inter", "sans-serif"],
        "metric-sm": ["JetBrains Mono", "monospace"],
        "body-md": ["Inter", "sans-serif"],
        "headline-md": ["Inter", "sans-serif"],
        "headline-lg-mobile": ["Inter", "sans-serif"],
        "metric-lg": ["JetBrains Mono", "monospace"],
        "body-lg": ["Inter", "sans-serif"],
        "metric-md": ["JetBrains Mono", "monospace"],
        "label-eyebrow": ["Inter", "sans-serif"]
      },
      fontSize: {
        "body-sm": ["13px", { "lineHeight": "18px", "fontWeight": "400" }],
        "headline-xl": ["30px", { "lineHeight": "38px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "metric-display": ["28px", { "lineHeight": "34px", "letterSpacing": "-0.03em", "fontWeight": "600" }],
        "headline-lg": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "600" }],
        "headline-sm": ["15px", { "lineHeight": "22px", "letterSpacing": "-0.005em", "fontWeight": "600" }],
        "metric-sm": ["11px", { "lineHeight": "16px", "fontWeight": "500" }],
        "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
        "headline-md": ["18px", { "lineHeight": "26px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "headline-lg-mobile": ["20px", { "lineHeight": "28px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "metric-lg": ["18px", { "lineHeight": "24px", "letterSpacing": "-0.02em", "fontWeight": "600" }],
        "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "metric-md": ["13px", { "lineHeight": "18px", "letterSpacing": "-0.01em", "fontWeight": "500" }],
        "label-eyebrow": ["11px", { "lineHeight": "16px", "letterSpacing": "0.08em", "fontWeight": "600" }]
      }
    }
  },
  plugins: []
};

