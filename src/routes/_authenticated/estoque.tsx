import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { categoriesQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Package, Plus, Search, Upload, Download, Tag, Barcode } from "lucide-react";
import { uploadProductImage } from "@/lib/product-images";
import { formatBRL } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { downloadCSV, todayStamp } from "@/lib/csv";
import { ProductImage } from "@/components/product-image";

export const Route = createFileRoute("/_authenticated/estoque")({
  component: EstoquePage,
});

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  internal_code: string;
  price: number;
  cost_price: number | null;
  stock: number;
  unit: "unidade" | "peso" | "pacote";
  image_url: string | null;
  category_id: string | null;
  active: boolean;
};

function EstoquePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const categoriesQ = useQuery(categoriesQuery());

  const productsQ = useQuery({
    queryKey: ["products-list", search, categoryFilter],
    queryFn: async () => {
      const q = supabase.from("products").select("*").order("name").limit(500);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q.or(`name.ilike.${term},barcode.ilike.${term},internal_code.ilike.${term}`);
      }
      if (categoryFilter) q.eq("category_id", categoryFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Product[];
    },
  });

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(p: Product) { setEditing(p); setModalOpen(true); }

  function exportProducts() {
    const rows = (productsQ.data ?? []).map((p) => ({
      nome: p.name,
      codigo_barras: p.barcode ?? "",
      codigo_interno: p.internal_code,
      preco: Number(p.price),
      custo: p.cost_price != null ? Number(p.cost_price) : "",
      estoque: Number(p.stock),
      unidade: p.unit,
    }));
    downloadCSV(`produtos_${todayStamp()}.csv`, rows);
    toast.success("CSV exportado");
  }

  async function importProducts(file: File) {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return toast.error("CSV vazio");
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = splitCSVLine(lines[0], sep).map((h: string) => h.trim().toLowerCase());
    const idxName = headers.indexOf("nome");
    const idxBarcode = headers.indexOf("codigo_barras");
    const idxPrice = headers.indexOf("preco");
    const idxCost = headers.indexOf("custo");
    const idxStock = headers.indexOf("estoque");
    const idxUnit = headers.indexOf("unidade");
    if (idxName < 0 || idxPrice < 0) return toast.error("Colunas obrigatórias: nome, preco");
    type ProductInsert = {
      name: string;
      barcode: string | null;
      price: number;
      cost_price: number | null;
      stock: number;
      unit: "unidade" | "peso" | "pacote";
      internal_code: string;
    };
    const rows: ProductInsert[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i], sep);
      const name = cells[idxName]?.trim();
      if (!name) continue;
      const unitRaw = idxUnit >= 0 && cells[idxUnit] ? cells[idxUnit].trim() : "unidade";
      const unit: ProductInsert["unit"] = unitRaw === "peso" || unitRaw === "pacote" ? unitRaw : "unidade";
      rows.push({
        name,
        barcode: idxBarcode >= 0 ? (cells[idxBarcode]?.trim() || null) : null,
        price: Number(cells[idxPrice]) || 0,
        cost_price: idxCost >= 0 && cells[idxCost] ? Number(cells[idxCost]) : null,
        stock: idxStock >= 0 ? Number(cells[idxStock]) || 0 : 0,
        unit,
        internal_code: "",
      });
    }
    if (!rows.length) return toast.error("Nenhuma linha válida");
    const { error } = await supabase.from("products").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} produtos importados`);
    qc.invalidateQueries({ queryKey: ["products-list"] });
  }

  function splitCSVLine(line: string, sep: string): string[] {
    const out: string[] = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === sep) { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }


  return (
    <div className="flex flex-col">
      <PageHeader
        title="Estoque"
        subtitle="Cadastro e gerenciamento completo de produtos"
        actions={
          <div className="flex gap-2">
            <Link to="/etiquetas"><Button size="sm" variant="outline" className="gap-2"><Barcode className="h-4 w-4" /> Etiquetas</Button></Link>
            <Button size="sm" variant="outline" onClick={exportProducts} className="gap-2"><Download className="h-4 w-4" /> Exportar</Button>
            <Button size="sm" variant="outline" onClick={() => importInputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Importar</Button>
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importProducts(f); e.target.value = ""; }} />
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Novo produto
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, código de barras ou código interno..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-input px-3 text-sm"
            >
              <option value="">Todas as categorias</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>


        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium">Produto</th>
                  <th className="text-left p-3 font-medium">Código</th>
                  <th className="text-right p-3 font-medium">Preço</th>
                  <th className="text-right p-3 font-medium">Custo</th>
                  <th className="text-right p-3 font-medium">Estoque</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {productsQ.data?.map((p) => (
                  <tr key={p.id} className="border-t border-border/40 hover:bg-primary/5 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded bg-muted overflow-hidden shrink-0">
                          <ProductImage src={p.image_url} alt={p.name} className="h-full w-full object-cover" containerClassName="h-full w-full" fallback={<Package className="h-3.5 w-3.5 text-muted-foreground" />} />
                        </div>
                        <Link to="/estoque/$id" params={{ id: p.id }} className="font-medium hover:text-primary truncate">
                          {p.name}
                        </Link>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {p.barcode ?? p.internal_code}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold text-primary">{formatBRL(Number(p.price))}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{p.cost_price != null ? formatBRL(Number(p.cost_price)) : "—"}</td>
                    <td className={"p-3 text-right tabular-nums " + (Number(p.stock) <= 0 ? "text-warning" : "")}>{Number(p.stock)}</td>
                    <td className="p-3">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Editar</Button>
                    </td>
                  </tr>
                ))}
                {!productsQ.data?.length && !productsQ.isLoading && (
                  <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <ProductModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["products-list"] }); qc.invalidateQueries({ queryKey: ["products-search"] }); }}
      />
    </div>
  );
}

function ProductModal({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Product | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "", barcode: "", price: "", cost_price: "", stock: "0", unit: "unidade" as Product["unit"],
    image_url: "" as string, category_id: "" as string, new_category: "" as string,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const categoriesQ = useQuery(categoriesQuery());

  // Sincroniza o formulário quando abre o modal (novo ou edição)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        barcode: editing.barcode ?? "",
        price: String(editing.price),
        cost_price: editing.cost_price != null ? String(editing.cost_price) : "",
        stock: String(editing.stock),
        unit: editing.unit,
        image_url: editing.image_url ?? "",
        category_id: editing.category_id ?? "",
        new_category: "",
      });
    } else {
      setForm({ name: "", barcode: "", price: "", cost_price: "", stock: "0", unit: "unidade", image_url: "", category_id: "", new_category: "" });
    }
  }, [open, editing]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Imagem enviada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar a imagem");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Nome é obrigatório");
    setSaving(true);
    let category_id: string | null = form.category_id || null;
    if (form.new_category.trim()) {
      const { data: cat, error: catErr } = await supabase
        .from("categories")
        .insert({ name: form.new_category.trim() })
        .select("id")
        .single();
      if (catErr) { setSaving(false); return toast.error(catErr.message); }
      category_id = cat.id;
    }
    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      price: Number(form.price) || 0,
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      stock: Number(form.stock) || 0,
      unit: form.unit,
      image_url: form.image_url || null,
      category_id,
    };
    const res = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert({ ...payload, internal_code: "" });
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Produto atualizado" : "Produto cadastrado");
    onSaved();
    onOpenChange(false);
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nome</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Código de barras (opcional)</Label>
            <Input className="mt-1 font-mono" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </div>
          <div>
            <Label>Preço</Label>
            <Input className="mt-1" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <Label>Custo (opcional)</Label>
            <Input className="mt-1" type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
          </div>
          <div>
            <Label>Estoque</Label>
            <Input className="mt-1" type="number" step="0.001" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </div>
          <div>
            <Label>Unidade</Label>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Product["unit"] })} className="mt-1 w-full h-10 rounded-md border border-input bg-input px-3 text-sm">
              <option value="unidade">Unidade</option>
              <option value="peso">Peso</option>
              <option value="pacote">Pacote</option>
            </select>
          </div>
          <div>
            <Label>Categoria</Label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="mt-1 w-full h-10 rounded-md border border-input bg-input px-3 text-sm"
            >
              <option value="">— Sem categoria —</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Ou criar nova categoria</Label>
            <Input className="mt-1" value={form.new_category} placeholder="Nome da nova categoria" onChange={(e) => setForm({ ...form, new_category: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Imagem do produto</Label>
            <div className="mt-1 space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-background">
                  <ProductImage src={form.image_url || null} alt={form.name || "Pré-visualização da imagem"} className="h-full w-full object-cover" containerClassName="h-full w-full" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-input text-sm cursor-pointer hover:border-primary">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Enviando..." : "Enviar imagem"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, image_url: "" }))} disabled={!form.image_url}>
                    Remover
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Ou cole uma URL externa"
                value={form.image_url}
                onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Use upload local ou cole um link direto para a imagem do produto.</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
