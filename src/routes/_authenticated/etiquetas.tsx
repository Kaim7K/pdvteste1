import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, ArrowLeft } from "lucide-react";
import { formatBRL } from "@/lib/format";
import JsBarcode from "jsbarcode";

export const Route = createFileRoute("/_authenticated/etiquetas")({
  component: EtiquetasPage,
});

function EtiquetasPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [labelWidth, setLabelWidth] = useState(50);
  const [labelHeight, setLabelHeight] = useState(30);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const productsQ = useQuery({
    queryKey: ["etiquetas-products", search],
    queryFn: async () => {
      const q = supabase
        .from("products")
        .select("id, name, price, barcode, internal_code")
        .eq("active", true)
        .order("name")
        .limit(200);
      if (search.trim()) {
        const t = `%${search.trim()}%`;
        q.or(`name.ilike.${t},barcode.ilike.${t},internal_code.ilike.${t}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = productsQ.data ?? [];

  const toPrint = useMemo(() => {
    return items
      .filter((p) => (selected[p.id] ?? 0) > 0)
      .flatMap((p) => Array.from({ length: selected[p.id] }, () => p));
  }, [items, selected]);

  useEffect(() => {
    // Render barcodes SVG após cada mudança
    if (!printAreaRef.current) return;
    printAreaRef.current.querySelectorAll<SVGSVGElement>("svg[data-barcode]").forEach((svg) => {
      const code = svg.getAttribute("data-barcode") || "";
      try {
        JsBarcode(svg, code, {
          format: "CODE128",
          width: 1.4,
          height: 40,
          displayValue: true,
          fontSize: 10,
          margin: 0,
        });
      } catch {
        // ignora códigos inválidos
      }
    });
  }, [toPrint, labelWidth, labelHeight]);

  function set(id: string, qty: number) {
    setSelected((s) => ({ ...s, [id]: Math.max(0, qty) }));
  }

  return (
    <div>
      <PageHeader
        title="Etiquetas de código de barras"
        subtitle="Selecione produtos e imprima em folhas de etiquetas"
        actions={
          <div className="flex gap-2">
            <Link to="/estoque">
              <Button size="sm" variant="ghost"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
            </Link>
            <Button size="sm" onClick={() => window.print()} disabled={!toPrint.length}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir ({toPrint.length})
            </Button>
          </div>
        }
      />

      <div className="p-6 grid lg:grid-cols-[1fr_auto] gap-6">
        <Card className="p-4 no-print">
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="flex-1 min-w-[200px]">
              <Label>Buscar</Label>
              <Input className="mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, código..." />
            </div>
            <div>
              <Label>Largura (mm)</Label>
              <Input className="mt-1 w-24" type="number" value={labelWidth} onChange={(e) => setLabelWidth(Number(e.target.value) || 50)} />
            </div>
            <div>
              <Label>Altura (mm)</Label>
              <Input className="mt-1 w-24" type="number" value={labelHeight} onChange={(e) => setLabelHeight(Number(e.target.value) || 30)} />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border/40">
            {items.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <Checkbox
                  checked={(selected[p.id] ?? 0) > 0}
                  onCheckedChange={(v) => set(p.id, v ? Math.max(1, selected[p.id] ?? 1) : 0)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {p.barcode ?? p.internal_code} · {formatBRL(Number(p.price))}
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="w-20"
                  value={selected[p.id] ?? 0}
                  onChange={(e) => set(p.id, Number(e.target.value) || 0)}
                />
              </div>
            ))}
            {!items.length && <div className="p-6 text-sm text-muted-foreground text-center">Sem produtos.</div>}
          </div>
        </Card>

        <div ref={printAreaRef} className="label-print">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(auto-fill, ${labelWidth}mm)`,
            }}
          >
            {toPrint.map((p, i) => {
              const code = p.barcode || p.internal_code;
              return (
                <div
                  key={i}
                  className="label border border-dashed border-black/30 p-1 text-center flex flex-col justify-between bg-white text-black"
                  style={{ width: `${labelWidth}mm`, height: `${labelHeight}mm` }}
                >
                  <div className="text-[9px] font-semibold truncate leading-tight">{p.name}</div>
                  <svg data-barcode={code} className="w-full flex-1" />
                  <div className="text-[10px] font-bold">{formatBRL(Number(p.price))}</div>
                </div>
              );
            })}
            {!toPrint.length && (
              <div className="text-sm text-muted-foreground p-6 no-print">
                Selecione produtos para gerar etiquetas.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
