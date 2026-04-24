"use client";

import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  href?: Route;
  imageClassName?: string;
  priority?: boolean;
  showBorder?: boolean;
  variant?: "full" | "compact";
}

export function BrandMark({
  className,
  href,
  imageClassName,
  priority = false,
  showBorder = true,
  variant = "full",
}: BrandMarkProps) {
  const content = (
    <div
      className={cn(
        "inline-flex items-center justify-center bg-transparent",
        variant === "full" ? "px-0 py-0" : "size-10 overflow-hidden rounded-lg",
        showBorder && "border border-white/10 bg-white/[0.03]",
        className,
      )}
    >
      <Image
        src="/axiomtransparentlogo.png"
        alt="Axiom"
        width={1260}
        height={340}
        priority={priority}
        className={cn(
          variant === "full"
            ? "h-10 w-auto select-none object-contain"
            : "h-7 w-[5.8rem] max-w-none -translate-x-1 object-contain select-none",
          imageClassName,
        )}
      />
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link aria-label="Axiom home" href={href} className="inline-flex">
      {content}
    </Link>
  );
}
