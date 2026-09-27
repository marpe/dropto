import React from 'react';
import { UploadCloud } from 'lucide-react';

/** Full-page target shown while files are dragged over the window; it never intercepts the events. */
export const DropOverlay: React.FC = () => (
  <div className="fixed inset-0 z-50 p-4 pointer-events-none animate-fade-in">
    <div className="w-full h-full rounded-3xl border-4 border-dashed border-brand-500 bg-brand-500/10 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-brand-500">
      <UploadCloud className="w-12 h-12 motion-safe:animate-bounce" />
      <span className="text-xl font-bold">Drop to add files</span>
    </div>
  </div>
);
