/**
 * The app's name and brand values that JS needs. The static head (title, theme colour, favicon) is in
 * index.html, the PWA manifest in vite.config.ts and the colour scale in styles/tokens.css.
 */
export const BRAND = {
  name: 'dropto.space',
  /** Room codes look like `${roomPrefix}-XXXXXX` */
  roomPrefix: 'DT',
  favicon: '/favicon.svg',
  /** Canvas confetti cannot read CSS variables, so its palette is listed explicitly */
  confettiColors: ['#F97316', '#ea580c', '#fb923c', '#ffffff', '#fde047'],
};
