if (new URLSearchParams(location.search).has('fullApp')) {
  await import('./full-app');
} else {
  await import('./preview');
}
