import { BrandMark } from "@/lib/brand";

// The logo mark. Which one is in use is set in src/lib/brand.tsx.
export function Mark({ size = 22, title }: { size?: number; title?: string }) {
  return <BrandMark size={size} title={title} />;
}
