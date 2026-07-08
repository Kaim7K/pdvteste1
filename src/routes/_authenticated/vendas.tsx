import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/queries";
import { usePosStore, cartTotals, type CartItem } from "@/lib/pos-store";
import { useAuth } from "@/hooks/use-auth";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Trash2,
  ScanBarcode,
  Wallet,
  Minus,
  Minimize2,
  X,
  Pencil,
  Receipt,
  Package,
  FileDown,
  Printer,
  CreditCard,
  Gem,
  MoreHorizontal,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { printReceipt, savePdfReceipt } from "@/lib/print-receipt";

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  unit: "unidade" | "peso" | "pacote";
  barcode: string | null;
  internal_code: string;
  image_url: string | null;
  category_id: string | null;
};

type ReceiptData = {
  saleNumber: number;
  createdAt: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  change: number;
  payments: { method: string; amount: number }[];
  observation: string;
  seller: string;
};

export const Route = createFileRoute("/_authenticated/vendas")({
  component: SalesPage,
});

function SalesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const store = usePosStore();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState("");
  const [priceEditOpen, setPriceEditOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const settingsQ = useQuery(settingsQuery());
  const maxMinimized = settingsQ.data?.max_minimized_sales ?? 3;
  const storeInfo = {
    storeName: settingsQ.data?.market_name || "MERCADO",
    cnpj: settingsQ.data?.cnpj || null,
    address: settingsQ.data?.address || null,
    logoUrl: settingsQ.data?.logo_url || null,
  };

  // Ranking de mais vendidos — usado como ordem padrão quando não há busca
  const topSellersQ = useQuery({
    queryKey: ["top-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .limit(5000);
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of data ?? []) {
        if (!row.product_id) continue;
        totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + Number(row.quantity));
      }
      return totals;
    },
    staleTime: 60_000,
  });

  // Busca de produtos — sempre ativa; sem termo, retorna todos ordenados pelos mais vendidos
  const productsQ = useQuery({
    queryKey: ["products-search", debouncedSearch],
    queryFn: async () => {
      const q = supabase.from("products").select("*").eq("active", true).order("name").limit(100);
      if (debouncedSearch.trim()) {
        const term = `%${debouncedSearch.trim()}%`;
        q.or(`name.ilike.${term},barcode.ilike.${term},internal_code.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const orderedProducts = useMemo(() => {
    const list = productsQ.data ?? [];
    if (search.trim()) return list;
    const totals = topSellersQ.data ?? new Map<string, number>();
    return [...list].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  }, [productsQ.data, topSellersQ.data, search]);


  const totals = cartTotals(store.cart, store.discount);

  // Add product to cart
  function addProduct(p: Product) {
    store.addItem({
      productId: p.id,
      name: p.name,
      unitPrice: Number(p.price),
      quantity: 1,
      unit: p.unit,
      stock: Number(p.stock),
    });
    setSearch("");
    setSearchOpen(false);
    searchInputRef.current?.blur();
  }


  // Barcode / global keyboard listener — mantém o input de busca como destino padrão
  useEffect(() => {
    let buffer = "";
    let last = 0;

    function isFieldActive() {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      // O próprio input de busca não é "outro campo" — devemos continuar processando o buffer do scanner
      if (el === searchInputRef.current) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    }

    async function tryResolveExact(code: string) {
      const { data } = await supabase
        .from("products")
        .select("*")
        .or(`barcode.eq.${code},internal_code.eq.${code}`)
        .eq("active", true)
        .maybeSingle();
      if (data) {
        addProduct(data as Product);
        return true;
      }
      return false;
    }

    async function handleEnter() {
      const code = buffer.trim();
      buffer = "";
      if (!code) return;
      const found = await tryResolveExact(code);
      if (!found) {
        if (/^\d{6,}$/.test(code)) {
          setQuickAddBarcode(code);
          setQuickAddOpen(true);
        } else {
          setSearch(code);
          setSearchOpen(true);
        }
      }
    }

    function onKey(e: KeyboardEvent) {
      if (isFieldActive()) return;
      const now = Date.now();
      if (now - last > 400) buffer = "";
      last = now;

      if (e.key === "Enter") { void handleEnter(); return; }
      if (e.key.length !== 1) return;

      buffer += e.key;

      // Sempre garantir que o campo de busca receba o input:
      // acrescenta a tecla ao texto de busca, abre o painel e foca o campo.
      setSearch((s) => (s + e.key).slice(-40));
      setSearchOpen(true);
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFinalizeSale(
    payments: { method: string; amount: number }[],
    fiadoCustomerId: string | null,
  ) {
    if (!user) return;
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    const hasFiado = payments.some((p) => p.method === "fiado");
    if (!hasFiado && paid < totals.total - 0.001) {
      toast.error("Pagamento incompleto");
      return;
    }
    const change = Math.max(0, paid - totals.total);
    const status = hasFiado ? "fiado_open" : "completed";

    const { data: sale, error } = await supabase
      .from("sales")
      .insert({
        seller_id: user.id,
        subtotal: totals.subtotal,
        discount: store.discount,
        total: totals.total,
        paid,
        change_due: change,
        status,
        observation: store.observation || null,
        fiado_customer_id: hasFiado ? fiadoCustomerId : null,
      })
      .select("id, sale_number, created_at")
      .single();
    if (error || !sale) return toast.error(error?.message ?? "Falha ao criar venda");

    const itemsPayload = store.cart.map((i) => ({
      sale_id: sale.id,
      product_id: i.productId,
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      subtotal: i.unitPrice * i.quantity,
    }));
    const paymentsPayload = payments.map((p) => ({
      sale_id: sale.id,
      method: p.method as "dinheiro" | "debito" | "credito" | "pix" | "outros" | "fiado",
      amount: p.amount,
    }));
    await supabase.from("sale_items").insert(itemsPayload);
    await supabase.from("payments").insert(paymentsPayload);

    // Decrement stock (client-side)
    await Promise.all(
      store.cart.map(async (i) => {
        const { data: prod } = await supabase
          .from("products")
          .select("stock")
          .eq("id", i.productId)
          .single();
        if (prod) {
          await supabase
            .from("products")
            .update({ stock: Number(prod.stock) - i.quantity })
            .eq("id", i.productId);
        }
      })
    );

    setReceipt({
      saleNumber: sale.sale_number,
      createdAt: sale.created_at,
      items: store.cart,
      subtotal: totals.subtotal,
      discount: store.discount,
      total: totals.total,
      paid,
      change,
      payments,
      observation: store.observation,
      seller: user.email ?? "—",
    });
    store.clear();
    setPayOpen(false);
    qc.invalidateQueries({ queryKey: ["sales-history"] });
    qc.invalidateQueries({ queryKey: ["products-search"] });
    toast.success(`Venda #${sale.sale_number} finalizada`);
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Topbar */}
      <div className="h-14 border-b border-border/60 flex items-center justify-between px-4 gap-4 bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-md bg-primary/15 border border-primary/40 grid place-items-center shrink-0">
            <ScanBarcode className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight leading-none truncate">Frente de caixa</h1>
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">Escaneie ou digite para adicionar</div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] min-h-0">
        {/* LEFT: busca + resultados sempre visíveis (padrão: mais vendidos) */}
        <div className="flex flex-col min-h-0 border-r border-border/60">
          <div className="p-4 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Buscar ou escanear..."
                className="pl-10 h-11"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setSearchOpen(false); searchInputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {search.trim() ? "Resultados" : "Mais vendidos"}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums">
                {orderedProducts.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <SearchResults
              products={orderedProducts}
              loading={productsQ.isLoading}
              onPick={addProduct}
            />
          </div>
        </div>


        {/* RIGHT: Venda atual (itens + totais + pagamento) — sempre visível */}
        <div className="flex flex-col min-h-0 bg-sidebar/40">
          <div className="p-4 border-b border-border/60 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Venda atual</div>
                <div className="text-lg font-bold truncate">
                  {totals.items} {totals.items === 1 ? "item" : "itens"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPriceEditOpen(true)}
                disabled={!store.cart.length}
                className="gap-1.5 shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" /> Corrigir preço
              </Button>
            </div>
            <MinimizedTabs />
          </div>

          {/* Itens da venda — ocupam o espaço vertical restante */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
            <CartList
              cart={store.cart}
              onQtyChange={store.updateQuantity}
              onRemove={store.removeItem}
            />
          </div>

          {/* Totais */}
          <div className="p-4 border-t border-border/60 space-y-3">
            <Row label="Subtotal" value={formatBRL(totals.subtotal)} />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0 w-20">Desconto</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={store.discount || ""}
                onChange={(e) => store.setDiscount(Number(e.target.value) || 0)}
                className="h-9"
              />
            </div>
            <div className="pt-3 border-t border-border/40">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-3xl font-black text-primary tracking-tight">{formatBRL(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-border/60 space-y-2">
            <Button
              onClick={() => setPayOpen(true)}
              disabled={!store.cart.length}
              className="w-full h-12 text-base font-bold glow-primary"
            >
              <Wallet className="h-5 w-5 mr-2" /> Forma de pagamento
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const ok = store.minimizeCurrent(maxMinimized);
                  if (!ok) toast.error(store.cart.length ? `Limite de ${maxMinimized} vendas minimizadas` : "Nada para minimizar");
                }}
                disabled={!store.cart.length}
              >
                <Minimize2 className="h-4 w-4 mr-1.5" /> Minimizar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (store.cart.length && !confirm("Descartar venda atual?")) return;
                  store.clear();
                }}
                disabled={!store.cart.length}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Descartar
              </Button>
            </div>
          </div>
        </div>
      </div>


      {/* Modals */}
      <PaymentModal
        open={payOpen}
        onOpenChange={setPayOpen}
        totals={totals}
        cart={store.cart}
        observation={store.observation}
        setObservation={store.setObservation}
        onConfirm={handleFinalizeSale}
      />
      <QuickAddModal
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        barcode={quickAddBarcode}
        onCreated={(p) => addProduct(p)}
      />
      <PriceEditModal
        open={priceEditOpen}
        onOpenChange={setPriceEditOpen}
        cart={store.cart}
        onSave={async (productId, newPrice) => {
          store.updatePrice(productId, newPrice);
          const { error } = await supabase.from("products").update({ price: newPrice }).eq("id", productId);
          if (error) toast.error(error.message);
          else toast.success("Preço atualizado e auditado");
        }}
      />
      <ReceiptModal receipt={receipt} storeInfo={storeInfo} onClose={() => setReceipt(null)} />
    </div>
  );
}

function MinimizedTabs() {
  const store = usePosStore();
  if (!store.minimized.length) return null;
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Outras vendas</span>
      <div className="flex flex-wrap items-center gap-2">
        {store.minimized.map((m, i) => (
          <button
            key={m.id}
            onClick={() => store.restoreMinimized(m.id)}
            className={cn(
              "h-8 px-3 rounded-md text-xs font-semibold border transition-all",
              "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20 glow-primary"
            )}
            title={`${m.items.length} itens`}
          >
            #{i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function SearchResults({
  products,
  loading,
  onPick,
}: {
  products: Product[];
  loading: boolean;
  onPick: (p: Product) => void;
}) {
  if (loading) return <div className="text-sm text-muted-foreground p-4">Buscando...</div>;
  if (!products.length) return <div className="text-sm text-muted-foreground p-4">Nenhum produto encontrado.</div>;
  return (
    <div className="grid grid-cols-1 gap-2">
      {products.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p)}
          className="text-left p-3 rounded-lg bg-card border border-border hover:border-primary/60 hover:bg-primary/5 transition-all group"
        >
          <div className="flex gap-3">
            <div className="h-12 w-12 rounded-md bg-muted shrink-0 overflow-hidden grid place-items-center">
              {p.image_url ? (
                <img src={p.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Package className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate group-hover:text-primary">{p.name}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>{p.internal_code}</span>
                {p.barcode && <span>· {p.barcode}</span>}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-sm font-bold text-primary tabular-nums">{formatBRL(Number(p.price))}</span>
                <span className={cn("text-[10px] uppercase tracking-widest", Number(p.stock) <= 0 ? "text-warning" : "text-muted-foreground")}>
                  Est: {Number(p.stock)}
                </span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function CartList({
  cart,
  onQtyChange,
  onRemove,
}: {
  cart: CartItem[];
  onQtyChange: (id: string, q: number) => void;
  onRemove: (id: string) => void;
}) {
  if (!cart.length) {
    return (
      <div className="h-full grid place-items-center text-center">
        <div>
          <ScanBarcode className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <div className="text-sm font-medium">Nenhum item na venda</div>
          <div className="text-xs text-muted-foreground mt-1">
            Escaneie um código de barras ou digite para buscar.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {cart.map((i) => (
        <Card key={i.productId} className="p-3 flex items-center gap-3 border-border/60">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{i.name}</div>
            <div className="text-xs text-muted-foreground">{formatBRL(i.unitPrice)} · {i.unit}</div>
          </div>
          <div className="flex items-center gap-1 border border-border rounded-md">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onQtyChange(i.productId, i.quantity - 1)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              step={i.unit === "peso" ? "0.001" : "1"}
              value={i.quantity}
              onChange={(e) => onQtyChange(i.productId, Number(e.target.value) || 0)}
              className="h-8 w-16 text-center border-0 focus-visible:ring-0 tabular-nums"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onQtyChange(i.productId, i.quantity + 1)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="w-24 text-right tabular-nums font-semibold">{formatBRL(i.quantity * i.unitPrice)}</div>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onRemove(i.productId)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </Card>
      ))}
    </div>
  );
}

const PAYMENT_METHODS: {
  key: "dinheiro" | "debito" | "credito" | "pix" | "outros" | "fiado";
  label: string;
  icon: typeof Wallet;
  color: string;
}[] = [
  { key: "dinheiro", label: "Dinheiro", icon: Wallet, color: "text-success" },
  { key: "debito", label: "Débito", icon: CreditCard, color: "text-chart-3" },
  { key: "credito", label: "Crédito", icon: CreditCard, color: "text-chart-4" },
  { key: "pix", label: "Pix", icon: Gem, color: "text-primary" },
  { key: "outros", label: "Outros", icon: MoreHorizontal, color: "text-muted-foreground" },
  { key: "fiado", label: "Fiado", icon: Users, color: "text-warning" },
];

function PaymentModal({
  open,
  onOpenChange,
  totals,
  cart,
  observation,
  setObservation,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  totals: { subtotal: number; total: number; items: number };
  cart: CartItem[];
  observation: string;
  setObservation: (v: string) => void;
  onConfirm: (payments: { method: string; amount: number }[], fiadoCustomerId: string | null) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [fiadoName, setFiadoName] = useState("");
  const [fiadoPhone, setFiadoPhone] = useState("");

  useEffect(() => {
    if (open) { setSelected(new Set()); setAmounts({}); setFiadoName(""); setFiadoPhone(""); }
  }, [open]);

  const paid = Array.from(selected).reduce((s, k) => s + (Number(amounts[k]) || 0), 0);
  const remaining = Math.max(0, totals.total - paid);
  const change = Math.max(0, paid - totals.total);
  const hasFiado = selected.has("fiado") && (Number(amounts.fiado) || 0) > 0;

  function toggleMethod(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setAmounts((a) => { const c = { ...a }; delete c[key]; return c; });
      } else {
        next.add(key);
        // Auto-preenche o restante se for a primeira seleção
        setAmounts((a) => ({ ...a, [key]: String(Math.max(0, totals.total - paid).toFixed(2)) }));
      }
      return next;
    });
  }

  async function handleConfirm() {
    if (!selected.size) return toast.error("Selecione uma forma de pagamento");
    if (hasFiado && !fiadoName.trim()) {
      toast.error("Informe o nome do responsável pelo fiado");
      return;
    }
    const payments: { method: string; amount: number }[] = [];
    for (const m of PAYMENT_METHODS) {
      if (!selected.has(m.key)) continue;
      const v = Number(amounts[m.key]) || 0;
      if (v > 0) payments.push({ method: m.key, amount: v });
    }

    let fiadoCustomerId: string | null = null;
    if (hasFiado && fiadoName.trim()) {
      const nameTrim = fiadoName.trim();
      const { data: existing } = await supabase
        .from("fiado_customers")
        .select("id")
        .ilike("name", nameTrim)
        .limit(1)
        .maybeSingle();
      if (existing) {
        fiadoCustomerId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from("fiado_customers")
          .insert({ name: nameTrim, phone: fiadoPhone.trim() || null })
          .select("id")
          .single();
        if (error || !created) {
          toast.error(error?.message ?? "Falha ao registrar cliente fiado");
          return;
        }
        fiadoCustomerId = created.id;
      }
    }
    onConfirm(payments, fiadoCustomerId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-primary" /> Forma de Pagamento
          </DialogTitle>
          <DialogDescription>
            Selecione uma ou mais formas. Os valores só podem ser preenchidos nas formas selecionadas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-5">
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">
                Selecione a forma de pagamento
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m) => {
                  const isSel = selected.has(m.key);
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleMethod(m.key)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border-2 transition-all",
                        isSel
                          ? "border-primary bg-primary/10 glow-primary"
                          : "border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5"
                      )}
                    >
                      <Icon className={cn("h-6 w-6", isSel ? "text-primary" : m.color)} />
                      <span className={cn("text-xs font-semibold", isSel && "text-primary")}>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selected.size > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Valores
                </div>
                {PAYMENT_METHODS.filter((m) => selected.has(m.key)).map((m) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.key} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <Icon className={cn("h-4 w-4", m.color)} />
                        <Label className="text-sm">{m.label}</Label>
                      </div>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amounts[m.key] ?? ""}
                          onChange={(e) => setAmounts((a) => ({ ...a, [m.key]: e.target.value }))}
                          placeholder="0,00"
                          className="pl-10 pr-16 tabular-nums font-semibold text-right"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setAmounts((a) => ({ ...a, [m.key]: String(Math.max(0, totals.total - (paid - (Number(a[m.key]) || 0))).toFixed(2)) }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase font-bold text-primary hover:underline"
                        >
                          Restante
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {hasFiado && (
              <div className="p-3 rounded-lg border border-warning/40 bg-warning/5 space-y-2">
                <Label className="text-xs uppercase tracking-widest font-semibold text-warning flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Responsável pelo fiado
                </Label>
                <Input placeholder="Nome (obrigatório)" value={fiadoName} onChange={(e) => setFiadoName(e.target.value)} />
                <Input placeholder="Telefone (opcional)" value={fiadoPhone} onChange={(e) => setFiadoPhone(e.target.value)} />
              </div>
            )}

            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Observação (opcional)</Label>
              <Textarea
                placeholder="Adicione uma observação para esta venda..."
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Resumo do pedido</div>
            <Card className="p-3 max-h-40 overflow-y-auto text-xs space-y-1 border-border/60">
              {cart.map((i) => (
                <div key={i.productId} className="flex justify-between gap-2">
                  <span className="truncate">{i.quantity}× {i.name}</span>
                  <span className="tabular-nums font-medium">{formatBRL(i.quantity * i.unitPrice)}</span>
                </div>
              ))}
            </Card>
            <Card className="p-3 space-y-1.5 text-sm border-border/60">
              <Row label="Itens" value={String(totals.items)} />
              <Row label="Subtotal" value={formatBRL(totals.subtotal)} />
              <div className="pt-2 border-t border-border/40 flex justify-between items-baseline">
                <span className="text-muted-foreground text-xs">Total</span>
                <span className="text-2xl font-black text-primary tabular-nums">{formatBRL(totals.total)}</span>
              </div>
              <div className="pt-2 border-t border-border/40 space-y-1">
                <Row label="Pago" value={formatBRL(paid)} />
                <div className="flex justify-between font-bold pt-1">
                  <span className={remaining > 0 ? "text-warning" : "text-success"}>
                    {remaining > 0 ? "Restante" : "Troco"}
                  </span>
                  <span className={cn("tabular-nums text-lg", remaining > 0 ? "text-warning" : "text-success")}>
                    {formatBRL(remaining > 0 ? remaining : change)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            className="glow-primary min-w-40"
            disabled={!selected.size || (!hasFiado && paid < totals.total - 0.001)}
          >
            Concluir venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function QuickAddModal({
  open,
  onOpenChange,
  barcode,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  barcode: string;
  onCreated: (p: Product) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(""); setPrice(""); } }, [open]);

  async function handleSave() {
    if (!name.trim()) return toast.error("Informe o nome do produto");
    setSaving(true);
    const { data, error } = await supabase
      .from("products")
      .insert({
        name: name.trim(),
        barcode: barcode || null,
        price: Number(price) || 0,
        internal_code: "",
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    onCreated(data as Product);
    onOpenChange(false);
    toast.success("Produto cadastrado e adicionado à venda");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastro rápido</DialogTitle>
          <DialogDescription>Código não encontrado. Cadastre em segundos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Código de barras</Label>
            <Input value={barcode} readOnly className="mt-1 font-mono" />
          </div>
          <div>
            <Label>Nome do produto</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="mt-1" />
          </div>
          <div>
            <Label>Preço (opcional)</Label>
            <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>Salvar e adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceEditModal({
  open,
  onOpenChange,
  cart,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cart: CartItem[];
  onSave: (productId: string, newPrice: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string>("");
  const [newPrice, setNewPrice] = useState<string>("");
  const current = useMemo(() => cart.find((c) => c.productId === selected), [cart, selected]);

  useEffect(() => { if (open) { setSelected(cart[0]?.productId ?? ""); setNewPrice(""); } }, [open, cart]);
  useEffect(() => { if (current) setNewPrice(String(current.unitPrice)); }, [current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Produto com valor errado</DialogTitle>
          <DialogDescription>Atualiza o preço na venda atual e no estoque, com auditoria.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Produto</Label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-input px-3 text-sm"
            >
              {cart.map((c) => (
                <option key={c.productId} value={c.productId}>{c.name}</option>
              ))}
            </select>
          </div>
          {current && (
            <>
              <div className="text-sm text-muted-foreground">Valor atual: <span className="text-foreground font-medium">{formatBRL(current.unitPrice)}</span></div>
              <div>
                <Label>Novo valor</Label>
                <Input type="number" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="mt-1" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={async () => {
              if (!selected) return;
              await onSave(selected, Number(newPrice) || 0);
              onOpenChange(false);
            }}
          >Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StoreInfo = { storeName: string; cnpj: string | null; address: string | null; logoUrl: string | null };

function ReceiptModal({ receipt, storeInfo, onClose }: { receipt: ReceiptData | null; storeInfo: StoreInfo; onClose: () => void }) {
  if (!receipt) return null;

  function toPrintable() {
    return {
      saleNumber: receipt!.saleNumber,
      createdAt: receipt!.createdAt,
      seller: receipt!.seller,
      items: receipt!.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      subtotal: receipt!.subtotal,
      discount: receipt!.discount,
      total: receipt!.total,
      payments: receipt!.payments,
      change: receipt!.change,
      observation: receipt!.observation,
      storeName: storeInfo.storeName,
      cnpj: storeInfo.cnpj,
      address: storeInfo.address,
      logoUrl: storeInfo.logoUrl,
    };
  }

  return (
    <Dialog open={!!receipt} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Recibo #{receipt.saleNumber}</DialogTitle>
        </DialogHeader>
        <div className="receipt bg-white text-black p-4 font-mono text-xs space-y-1 rounded">
          <div className="text-center">
            {storeInfo.logoUrl && <img src={storeInfo.logoUrl} alt="" className="mx-auto max-h-14 mb-1 object-contain" />}
            <div className="font-bold text-sm">{storeInfo.storeName}</div>
            {storeInfo.cnpj && <div className="text-[10px]">CNPJ: {storeInfo.cnpj}</div>}
            {storeInfo.address && <div className="text-[10px]">{storeInfo.address}</div>}
            <div>Venda #{receipt.saleNumber}</div>
            <div>{new Date(receipt.createdAt).toLocaleString("pt-BR")}</div>
            <div>Vendedor: {receipt.seller}</div>
          </div>
          <div className="border-t border-dashed border-black/40 my-2" />
          {receipt.items.map((i) => (
            <div key={i.productId}>
              <div>{i.name}</div>
              <div className="flex justify-between">
                <span>{i.quantity} x {formatBRL(i.unitPrice)}</span>
                <span>{formatBRL(i.quantity * i.unitPrice)}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-dashed border-black/40 my-2" />
          <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(receipt.subtotal)}</span></div>
          {receipt.discount > 0 && <div className="flex justify-between"><span>Desconto</span><span>-{formatBRL(receipt.discount)}</span></div>}
          <div className="flex justify-between font-bold text-sm"><span>Total</span><span>{formatBRL(receipt.total)}</span></div>
          <div className="border-t border-dashed border-black/40 my-2" />
          {receipt.payments.map((p, i) => (
            <div key={i} className="flex justify-between"><span className="capitalize">{p.method}</span><span>{formatBRL(p.amount)}</span></div>
          ))}
          {receipt.change > 0 && <div className="flex justify-between"><span>Troco</span><span>{formatBRL(receipt.change)}</span></div>}
          {receipt.observation && <div className="mt-2">Obs: {receipt.observation}</div>}
          <div className="text-center mt-3">Obrigado pela preferência!</div>
        </div>
        <DialogFooter className="no-print gap-2">
          <Button variant="outline" onClick={() => printReceipt(toPrintable())} className="gap-2"><Printer className="h-4 w-4" /> Imprimir</Button>
          <Button variant="outline" onClick={() => savePdfReceipt(toPrintable())} className="gap-2"><FileDown className="h-4 w-4" /> Salvar PDF</Button>
          <Button onClick={onClose}>Nova venda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
