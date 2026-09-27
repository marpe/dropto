export type BrandId = 'dropwave' | 'dropto';

export interface Brand {
  id: BrandId;
  /** Shown in the header, footer and progress tab title */
  name: string;
  /** Static document title */
  title: string;
  /** Small pill next to the name in the header */
  badge: string;
  /** Room codes look like `${roomPrefix}-XXXXXX` */
  roomPrefix: string;
  themeColor: string;
  favicon: string;
  manifest: string;
  /** Canvas confetti cannot read CSS variables, so its palette is listed explicitly */
  confettiColors: string[];
}
