import { Link, useRouterState } from "@tanstack/react-router";
import {
  ScanBarcode,
  Package,
  History,
  ShieldCheck,
  Settings as SettingsIcon,
  Wallet,
  BarChart3,
  Barcode,
  LogOut,
  Store,
  TreeDeciduous,
  Sun,
  Moon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

const mainItems = [
  { to: "/vendas", label: "Vendas", icon: ScanBarcode },
  { to: "/estoque", label: "Estoque", icon: Package },
  { to: "/etiquetas", label: "Etiquetas", icon: Barcode },
  { to: "/historico", label: "Histórico", icon: History },
];

const adminItems = [
  { to: "/fiado", label: "Fiado", icon: Wallet },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, gerenteOnly: true },
  { to: "/auditoria", label: "Auditoria geral", icon: ShieldCheck, gerenteOnly: true },
  { to: "/configuracoes", label: "Configurações", icon: SettingsIcon, gerenteOnly: true },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, role, isGerente } = useAuth();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-sidebar border-r border-sidebar-border">
      <div className="px-5 pt-6 pb-5 border-b border-sidebar-border">
        <BrandLogo />
      </div>

      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-6">
        <SidebarGroup label="Operação" items={mainItems} pathname={pathname} isGerente={isGerente} />
        <SidebarGroup label="Administração" items={adminItems} pathname={pathname} isGerente={isGerente} />
      </nav>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/40 grid place-items-center shrink-0">
            <Store className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold truncate">Loja Matriz</div>
            <div className="text-[10px] text-muted-foreground truncate">Alameda das Árvores, 123</div>
            <div className="text-[10px] text-muted-foreground truncate">Bairro Centro</div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-sidebar-border">
        <div className="px-2 py-2 mb-2 rounded-lg bg-sidebar-accent/60">
          <div className="text-xs font-medium truncate">{user?.email ?? "—"}</div>
          <div className="text-[10px] uppercase tracking-widest text-primary/90 mt-0.5">
            {role ?? "carregando"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" /> Sair
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={toggle}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function BrandLogo() {
  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="px-3 py-0.5 rounded-full border border-primary/60 bg-primary/10">
        <span className="text-[9px] font-bold tracking-[0.25em] text-primary uppercase">
          Mercadinho
        </span>
      </div>
      <div className="flex items-start gap-2">
        <div className="pt-1">
          <TreeDeciduous className="h-10 w-10 text-primary drop-shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_50%,transparent)]" />
        </div>
        <div className="leading-[0.92] text-center">
          <div className="text-[15px] font-black tracking-tight text-sidebar-foreground">
            ALAMEDA DAS
          </div>
          <div className="text-[22px] font-black tracking-tight text-primary drop-shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
            ÁRVORES
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarGroup({
  label,
  items,
  pathname,
  isGerente,
}: {
  label: string;
  items: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; gerenteOnly?: boolean }[];
  pathname: string;
  isGerente: boolean;
}) {
  const visible = items.filter((i) => !i.gerenteOnly || isGerente);
  if (!visible.length) return null;
  return (
    <div>
      <div className="px-3 mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
        {label}
      </div>
      <div className="space-y-0.5">
        {visible.map((it) => {
          const active = pathname === it.to || pathname.startsWith(it.to + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group",
                "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground hover:translate-x-0.5",
                active
                  ? "bg-primary/12 text-primary font-semibold shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
                  : "text-sidebar-foreground/75"
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
                />
              )}
              <Icon className={cn("h-4 w-4 shrink-0 transition-transform", active ? "text-primary" : "group-hover:scale-110")} />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
