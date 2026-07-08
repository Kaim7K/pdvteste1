import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wallet, Search, User as UserIcon, CheckCircle2, Receipt } from "lucide-react";
import { formatBRL, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fiado")({
  component: FiadoPage,
});

type FiadoSale = {
  id: string;
  sale_number: number;
  total: number;
  paid: number;
  created_at: string;
  observation: string | null;
  fiado_customer_id: string | null;
  fiado_customers: { id: string; name: string; phone: string | null } | null;
};

type CustomerGroup = {
  id: string | null;
  name: string;
  phone: string | null;
  open: FiadoSale[];
  openTotal: number;
  saleCount: number;
};

function FiadoPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<{ group: CustomerGroup; sale?: FiadoSale } | null>(null);

  const openSalesQ = useQuery({
    queryKey: ["fiado-open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, total, paid, created_at, observation, fiado_customer_id, fiado_customers(id,name,phone)")
        .eq("status", "fiado_open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FiadoSale[];
    },
  });

  const groups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>();
    for (const sale of openSalesQ.data ?? []) {
      const key = sale.fiado_customer_id ?? "__unknown__";
      const name = sale.fiado_customers?.name ?? "Sem responsável";
      const phone = sale.fiado_customers?.phone ?? null;
      const existing = map.get(key);
      const remaining = Number(sale.total) - Number(sale.paid);
      if (existing) {
        existing.open.push(sale);
        existing.openTotal += remaining;
        existing.saleCount += 1;
      } else {
        map.set(key, {
          id: sale.fiado_customer_id,
          name,
          phone,
          open: [sale],
          openTotal: remaining,
          saleCount: 1,
        });
      }
    }
    const list = [...map.values()].sort((a, b) => b.openTotal - a.openTotal);
    if (!search.trim()) return list;
    const term = search.trim().toLowerCase();
    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(term) ||
        (g.phone ?? "").toLowerCase().includes(term),
    );
  }, [openSalesQ.data, search]);

  const totalOpen = groups.reduce((s, g) => s + g.openTotal, 0);
  const totalSales = groups.reduce((s, g) => s + g.saleCount, 0);

  async function quitarVenda(sale: FiadoSale, method: "dinheiro" | "pix" | "debito" | "credito" | "outros") {
    if (!user) return;
    const remaining = Number(sale.total) - Number(sale.paid);
    const { error: payErr } = await supabase.from("payments").insert({
      sale_id: sale.id,
      method,
      amount: remaining,
    });
    if (payErr) return toast.error(payErr.message);
    const { error: updErr } = await supabase
      .from("sales")
      .update({ paid: Number(sale.total), status: "completed" })
      .eq("id", sale.id);
    if (updErr) return toast.error(updErr.message);
    toast.success(`Venda #${sale.sale_number} quitada`);
    qc.invalidateQueries({ queryKey: ["fiado-open"] });
    qc.invalidateQueries({ queryKey: ["sales-history"] });
    setPayOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Fiado"
        subtitle="Vendas em aberto agrupadas por responsável"
      />

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="Clientes com fiado aberto" value={String(groups.length)} icon={<UserIcon className="h-4 w-4" />} />
          <StatCard label="Vendas em aberto" value={String(totalSales)} icon={<Receipt className="h-4 w-4" />} />
          <StatCard label="Total a receber" value={formatBRL(totalOpen)} icon={<Wallet className="h-4 w-4" />} highlight />
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-3">
          {openSalesQ.isLoading && (
            <Card className="p-8 text-center text-sm text-muted-foreground">Carregando fiados...</Card>
          )}
          {!openSalesQ.isLoading && !groups.length && (
            <Card className="p-12 text-center">
              <Wallet className="h-10 w-10 text-primary/60 mx-auto mb-3" />
              <div className="text-sm font-medium">Nenhum fiado em aberto</div>
              <div className="text-xs text-muted-foreground mt-1">
                Vendas com pagamento fiado aparecem aqui automaticamente.
              </div>
            </Card>
          )}

          {groups.map((g) => (
            <Card key={g.id ?? g.name} className="p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/40 grid place-items-center shrink-0">
                      <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{g.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.phone ?? "sem telefone"} · {g.saleCount} venda(s)
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saldo em aberto</div>
                  <div className="text-2xl font-black text-primary tabular-nums">{formatBRL(g.openTotal)}</div>
                </div>
              </div>

              <div className="rounded-md border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 font-medium">Venda</th>
                      <th className="text-left p-2 font-medium">Data</th>
                      <th className="text-right p-2 font-medium">Total</th>
                      <th className="text-right p-2 font-medium">Pago</th>
                      <th className="text-right p-2 font-medium">Restante</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.open.map((s) => {
                      const remaining = Number(s.total) - Number(s.paid);
                      return (
                        <tr key={s.id} className="border-t border-border/40">
                          <td className="p-2 font-mono text-xs">#{s.sale_number}</td>
                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                          <td className="p-2 text-right tabular-nums">{formatBRL(Number(s.total))}</td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">{formatBRL(Number(s.paid))}</td>
                          <td className="p-2 text-right tabular-nums font-semibold text-warning">{formatBRL(remaining)}</td>
                          <td className="p-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setPayTarget({ group: g, sale: s }); setPayOpen(true); }}
                              className="gap-1.5"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Quitar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <QuitarModal
        open={payOpen}
        onOpenChange={setPayOpen}
        target={payTarget}
        onConfirm={quitarVenda}
      />
    </div>
  );
}

function StatCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={"p-4 " + (highlight ? "border-primary/40" : "")}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className={"text-2xl font-black tabular-nums " + (highlight ? "text-primary" : "")}>{value}</div>
    </Card>
  );
}

function QuitarModal({
  open,
  onOpenChange,
  target,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: { group: CustomerGroup; sale?: FiadoSale } | null;
  onConfirm: (sale: FiadoSale, method: "dinheiro" | "pix" | "debito" | "credito" | "outros") => void;
}) {
  const sale = target?.sale;
  const remaining = sale ? Number(sale.total) - Number(sale.paid) : 0;
  const [method, setMethod] = useState<"dinheiro" | "pix" | "debito" | "credito" | "outros">("dinheiro");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quitar fiado</DialogTitle>
          <DialogDescription>
            {target?.group.name} — venda #{sale?.sale_number}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between p-3 rounded-md bg-muted/40">
            <span className="text-sm text-muted-foreground">Valor a quitar</span>
            <span className="text-2xl font-black text-primary tabular-nums">{formatBRL(remaining)}</span>
          </div>
          <div>
            <Label>Forma de recebimento</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {(["dinheiro", "pix", "debito", "credito", "outros"] as const).map((m) => (
                <Badge
                  key={m}
                  variant={method === m ? "default" : "outline"}
                  className="cursor-pointer justify-center h-9 uppercase tracking-widest"
                  onClick={() => setMethod(m)}
                >
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="glow-primary"
            onClick={() => sale && onConfirm(sale, method)}
            disabled={!sale}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar quitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
