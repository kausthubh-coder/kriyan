import { ReactNode } from "react";

interface ToastProps {
  title: string;
  description?: string;
  variant?: "success" | "error" | "info";
  onClose?: () => void;
  action?: ReactNode;
}

const variants = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-error/30 bg-error/10 text-error",
  info: "border-glass-border bg-glass text-text-primary",
};

export function Toast({
  title,
  description,
  variant = "info",
  onClose,
  action,
}: ToastProps) {
  return (
    <div className={`glass-card p-4 border ${variants[variant]} w-full max-w-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs text-text-secondary">{description}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Close
          </button>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

interface ToastStackProps {
  children: ReactNode;
}

export function ToastStack({ children }: ToastStackProps) {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
      {children}
    </div>
  );
}
