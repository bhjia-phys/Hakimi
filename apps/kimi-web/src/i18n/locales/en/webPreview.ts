export default {
  title: 'Web preview',
  reload: 'Reload',
  openExternal: 'Open in new tab',
  close: 'Close',
  /** aria-label of the web-preview card's Open button (visible label: `cardOpen`). */
  open: 'Open web preview: {url}',
  /** Standalone card appended to an assistant reply that ran a dev server. */
  cardTitle: 'Web preview',
  cardReady: 'Local app is ready',
  cardOpen: 'Open preview',
  /** Accessible iframe title (the address is not read aloud raw). */
  frameTitle: 'Web page preview: {url}',
} as const;