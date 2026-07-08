import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
}) {
  return (
    <div className="relative border-b border-border/60 bg-background/70 backdrop-blur-xl sticky top-0 z-30">
      {/* Subtle top glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-70"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 55%, transparent) 50%, transparent 100%)",
        }}
      />
      <div className="min-h-[68px] flex items-center justify-between px-6 gap-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="hidden sm:grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 border border-primary/30">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
