import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

type Shortcut = { keys: string; label: string; context?: string };

const SHORTCUTS: Shortcut[] = [
  { keys: "F1  ou  ?", label: "Abrir/fechar este painel de atalhos", context: "Global" },
  { keys: "Enter", label: "Adicionar item da busca ao carrinho", context: "Vendas" },
  { keys: "Esc", label: "Fechar busca / diálogos", context: "Global" },
  { keys: "F2", label: "Ir para pagamento (finalizar venda)", context: "Vendas" },
  { keys: "Ctrl + K", label: "Focar campo de busca", context: "Vendas / Estoque" },
  { keys: "Setas", label: "Navegar entre resultados", context: "Vendas" },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "F1") { e.preventDefault(); setOpen((v) => !v); return; }
      if (!editing && e.key === "?") { e.preventDefault(); setOpen((v) => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" /> Atalhos do teclado
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
              <div className="min-w-0">
                <div>{s.label}</div>
                {s.context && <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.context}</div>}
              </div>
              <kbd className="font-mono text-xs px-2 py-1 rounded border border-border bg-muted/40 whitespace-nowrap">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground text-center">
          Pressione <kbd className="font-mono">F1</kbd> a qualquer momento para reabrir.
        </div>
      </DialogContent>
    </Dialog>
  );
}
