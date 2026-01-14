import { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="relative group">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block">
        <span className="glass px-2 py-1 rounded text-xs text-text-primary whitespace-nowrap">
          {content}
        </span>
      </span>
    </span>
  );
}
