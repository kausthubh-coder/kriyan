import { ReactNode } from "react";

interface CommandProps {
  children: ReactNode;
  className?: string;
}

export function Command({ children, className = "" }: CommandProps) {
  return <div className={`glass-card p-2 ${className}`}>{children}</div>;
}

interface CommandGroupProps {
  heading?: string;
  children: ReactNode;
}

export function CommandGroup({ heading, children }: CommandGroupProps) {
  return (
    <div className="space-y-2">
      {heading && <div className="text-xs uppercase text-text-muted px-2">{heading}</div>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

interface CommandItemProps {
  children: ReactNode;
  onSelect?: () => void;
}

export function CommandItem({ children, onSelect }: CommandItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left px-2 py-2 rounded-lg text-sm text-text-primary hover:bg-glass-hover"
    >
      {children}
    </button>
  );
}
