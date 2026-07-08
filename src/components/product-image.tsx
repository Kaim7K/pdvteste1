import { useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type ProductImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  alt: string;
  fallback?: ReactNode;
  containerClassName?: string;
};

export function ProductImage({ src, alt, fallback, className, containerClassName, ...props }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const hasSrc = Boolean(src && !failed);

  return (
    <div className={cn("overflow-hidden bg-muted/50", containerClassName ?? "h-full w-full")}> 
      {hasSrc ? (
        <img
          src={src!}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-cover", className)}
          {...props}
        />
      ) : (
        <div className={cn("grid h-full w-full place-items-center text-muted-foreground", className)}>
          {fallback ?? <ImageOff className="h-5 w-5" />}
        </div>
      )}
    </div>
  );
}
