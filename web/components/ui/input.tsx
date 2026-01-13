"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`glass-input px-4 py-2.5 rounded-lg text-text-primary placeholder:text-text-muted transition-all duration-200 ${
            error ? "border-error focus:border-error focus:shadow-error/20" : ""
          } ${className}`}
          {...props}
        />
        {error && <span className="text-sm text-error">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
