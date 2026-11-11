/**
 * monipack Enterprise CRM - Global Design Tokens (JS Export)
 * Morooj Nizwa International LLC
 * 
 * Core Design System Color Variables:
 * - primary: #CC1A22
 * - primary-hover: #A8131B
 * - accent-dark: #4A0B0E
 * - surface-silver: #E5E7EB
 * - app-bg: #F3F4F6
 * - component-bg: #FFFFFF
 * - text-main: #111827
 * - text-muted: #6B7280
 */

export const tokens = {
  colors: {
    // 2026 Core Color System
    primary: '#CC1A22',
    primaryHover: '#A8131B',
    accentDark: '#4A0B0E',
    surfaceSilver: '#E5E7EB',
    appBg: '#F3F4F6',
    componentBg: '#FFFFFF',
    textMain: '#111827',
    textMuted: '#6B7280',

    // Semantic Mapping
    surface: {
      canvas: '#F3F4F6',
      card: '#FFFFFF',
      subtle: '#F8FAFC',
      hover: '#E5E7EB',
    },
    borders: {
      default: '#E5E7EB',
      subtle: '#F1F5F9',
      strong: '#CBD5E1',
    },
    status: {
      success: '#059669',
      successSubtle: '#ECFDF5',
      warning: '#D97706',
      warningSubtle: '#FFFBEB',
      danger: '#CC1A22',
      dangerSubtle: '#FEF2F2',
      info: '#2563EB',
      infoSubtle: '#EFF6FF',
    },
  },

  typography: {
    fontFamilies: {
      sans: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', Helvetica, 'Apple Color Emoji', Arial, sans-serif, 'Segoe UI Emoji', 'Segoe UI Symbol'",
      arabic: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', Helvetica, 'Apple Color Emoji', Arial, sans-serif, 'Segoe UI Emoji', 'Segoe UI Symbol'",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    fontSizes: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',   // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem',  // 36px
    },
    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
  },

  geometry: {
    radius: {
      xs: '0.25rem',  // 4px
      sm: '0.375rem', // 6px
      md: '0.5rem',   // 8px
      lg: '0.75rem',  // 12px
      xl: '1rem',     // 16px
      '2xl': '1.25rem',// 20px
      full: '9999px',
    },
    layout: {
      sidebarWidth: '250px',
      headerHeight: '64px',
      contentMaxWidth: '1280px',
    },
  },

  shadows: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
    card: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
    dropdown: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    modal: '0 20px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.08)',
  },

  transitions: {
    fast: '100ms ease',
    default: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    smooth: '250ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
};

export default tokens;
