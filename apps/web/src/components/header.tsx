"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";
import { ModeToggle } from "./mode-toggle";
import { cn } from "@my-better-t-app/ui/lib/utils";

const links = [
  { to: "/", label: "Home" },
  { to: "/recorder", label: "Recorder" },
] as const;

export default function Header() {
  const pathname = usePathname();
  return (
    <header>
      <div className="flex flex-row items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-sm">
            <Mic className="size-4" />
            RecPipeline
          </Link>
          <nav className="flex gap-1">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                href={to}
                className={cn(
                  "rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                  pathname === to
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="http://localhost:3000/health"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            API
          </a>
          <ModeToggle />
        </div>
      </div>
      <hr className="border-border/60" />
    </header>
  );
}
