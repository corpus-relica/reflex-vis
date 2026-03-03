export type ThemeOption = 'dark' | 'light' | Record<string, string>;

const DARK: Record<string, string> = {
  '--rx-bg': 'rgba(0, 0, 0, 0.85)',
  '--rx-bg-panel': 'rgba(30, 30, 30, 0.95)',
  '--rx-text': '#e0e0e0',
  '--rx-text-muted': '#888',
  '--rx-accent': '#4fc3f7',
  '--rx-accent-dim': '#1a3a4a',
  '--rx-border': 'rgba(255, 255, 255, 0.1)',
  '--rx-font-mono': "'SF Mono', 'Fira Code', monospace",
  '--rx-font-ui': '-apple-system, sans-serif',
  '--rx-font-size': '11px',
  '--rx-event-node': '#64b5f6',
  '--rx-event-bb': '#81c784',
  '--rx-event-workflow': '#ce93d8',
  '--rx-event-engine': '#90a4ae',
};

const LIGHT: Record<string, string> = {
  ...DARK,
  '--rx-bg': 'rgba(255, 255, 255, 0.92)',
  '--rx-bg-panel': 'rgba(245, 245, 245, 0.95)',
  '--rx-text': '#1a1a1a',
  '--rx-text-muted': '#666',
  '--rx-accent': '#0288d1',
  '--rx-accent-dim': '#b3e5fc',
  '--rx-border': 'rgba(0, 0, 0, 0.12)',
};

export function resolveTheme(option: ThemeOption = 'dark'): Record<string, string> {
  if (option === 'dark') return DARK;
  if (option === 'light') return LIGHT;
  return { ...DARK, ...option };
}

export function applyTheme(element: HTMLElement, theme: Record<string, string>): void {
  for (const [prop, value] of Object.entries(theme)) {
    element.style.setProperty(prop, value);
  }
}
