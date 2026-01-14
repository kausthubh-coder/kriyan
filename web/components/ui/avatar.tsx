import Image from "next/image";

interface AvatarProps {
  src?: string;
  alt?: string;
  initials?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
};

const pixelSizes = {
  sm: 32,
  md: 40,
  lg: 56,
};

export function Avatar({ src, alt = "Avatar", initials, size = "md" }: AvatarProps) {
  return (
    <div
      className={`rounded-full bg-glass flex items-center justify-center overflow-hidden ${sizes[size]}`}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={pixelSizes[size]}
          height={pixelSizes[size]}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-text-secondary font-medium">
          {initials ?? alt.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
