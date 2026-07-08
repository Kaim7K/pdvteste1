import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import { ArrowLeft, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estoque/$id")({
  component: ProductDetail,
});

function ProductDetail() {
  const { id } = Route.useParams();

  const productQ = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const auditQ = useQuery({
    queryKey: ["product-audit", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_audit")
        .select("*")
        .eq("product_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const p = productQ.data;

  return (
    <div>
      <PageHeader
        title={p?.name ?? "Produto"}
        subtitle={p ? `${p.internal_code}${p.barcode ? " · " + p.barcode : ""}` : ""}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/estoque"><ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar</Link>
          </Button>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <Card className="p-4 space-y-3">
          <div className="aspect-square rounded-lg bg-muted grid place-items-center overflow-hidden">
            {p?.image_url ? <img src={p.image_url} className="h-full w-full object-cover" alt="" /> : <Package className="h-16 w-16 text-muted-foreground/40" />}
          </div>
          {p && (
            <>
              <Stat label="Preço" value={formatBRL(Number(p.price))} highlight />
              <Stat label="Custo" value={p.cost_price != null ? formatBRL(Number(p.cost_price)) : "—"} />
              <Stat label="Estoque" value={String(p.stock)} />
              <Stat label="Unidade" value={p.unit} />
            </>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Auditoria individual</div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {auditQ.data?.length ? auditQ.data.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-md bg-muted/40 text-sm">
                <div className="w-24 shrink-0">
                  <div className="text-xs uppercase tracking-widest text-primary font-semibold">{a.field}</div>
                  <div className="text-[10px] text-muted-foreground">{a.origin}</div>
                </div>
                <div className="flex-1">
                  <div><span className="text-muted-foreground">De:</span> <span className="font-mono">{a.old_value ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Para:</span> <span className="font-mono text-primary">{a.new_value ?? "—"}</span></div>
                </div>
                <div className="text-xs text-muted-foreground text-right shrink-0">{formatDateTime(a.created_at)}</div>
              </div>
            )) : <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma alteração registrada.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/40 pb-2 last:border-0">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={"tabular-nums font-semibold " + (highlight ? "text-primary text-lg" : "")}>{value}</span>
    </div>
  );
}
