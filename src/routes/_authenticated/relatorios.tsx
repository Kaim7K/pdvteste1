import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sellerNameMapQuery } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { formatBRL, formatDate } from "@/lib/format";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package,
  AlertTriangle, Trophy, Users, CreditCard, Lightbulb, Download,
  Clock, Calendar,
} from "lucide-react";

import { downloadCSV, todayStamp } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito",
  pix: "Pix", outros: "Outros", fiado: "Fiado",
};

type RangePreset = "semana" | "mes" | "ano" | "custom";
const PRESET_DAYS: Record<Exclude<RangePreset, "custom">, number> = { semana: 7, mes: 30, ano: 365 };
const PRESET_LABEL: Record<RangePreset, string> = {
  semana: "Semanal", mes: "Mensal", ano: "Anual", custom: "Personalizado",
};

function RelatoriosPage() {
  const { isGerente } = useAuth();
  const [preset, setPreset] = useState<RangePreset>("mes");
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const now = useMemo(() => new Date(), []);
  const rangeDays = useMemo(() => {
    if (preset === "custom") {
      const a = new Date(customStart);
      const b = new Date(customEnd);
      return Math.max(1, Math.ceil((b.getTime() - a.getTime()) / 86400000));
    }
    return PRESET_DAYS[preset];
  }, [preset, customStart, customEnd]);

  const start = useMemo(() => {
    if (preset === "custom") {
      const d = new Date(customStart);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const d = new Date(now);
    d.setDate(d.getDate() - rangeDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now, rangeDays, preset, customStart]);
  const prevStart = useMemo(() => {
    const d = new Date(start);
    d.setDate(d.getDate() - rangeDays);
    return d;
  }, [start, rangeDays]);

  const salesQ = useQuery({
    queryKey: ["report-sales", preset, customStart, customEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, created_at, total, discount, status, seller_id, payments(method, amount), sale_items(product_id, product_name, quantity, unit_price, subtotal)")
        .gte("created_at", prevStart.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const productsQ = useQuery({
    queryKey: ["report-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock, price, cost_price, active")
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const profilesQ = useQuery(sellerNameMapQuery());

  const sales = salesQ.data ?? [];
  const products = productsQ.data ?? [];
  const profiles = profilesQ.data ?? {};

  const analysis = useMemo(() => {
    const inRange = sales.filter((s) => new Date(s.created_at) >= start && s.status !== "cancelled");
    const inPrev = sales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= prevStart && d < start && s.status !== "cancelled";
    });

    const revenue = inRange.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const prevRevenue = inPrev.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const growth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

    const count = inRange.length;
    const avgTicket = count > 0 ? revenue / count : 0;
    const itemsSold = inRange.reduce(
      (sum, s) => sum + (s.sale_items ?? []).reduce((a: number, it) => a + Number(it.quantity || 0), 0),
      0,
    );

    // Custo aproximado
    const costMap = new Map(products.map((p) => [p.id, Number(p.cost_price || 0)]));
    const cost = inRange.reduce((sum, s) => {
      return sum + (s.sale_items ?? []).reduce((a: number, it) => {
        return a + (it.product_id ? (costMap.get(it.product_id) ?? 0) : 0) * Number(it.quantity || 0);
      }, 0);
    }, 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Vendas por dia
    const byDay = new Map<string, number>();
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    inRange.forEach((s) => {
      const k = new Date(s.created_at).toISOString().slice(0, 10);
      byDay.set(k, (byDay.get(k) ?? 0) + Number(s.total || 0));
    });
    const daily = Array.from(byDay.entries()).map(([date, total]) => ({ date, total }));

    // Melhor dia
    const bestDay = daily.reduce((best, d) => (d.total > best.total ? d : best), { date: "", total: 0 });

    // Top produtos
    const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
    inRange.forEach((s) => {
      (s.sale_items ?? []).forEach((it) => {
        const key = it.product_id ?? it.product_name;
        const cur = prodMap.get(key) ?? { name: it.product_name, qty: 0, revenue: 0 };
        cur.qty += Number(it.quantity || 0);
        cur.revenue += Number(it.subtotal || 0);
        prodMap.set(key, cur);
      });
    });
    const topProducts = Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);

    // Ranking vendedores
    const sellerMap = new Map<string, { revenue: number; count: number }>();
    inRange.forEach((s) => {
      const cur = sellerMap.get(s.seller_id) ?? { revenue: 0, count: 0 };
      cur.revenue += Number(s.total || 0);
      cur.count += 1;
      sellerMap.set(s.seller_id, cur);
    });
    const topSellers = Array.from(sellerMap.entries())
      .map(([id, v]) => ({ id, name: profiles[id] ?? "—", ...v }))
      .sort((a, b) => b.revenue - a.revenue);

    // Métodos de pagamento
    const payMap = new Map<string, number>();
    inRange.forEach((s) => {
      (s.payments ?? []).forEach((p) => {
        payMap.set(p.method, (payMap.get(p.method) ?? 0) + Number(p.amount || 0));
      });
    });
    const payments = Array.from(payMap.entries())
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);
    const totalPayments = payments.reduce((s, p) => s + p.amount, 0);

    // Estoque baixo / zerado
    const lowStock = products
      .filter((p) => Number(p.stock) <= 5)
      .sort((a, b) => Number(a.stock) - Number(b.stock))
      .slice(0, 15);
    const outOfStock = products.filter((p) => Number(p.stock) <= 0).length;

    // Vendas por hora do dia (0-23)
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, count: 0 }));
    inRange.forEach((s) => {
      const h = new Date(s.created_at).getHours();
      byHour[h].total += Number(s.total || 0);
      byHour[h].count += 1;
    });
    const maxHour = Math.max(1, ...byHour.map((h) => h.total));
    const peakHour = byHour.reduce((best, h) => (h.total > best.total ? h : best), { hour: 0, total: 0, count: 0 });

    // Vendas por dia da semana (0=Dom, 6=Sáb)
    const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const byDow = Array.from({ length: 7 }, (_, i) => ({ dow: i, label: DOW[i], total: 0, count: 0 }));
    inRange.forEach((s) => {
      const d = new Date(s.created_at).getDay();
      byDow[d].total += Number(s.total || 0);
      byDow[d].count += 1;
    });
    const maxDow = Math.max(1, ...byDow.map((d) => d.total));
    const bestDow = byDow.reduce((best, d) => (d.total > best.total ? d : best), byDow[0]);

    // Ticket médio por dia
    const avgTicketDaily = daily.map((d) => {
      const dayStr = d.date;
      const dayCount = inRange.filter((s) => new Date(s.created_at).toISOString().slice(0, 10) === dayStr).length;
      return { date: dayStr, avg: dayCount ? d.total / dayCount : 0 };
    });
    const maxAvgTicket = Math.max(1, ...avgTicketDaily.map((d) => d.avg));

    // Insights automáticos
    const insights: { icon: typeof TrendingUp; text: string; tone: "success" | "warning" | "info" }[] = [];
    if (growth !== null) {
      if (growth >= 10) insights.push({ icon: TrendingUp, tone: "success", text: `Receita cresceu ${growth.toFixed(1)}% vs. período anterior.` });
      else if (growth <= -10) insights.push({ icon: TrendingDown, tone: "warning", text: `Receita caiu ${Math.abs(growth).toFixed(1)}% vs. período anterior. Reveja preços, mix e horários de pico.` });
      else insights.push({ icon: TrendingUp, tone: "info", text: `Receita estável (${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%) vs. período anterior.` });
    }
    if (bestDay.total > 0) {
      insights.push({ icon: Trophy, tone: "info", text: `Melhor dia: ${formatDate(bestDay.date)} com ${formatBRL(bestDay.total)}.` });
    }
    if (peakHour.total > 0) {
      insights.push({ icon: Clock, tone: "info", text: `Horário de pico: ${peakHour.hour.toString().padStart(2, "0")}h com ${formatBRL(peakHour.total)} em vendas.` });
    }
    if (bestDow.total > 0) {
      insights.push({ icon: Calendar, tone: "info", text: `Melhor dia da semana: ${bestDow.label} com ${formatBRL(bestDow.total)}.` });
    }
    if (topProducts[0]) {
      insights.push({ icon: Package, tone: "info", text: `Produto campeão: ${topProducts[0].name} (${topProducts[0].qty} un, ${formatBRL(topProducts[0].revenue)}).` });
    }
    if (outOfStock > 0) {
      insights.push({ icon: AlertTriangle, tone: "warning", text: `${outOfStock} produto(s) com estoque zerado — repor com urgência.` });
    }
    if (margin > 0 && margin < 15 && cost > 0) {
      insights.push({ icon: TrendingDown, tone: "warning", text: `Margem bruta baixa (${margin.toFixed(1)}%). Revise preços ou custos.` });
    } else if (margin >= 30) {
      insights.push({ icon: TrendingUp, tone: "success", text: `Margem bruta saudável (${margin.toFixed(1)}%).` });
    }
    const fiadoPay = payments.find((p) => p.method === "fiado");
    if (fiadoPay && totalPayments > 0 && fiadoPay.amount / totalPayments > 0.25) {
      insights.push({ icon: AlertTriangle, tone: "warning", text: `Fiado representa ${((fiadoPay.amount / totalPayments) * 100).toFixed(0)}% do faturamento — monitore inadimplência.` });
    }

    const maxDaily = Math.max(1, ...daily.map((d) => d.total));

    return {
      revenue, prevRevenue, growth, count, avgTicket, itemsSold,
      cost, profit, margin, daily, maxDaily, topProducts, topSellers,
      payments, totalPayments, lowStock, outOfStock, insights,
      byHour, maxHour, peakHour, byDow, maxDow, bestDow,
      avgTicketDaily, maxAvgTicket,
    };
  }, [sales, products, profiles, start, prevStart, rangeDays]);


  const loading = salesQ.isLoading || productsQ.isLoading;

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Visão gerencial de vendas, produtos e insights automáticos"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {(["semana", "mes", "ano", "custom"] as RangePreset[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={preset === r ? "default" : "outline"}
                  onClick={() => setPreset(r)}
                >
                  {PRESET_LABEL[r]}
                </Button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-9 rounded-md border border-input bg-input px-2 text-sm"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-9 rounded-md border border-input bg-input px-2 text-sm"
                />
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => {
              downloadCSV(`relatorio_diario_${preset}_${todayStamp()}.csv`,
                analysis.daily.map((d) => ({ data: d.date, receita: d.total })));
            }}>
              <Download className="h-4 w-4 mr-2" /> Diário
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              downloadCSV(`relatorio_produtos_${preset}_${todayStamp()}.csv`,
                analysis.topProducts.map((p, i) => ({ posicao: i + 1, produto: p.name, quantidade: p.qty, receita: p.revenue })));
            }}>
              <Download className="h-4 w-4 mr-2" /> Produtos
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Carregando dados…</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi
                icon={DollarSign}
                label="Receita"
                value={formatBRL(analysis.revenue)}
                trend={analysis.growth}
              />
              <Kpi
                icon={ShoppingCart}
                label="Vendas"
                value={String(analysis.count)}
                sub={`Ticket médio ${formatBRL(analysis.avgTicket)}`}
              />
              <Kpi
                icon={Package}
                label="Itens vendidos"
                value={String(analysis.itemsSold)}
              />
              {isGerente && (
                <Kpi
                  icon={TrendingUp}
                  label="Lucro bruto est."
                  value={formatBRL(analysis.profit)}
                  sub={`Margem ${analysis.margin.toFixed(1)}%`}
                />
              )}
            </div>

            {/* Insights */}
            {analysis.insights.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Insights automáticos</h2>
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  {analysis.insights.map((ins, i) => {
                    const Icon = ins.icon;
                    const tone =
                      ins.tone === "success" ? "border-success/40 bg-success/5 text-success" :
                      ins.tone === "warning" ? "border-warning/40 bg-warning/5 text-warning" :
                      "border-border bg-muted/30 text-foreground";
                    return (
                      <div key={i} className={"flex items-start gap-2 rounded-md border px-3 py-2 text-xs " + tone}>
                        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                        <span className="leading-relaxed">{ins.text}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Gráfico diário */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold mb-4">Receita diária</h2>
              <div className="flex items-end gap-1 h-40">
                {analysis.daily.map((d) => {
                  const h = (d.total / analysis.maxDaily) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${formatDate(d.date)}: ${formatBRL(d.total)}`}>
                      <div
                        className="w-full bg-primary/70 hover:bg-primary rounded-t transition-colors"
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>{formatDate(analysis.daily[0]?.date ?? new Date())}</span>
                <span>{formatDate(analysis.daily[analysis.daily.length - 1]?.date ?? new Date())}</span>
              </div>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Vendas por horário */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Vendas por horário</h2>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Pico: {analysis.peakHour.hour.toString().padStart(2, "0")}h
                  </span>
                </div>
                <div className="flex items-end gap-0.5 h-32">
                  {analysis.byHour.map((h) => {
                    const height = (h.total / analysis.maxHour) * 100;
                    const isPeak = h.hour === analysis.peakHour.hour && h.total > 0;
                    return (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 min-w-0"
                        title={`${h.hour.toString().padStart(2, "0")}h: ${formatBRL(h.total)} (${h.count} vendas)`}>
                        <div
                          className={"w-full rounded-t transition-colors " + (isPeak ? "bg-primary glow-primary" : "bg-primary/50 hover:bg-primary/80")}
                          style={{ height: `${Math.max(height, 2)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground tabular-nums">
                  <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
                </div>
              </Card>

              {/* Vendas por dia da semana */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Vendas por dia da semana</h2>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Melhor: {analysis.bestDow.label}
                  </span>
                </div>
                <div className="flex items-end gap-2 h-32">
                  {analysis.byDow.map((d) => {
                    const height = (d.total / analysis.maxDow) * 100;
                    const isBest = d.dow === analysis.bestDow.dow && d.total > 0;
                    return (
                      <div key={d.dow} className="flex-1 flex flex-col items-center gap-1"
                        title={`${d.label}: ${formatBRL(d.total)} (${d.count} vendas)`}>
                        <div
                          className={"w-full rounded-t transition-colors " + (isBest ? "bg-success" : "bg-chart-2/60 hover:bg-chart-2")}
                          style={{ height: `${Math.max(height, 2)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2 text-[10px] text-muted-foreground">
                  {analysis.byDow.map((d) => (
                    <span key={d.dow} className="flex-1 text-center">{d.label}</span>
                  ))}
                </div>
              </Card>

              {/* Ticket médio por dia */}
              <Card className="p-5 lg:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Ticket médio diário</h2>
                </div>
                <div className="flex items-end gap-1 h-32">
                  {analysis.avgTicketDaily.map((d) => {
                    const height = (d.avg / analysis.maxAvgTicket) * 100;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0"
                        title={`${formatDate(d.date)}: ${formatBRL(d.avg)}`}>
                        <div
                          className="w-full bg-chart-4/70 hover:bg-chart-4 rounded-t transition-colors"
                          style={{ height: `${Math.max(height, 2)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Top produtos */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Top 10 produtos</h2>
                </div>
                {analysis.topProducts.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem vendas no período.</div>
                ) : (
                  <ul className="space-y-2">
                    {analysis.topProducts.map((p, i) => {
                      const maxQty = analysis.topProducts[0].qty;
                      return (
                        <li key={i} className="text-xs">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="truncate">{i + 1}. {p.name}</span>
                            <span className="tabular-nums text-muted-foreground shrink-0">
                              {p.qty} un · {formatBRL(p.revenue)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${(p.qty / maxQty) * 100}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* Métodos de pagamento */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Formas de pagamento</h2>
                </div>
                {analysis.payments.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem pagamentos registrados.</div>
                ) : (
                  <ul className="space-y-2">
                    {analysis.payments.map((p) => {
                      const pct = analysis.totalPayments > 0 ? (p.amount / analysis.totalPayments) * 100 : 0;
                      return (
                        <li key={p.method} className="text-xs">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span>{PAYMENT_LABEL[p.method] ?? p.method}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {formatBRL(p.amount)} · {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* Vendedores */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Ranking de vendedores</h2>
                </div>
                {analysis.topSellers.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem vendas no período.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium pb-2">#</th>
                        <th className="text-left font-medium pb-2">Vendedor</th>
                        <th className="text-right font-medium pb-2">Vendas</th>
                        <th className="text-right font-medium pb-2">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.topSellers.map((s, i) => (
                        <tr key={s.id} className="border-t border-border/40">
                          <td className="py-2">{i + 1}</td>
                          <td className="py-2 truncate max-w-[160px]">{s.name}</td>
                          <td className="py-2 text-right tabular-nums">{s.count}</td>
                          <td className="py-2 text-right tabular-nums">{formatBRL(s.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              {/* Estoque baixo */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <h2 className="text-sm font-semibold">Alerta de estoque</h2>
                  {analysis.outOfStock > 0 && (
                    <Badge variant="outline" className="border-destructive/60 text-destructive ml-auto">
                      {analysis.outOfStock} zerado(s)
                    </Badge>
                  )}
                </div>
                {analysis.lowStock.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Nenhum produto com estoque baixo. 👍</div>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {analysis.lowStock.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-2 text-xs">
                        <span className="truncate">{p.name}</span>
                        <span
                          className={
                            "tabular-nums font-medium shrink-0 " +
                            (Number(p.stock) <= 0 ? "text-destructive" : "text-warning")
                          }
                        >
                          {Number(p.stock)} un
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, trend,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
  trend?: number | null;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      {typeof trend === "number" && (
        <div className={"text-[11px] mt-1 flex items-center gap-1 " + (trend >= 0 ? "text-success" : "text-destructive")}>
          {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend >= 0 ? "+" : ""}{trend.toFixed(1)}% vs. anterior
        </div>
      )}
    </Card>
  );
}
