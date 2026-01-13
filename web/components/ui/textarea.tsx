"use client";

import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`glass-input px-4 py-2.5 rounded-lg text-text-primary placeholder:text-text-muted transition-all duration-200 resize-none ${
            error ? "border-error focus:border-error focus:shadow-error/20" : ""
          } ${className}`}
          {...props}
        />
        {error && <span className="text-sm text-error">{error}</span>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
