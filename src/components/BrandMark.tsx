import React from 'react';
import { AppLogo } from './ui/AppLogo';
import { Pill } from './ui/Pill';
import { getActiveBrand } from '../branding';

/** The only branding on the page: the mark and name, small, above the content. */
export const BrandMark: React.FC = () => {
  const brand = getActiveBrand();
  return (
    <div className="flex items-center justify-center gap-3">
      <AppLogo />
      <span className="font-bold text-xl tracking-tight text-zinc-900 dark:text-white">{brand.name}</span>
      <Pill>{brand.badge}</Pill>
    </div>
  );
};
