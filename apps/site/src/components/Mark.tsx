// The ensō: a day drawn as one stroke that opens where you are now. Paths from docs/design/v3/logo/mark.svg.
export function Mark({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M21.00 10.09A9.2 9.2 0 1 1 15.15 3.35L14.83 4.97A6.35 6.35 0 1 0 18.87 9.62Z" />
      <circle cx="19.94" cy="9.85" r="1.09" />
      <circle cx="14.99" cy="4.16" r="0.82" />
    </svg>
  );
}
