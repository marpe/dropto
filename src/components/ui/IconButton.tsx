import React from 'react';
import { iconButtonClassName } from './iconButtonStyles';
import type { IconButtonSize } from './iconButtonStyles';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon-only controls always need a tooltip naming the action */
  title: string;
  size?: IconButtonSize;
}

export const IconButton: React.FC<IconButtonProps> = ({ size = 'md', type = 'button', className, ...props }) => (
  <button type={type} className={iconButtonClassName(size, className)} {...props} />
);
