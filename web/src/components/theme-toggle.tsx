"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Light / dark / system, stored in localStorage and applied by the head script (lib/theme.ts). */
export function ThemeToggle({ className, side = "bottom" }: { className?: string; side?: "top" | "bottom" }) {
  const { t } = useI18n();
  // Read on open: the stored preference isn't known while rendering on the server.
  const [theme, setTheme] = useState<ThemePreference>("system");

  return (
    <DropdownMenu onOpenChange={(open) => open && setTheme(readThemePreference())}>
      <DropdownMenuTrigger
        aria-label={t.common.theme}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Sun className="size-4 dark:hidden" aria-hidden />
        <Moon className="hidden size-4 dark:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40" side={side} align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.common.theme}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => {
              setTheme(v as ThemePreference);
              setThemePreference(v as ThemePreference);
            }}
          >
            <DropdownMenuRadioItem value="system">
              <Monitor aria-hidden /> {t.common.themeSystem}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun aria-hidden /> {t.common.themeLight}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon aria-hidden /> {t.common.themeDark}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
