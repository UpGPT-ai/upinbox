'use client';

import * as React from 'react';
import { Check } from 'lucide-react';

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <label
        className={cn(
          'inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background cursor-pointer',
          checked ? 'bg-primary text-primary-foreground' : 'bg-background',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...props}
        />
        {checked && <Check className="h-3 w-3" />}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
