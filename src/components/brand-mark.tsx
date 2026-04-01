"use client";

import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  href?: Route;
  imageClassName?: string;
  showBorder?: boolean;
}

export function BrandMark({
  className,
  href,
  imageClassName,
  showBorder = true,
}: BrandMarkProps) {
  const content = (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-white/5 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur",
        showBorder && "border border-white/10",
        className,
      )}
    >
      <Image
        src="/axiomtransparentlogo.png"
        alt="Axiom"
        width={1260}
        height={340}
        priority
        className={cn(
          "h-10 w-auto object-contain select-none drop-shadow-[0_0_12px_rgba(255,255,255,0.08)]",
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
