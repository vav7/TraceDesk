import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        /* Inter Variable for UI: wider letterforms + taller x-height than
           Geist, which read as cramped at dashboard densities. Geist Mono
           stays the single technical/code face. */
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },

      /* Named type scale — the only sanctioned sizes.
         display / title / heading / subhead / body / small / caption / micro
         + mono equivalents for technical content.

         Readability floors (final typography pass):
         page title 34-40 · section heading 20-22 · card title 17-18
         nav/body 15 · secondary 14 · compact 13 · badge/status 12
         micro label 11 · technical mono content 13 (mono chips 12,
         decorative mono metadata 11). Nothing below 11px anywhere. */
      fontSize: {
        display: ['2.25rem', { lineHeight: '2.625rem', letterSpacing: '-0.02em' }],
        title: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
        heading: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],
        subhead: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '-0.005em' }],
        body: ['0.9375rem', { lineHeight: '1.4375rem' }],
        small: ['0.8125rem', { lineHeight: '1.1875rem' }],
        caption: ['0.75rem', { lineHeight: '1.0625rem' }],
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        'mono-body': ['0.8125rem', { lineHeight: '1.25rem' }],
        'mono-caption': ['0.75rem', { lineHeight: '1.125rem' }],
        'mono-micro': ['0.6875rem', { lineHeight: '1.0625rem' }],
      },

      /* Semantic radius system: 10 / 14 / 20 / 28 / pill.
         Legacy defaults kept so existing markup stays intact until
         later phases migrate it onto the semantic names. */
      borderRadius: {
        ...defaultTheme.borderRadius,
        ctl: '10px',
        card: '14px',
        panel: '20px',
        hero: '28px',
        pill: '9999px',
      },

      colors: {
        /* Semantic surfaces */
        canvas: 'rgb(var(--td-canvas) / <alpha-value>)',
        surface: 'rgb(var(--td-surface) / <alpha-value>)',
        elevated: 'rgb(var(--td-elevated) / <alpha-value>)',
        inset: 'rgb(var(--td-inset) / <alpha-value>)',
        diagnostic: 'rgb(var(--td-diagnostic) / <alpha-value>)',
        diagline: 'rgb(var(--td-diag-line) / <alpha-value>)',
        diag1: 'rgb(var(--td-diag-1) / <alpha-value>)',
        diag2: 'rgb(var(--td-diag-2) / <alpha-value>)',
        diag3: 'rgb(var(--td-diag-3) / <alpha-value>)',
        /* Semantic text */
        'text-1': 'rgb(var(--td-text-1) / <alpha-value>)',
        'text-2': 'rgb(var(--td-text-2) / <alpha-value>)',
        'text-3': 'rgb(var(--td-text-3) / <alpha-value>)',
        /* Brand + semantic state */
        accent: 'rgb(var(--td-accent) / <alpha-value>)',
        accent2: 'rgb(var(--td-accent-2) / <alpha-value>)',
        accent3: 'rgb(var(--td-accent-3) / <alpha-value>)',
        success: 'rgb(var(--td-success) / <alpha-value>)',
        warning: 'rgb(var(--td-warning) / <alpha-value>)',
        danger: 'rgb(var(--td-danger) / <alpha-value>)',
        caution: 'rgb(var(--td-caution) / <alpha-value>)',
        /* Text-safe shades of the semantic hues (WCAG AA on light surfaces).
           Foreground text/icons use these; dots, borders and tinted
           backgrounds use the brighter base tokens above. */
        'success-ink': 'rgb(var(--td-success-ink) / <alpha-value>)',
        'warning-ink': 'rgb(var(--td-warning-ink) / <alpha-value>)',
        'danger-ink': 'rgb(var(--td-danger-ink) / <alpha-value>)',
        'caution-ink': 'rgb(var(--td-caution-ink) / <alpha-value>)',
        'accent2-ink': 'rgb(var(--td-accent-2-ink) / <alpha-value>)',
        'accent-ink': 'rgb(var(--td-accent-ink) / <alpha-value>)',
        'accent3-ink': 'rgb(var(--td-accent-3-ink) / <alpha-value>)',
        line: 'rgb(var(--td-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--td-line-strong) / <alpha-value>)',
      },

      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fluid: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      boxShadow: {
        e1: 'var(--td-elev-1)',
        e2: 'var(--td-elev-2)',
        e3: 'var(--td-elev-3)',
        card: 'var(--td-card-shadow)',
        'card-hover': 'var(--td-card-shadow-hover)',
        pop: 'var(--td-pop-shadow)',
      },

      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'overlay-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '70%': { transform: 'scale(2.6)', opacity: '0' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        'tick-flash': {
          '0%': { backgroundColor: 'var(--td-flash, transparent)' },
          '100%': { backgroundColor: 'transparent' },
        },
        fly: {
          '0%': { left: '6%', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { left: '90%', opacity: '0' },
        },
        'wake-slide': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(480%)' },
        },
        'toast-life': {
          '0%': { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
        },
        signal: {
          '0%': { transform: 'translateX(-120%)', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { transform: 'translateX(320%)', opacity: '0' },
        },
      },
      animation: {
        /* fade-up uses `backwards` (not `both`): a persisted transform would
           make animated wrappers (Layout page container, table rows) the
           containing block for position:fixed descendants — dialogs and the
           ResponseViewer live inside those wrappers and must anchor to the
           viewport, so the end-state transform has to be released. */
        'fade-up': 'fade-up 0.25s ease-out backwards',
        'overlay-in': 'overlay-in 0.18s ease-out both',
        'modal-in': 'modal-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
        'ping-slow': 'ping-slow 2.4s cubic-bezier(0, 0, 0.2, 1) infinite',
        'tick-flash': 'tick-flash 0.9s ease-out both',
        fly: 'fly 1.1s cubic-bezier(0.45, 0, 0.55, 1) infinite',
        'wake-slide': 'wake-slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'toast-life': 'toast-life 5s linear forwards',
        signal: 'signal 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
