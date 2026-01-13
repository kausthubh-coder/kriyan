"use client";

import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className = "", onClick, hover = false }: CardProps) {
  const hoverStyles = hover || onClick
    ? "cursor-pointer hover:bg-glass-hover hover:border-glass-border/50 transition-all duration-200"
    : "";

  return (
    <div
      className={`glass-card p-4 ${hoverStyles} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
