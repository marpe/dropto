import React, { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Some but not all of what it stands for is ticked, e.g. a "select all" box */
  isIndeterminate?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({ isIndeterminate = false, className, ...props }) => {
  const ref = useRef<HTMLInputElement>(null);

  // A DOM property with no HTML attribute, so it can only be set on the element
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  return <input ref={ref} type="checkbox" className={cn('w-4 h-4 shrink-0 accent-brand-500', className)} {...props} />;
};
