"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type AvatarSize = "sm" | "md" | "lg" | "xl"

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-16 text-lg",
}

function Avatar({
  src,
  alt,
  fallback,
  size = "md",
  className,
}: {
  src?: string | null
  alt?: string
  fallback: string
  size?: AvatarSize
  className?: string
}) {
  const [imgError, setImgError] = React.useState(false)

  React.useEffect(() => {
    setImgError(false)
  }, [src])

  const showImage = src && !imgError

  return (
    <span
      data-slot="avatar"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        !showImage &&
          "border border-emerald-400/30 bg-gradient-to-br from-emerald-400/20 to-cyan-400/10",
        sizeClasses[size],
        className
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt || fallback}
          onError={() => setImgError(true)}
          className="size-full object-cover"
        />
      ) : (
        <span className="font-semibold uppercase text-emerald-300">
          {fallback}
        </span>
      )}
    </span>
  )
}

export { Avatar }
export type { AvatarSize }
