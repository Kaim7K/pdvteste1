import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, sellerLookupQuery } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { formatBRL, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Trash2, Printer, Download, Search, Calendar, DollarSign,
  ShoppingCart, TrendingUp, Users, XCircle,
} from "lucide-react";
import { printReceipt } from "@/lib/print-receipt";
import { downloadCSV, todayStamp } from "@/lib/csv";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/historico")({
  component: HistoricoPage,
});

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  completed: { label: "Concluída", cls: "border-success/60 text-success bg-success/10" },
  cancelled: { label: "Cancelada", cls: "border-destructive/60 text-destructive bg-destructive/10" },
  fiado_open: { label: "Fiado em aberto", cls: "border-warning/60 text-warning bg-warning/10" },
  fiado_paid: { label: "Fiado quitado", cls: "border-success/60 text-success bg-success/10" },
};

type RangeKey = "hoje" | "7dias" | "30dias" | "mes" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "7 dias" },
  { key: "30dias", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "custom", label: "Personalizado" },
];

function HistoricoPage() {
  const { isGerente } = useAuth();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("30dias");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    if (range === "hoje") start.setHours(0, 0, 0, 0);
    else if (range === "7dias") { start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0); }
    else if (range === "30dias") { start.setDate(start.getDate() - 30); start.setHours(0, 0, 0, 0); }
    else if (range === "mes") { start.setDate(1); start.setHours(0, 0, 0, 0); }
    else {
      start.setTime(new Date(customStart).getTime());
      start.setHours(0, 0, 0, 0);
      end.setTime(new Date(customEnd).getTime());
      end.setHours(23, 59, 59, 999);
    }
    return { startDate: start, endDate: end };
  }, [range, customStart, customEnd]);

  const salesQ = useQuery({
    queryKey: ["sales-history", startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, payments(*), sale_items(*)")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const settingsQ = useQuery(settingsQuery());

  const sellerIds = Array.from(new Set((salesQ.data ?? []).map((s) => s.seller_id)));
  const profilesQ = useQuery(sellerLookupQuery(sellerIds));

  const sales = salesQ.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (statusFilter !== "todos" && s.status !== statusFilter) return false;
      if (term) {
        const seller = profilesQ.data?.[s.seller_id]?.full_name?.toLowerCase() ?? "";
        const num = String(s.sale_number);
        const items = (s.sale_items ?? []).map((i) => i.product_name.toLowerCase()).join(" ");
        if (!num.includes(term) && !seller.includes(term) && !items.includes(term)) return false;
      }
      return true;
    });
  }, [sales, statusFilter, search, profilesQ.data]);

  const metrics = useMemo(() => {
    const valid = filtered.filter((s) => s.status !== "cancelled");
    const revenue = valid.reduce((s, x) => s + Number(x.total || 0), 0);
    const count = valid.length;
    const avg = count ? revenue / count : 0;
    const cancelled = filtered.filter((s) => s.status === "cancelled").length;
    const fiadoOpen = filtered.filter((s) => s.status === "fiado_open").reduce((sum, x) => sum + Number(x.total || 0), 0);
    return { revenue, count, avg, cancelled, fiadoOpen };
  }, [filtered]);

  async function cancelSale(id: string, number: number) {
    if (isGerente) {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) return toast.error(error.message);
      toast.success(`Venda #${number} excluída`);
      qc.invalidateQueries({ queryKey: ["sales-history"] });
      return;
    }
    const reason = prompt(`Cancelar venda #${number}?\n\nInforme o motivo (obrigatório):`, "");
    if (reason === null) return;
    if (!reason.trim()) return toast.error("Motivo é obrigatório para cancelar");
    const { error } = await supabase
      .from("sales")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason.trim() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Venda #${number} cancelada`);
    qc.invalidateQueries({ queryKey: ["sales-history"] });
  }

  type SaleRow = NonNullable<typeof salesQ.data>[number];

  function reprint(s: SaleRow) {
    printReceipt({
      saleNumber: s.sale_number,
      createdAt: s.created_at,
      seller: profilesQ.data?.[s.seller_id]?.full_name ?? profilesQ.data?.[s.seller_id]?.email ?? undefined,
      items: (s.sale_items ?? []).map((i) => ({
        name: i.product_name, quantity: Number(i.quantity), unitPrice: Number(i.unit_price),
      })),
      subtotal: (s.sale_items ?? []).reduce((acc: number, i) => acc + Number(i.subtotal || 0), 0),
      discount: Number(s.discount || 0),
      total: Number(s.total || 0),
      payments: (s.payments ?? []).map((p) => ({ method: p.method, amount: Number(p.amount) })),
      change: Number(s.change_due || 0),
      storeName: settingsQ.data?.market_name || "MERCADO",
      cnpj: settingsQ.data?.cnpj || null,
      address: settingsQ.data?.address || null,
      logoUrl: settingsQ.data?.logo_url || null,
    });
  }

  function exportCSV() {
    const rows: Record<string, unknown>[] = [];
    filtered.forEach((s) => {
      const seller = profilesQ.data?.[s.seller_id]?.full_name ?? profilesQ.data?.[s.seller_id]?.email ?? "";
      (s.sale_items ?? []).forEach((i) => {
        rows.push({
          venda: s.sale_number, data: formatDateTime(s.created_at), status: s.status,
          vendedor: seller, produto: i.product_name, quantidade: Number(i.quantity),
          preco_unit: Number(i.unit_price), subtotal: Number(i.subtotal),
          total_venda: Number(s.total || 0), desconto: Number(s.discount || 0),
        });
      });
    });
    downloadCSV(`vendas_${todayStamp()}.csv`, rows);
    toast.success("CSV exportado");
  }

  return (
    <div>
      <PageHeader
        title="Histórico de Vendas"
        subtitle={isGerente ? "Todas as vendas do sistema" : "Suas vendas"}
        actions={
          <Button size="sm" variant="outline" onClick={exportCSV} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Métricas */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard icon={DollarSign} label="Total vendido" value={formatBRL(metrics.revenue)} accent="primary" />
          <MetricCard icon={ShoppingCart} label="Nº de vendas" value={String(metrics.count)} accent="chart-3" />
          <MetricCard icon={TrendingUp} label="Ticket médio" value={formatBRL(metrics.avg)} accent="success" />
          <MetricCard icon={Users} label="Fiado em aberto" value={formatBRL(metrics.fiadoOpen)} accent="warning" />
          <MetricCard icon={XCircle} label="Canceladas" value={String(metrics.cancelled)} accent="destructive" />
        </div>

        {/* Filtros */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={range === r.key ? "default" : "outline"}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
            {range === "custom" && (
              <div className="flex items-center gap-1 ml-2">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  className="h-9 rounded-md border border-input bg-input px-2 text-sm" />
                <span className="text-xs text-muted-foreground">até</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-9 rounded-md border border-input bg-input px-2 text-sm" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nº, vendedor ou produto..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-input px-3 text-sm">
              <option value="todos">Todos os status</option>
              <option value="completed">Concluída</option>
              <option value="fiado_open">Fiado em aberto</option>
              <option value="fiado_paid">Fiado quitado</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {filtered.length} venda(s) exibida(s)
            </span>
          </div>
        </Card>

        {/* Lista */}
        <div className="space-y-2">
          {filtered.map((s) => {
            const status = STATUS_LABEL[s.status] ?? STATUS_LABEL.completed;
            const isOpen = expanded === s.id;
            return (
              <Card key={s.id} className="p-0 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="w-full grid grid-cols-[80px_1fr_auto_auto_auto_auto] items-center gap-4 p-4 text-left hover:bg-primary/5 transition-colors"
                >
                  <div className="font-mono font-bold text-primary">#{s.sale_number}</div>
                  <div>
                    <div className="text-sm font-medium">{formatDateTime(s.created_at)}</div>
                    {isGerente && <div className="text-xs text-muted-foreground">{profilesQ.data?.[s.seller_id]?.full_name ?? profilesQ.data?.[s.seller_id]?.email ?? "—"}</div>}
                  </div>
                  <Badge variant="outline" className={status.cls}>{status.label}</Badge>
                  <div className="text-right tabular-nums font-bold text-lg">{formatBRL(Number(s.total))}</div>
                  <Button size="icon" variant="ghost" title="Reimprimir recibo"
                    onClick={(e) => { e.stopPropagation(); reprint(s); }}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  {s.status !== "cancelled" ? (
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); cancelSale(s.id, s.sale_number); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : <div />}
                </button>
                {isOpen && (
                  <div className="border-t border-border/40 bg-muted/20 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Itens</div>
                      <div className="space-y-1">
                        {s.sale_items?.map((i) => (
                          <div key={i.id} className="flex justify-between">
                            <span>{i.quantity}× {i.product_name}</span>
                            <span className="tabular-nums">{formatBRL(Number(i.subtotal))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Pagamentos</div>
                      <div className="space-y-1">
                        {s.payments?.map((p) => (
                          <div key={p.id} className="flex justify-between">
                            <span className="capitalize">{p.method}</span>
                            <span className="tabular-nums">{formatBRL(Number(p.amount))}</span>
                          </div>
                        ))}
                      </div>
                      {Number(s.change_due) > 0 && (
                        <div className="flex justify-between mt-2 pt-2 border-t border-border/40">
                          <span className="text-muted-foreground">Troco</span>
                          <span className="tabular-nums">{formatBRL(Number(s.change_due))}</span>
                        </div>
                      )}
                      {s.status === "cancelled" && s.cancel_reason && (
                        <div className="mt-2 pt-2 border-t border-border/40">
                          <div className="text-xs uppercase tracking-widest text-destructive">Motivo do cancelamento</div>
                          <div className="text-sm mt-0.5">{s.cancel_reason}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          {!filtered.length && !salesQ.isLoading && (
            <Card className="p-12 text-center text-sm text-muted-foreground">
              Nenhuma venda encontrada no período/filtros selecionados.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, accent,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  accent: "primary" | "success" | "warning" | "destructive" | "chart-3";
}) {
  const accentCls: Record<string, string> = {
    primary: "text-primary bg-primary/15 border-primary/30",
    success: "text-success bg-success/15 border-success/30",
    warning: "text-warning bg-warning/15 border-warning/30",
    destructive: "text-destructive bg-destructive/15 border-destructive/30",
    "chart-3": "text-chart-3 bg-chart-3/15 border-chart-3/30",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-lg grid place-items-center border", accentCls[accent])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold truncate">{label}</div>
          <div className="text-lg font-bold tabular-nums truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}
