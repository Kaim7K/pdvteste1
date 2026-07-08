import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/auditoria")({
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const auditQ = useQuery({
    queryKey: ["product-audit-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_audit")
        .select("*, products(name, internal_code)")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader title="Auditoria geral" subtitle="Todas as alterações registradas no sistema" />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Produto</th>
                  <th className="text-left p-3 font-medium">Campo</th>
                  <th className="text-left p-3 font-medium">De</th>
                  <th className="text-left p-3 font-medium">Para</th>
                  <th className="text-left p-3 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {auditQ.data?.map((a) => (
                  <tr key={a.id} className="border-t border-border/40">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{formatDateTime(a.created_at)}</td>
                    {/* @ts-ignore */}
                    <td className="p-3 font-medium">{a.products?.name ?? "—"}</td>
                    <td className="p-3 text-primary uppercase text-xs tracking-widest">{a.field}</td>
                    <td className="p-3 font-mono text-xs">{a.old_value ?? "—"}</td>
                    <td className="p-3 font-mono text-xs text-primary">{a.new_value ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{a.origin ?? "—"}</td>
                  </tr>
                ))}
                {!auditQ.data?.length && !auditQ.isLoading && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhuma alteração registrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
