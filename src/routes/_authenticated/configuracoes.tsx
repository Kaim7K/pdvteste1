import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Plus, ShieldCheck, Trash2, User as UserIcon, UserCog, Database, Download } from "lucide-react";
import { todayStamp } from "@/lib/csv";
import {
  createAppUser,
  deleteAppUser,
  listAppUsers,
  resetUserPassword,
  setUserRole,
  type AppUser,
} from "@/lib/admin-users.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { isGerente } = useAuth();
  const qc = useQueryClient();
  const settingsQ = useQuery(settingsQuery());

  const [form, setForm] = useState({ market_name: "", cnpj: "", address: "", max_minimized_sales: 3 });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        market_name: settingsQ.data.market_name ?? "",
        cnpj: settingsQ.data.cnpj ?? "",
        address: settingsQ.data.address ?? "",
        max_minimized_sales: settingsQ.data.max_minimized_sales ?? 3,
      });
    }
  }, [settingsQ.data]);

  async function handleSave() {
    const { error } = await supabase.from("settings").update(form).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Dados do mercado, preferências e usuários" />
      <div className="p-6 space-y-6 max-w-4xl">
        <Card className="p-6 space-y-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Dados do mercado</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome do mercado</Label>
              <Input className="mt-1" value={form.market_name} onChange={(e) => setForm({ ...form, market_name: e.target.value })} />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input className="mt-1" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Endereço</Label>
              <Input className="mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Máx. de vendas minimizadas</Label>
              <Input className="mt-1" type="number" min="1" max="10" value={form.max_minimized_sales} onChange={(e) => setForm({ ...form, max_minimized_sales: Number(e.target.value) || 3 })} />
            </div>
          </div>
          <Button onClick={handleSave} className="glow-primary">Salvar</Button>
        </Card>

        {isGerente ? (
          <>
            <BackupSection />
            <UsersSection />
          </>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">
            A gestão de usuários é restrita ao gerente.
          </Card>
        )}
      </div>
    </div>
  );
}

function BackupSection() {
  const [running, setRunning] = useState(false);

  async function downloadBackup() {
    setRunning(true);
    try {
      const tables = ["categories", "products", "sales", "sale_items", "payments", "fiado_customers", "settings"] as const;
      const backup: Record<string, unknown> = { generated_at: new Date().toISOString(), version: 1 };
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw error;
        backup[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${todayStamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      toast.success("Backup gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar backup");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="p-6 space-y-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Backup</div>
      </div>
      <p className="text-sm text-muted-foreground">
        Baixa uma cópia completa do banco (produtos, vendas, pagamentos, fiado, configurações) em JSON.
        Guarde em local seguro. Recomendamos backups semanais.
      </p>
      <Button onClick={downloadBackup} disabled={running} variant="outline" className="gap-2">
        <Download className="h-4 w-4" />
        {running ? "Gerando..." : "Baixar backup completo"}
      </Button>
    </Card>
  );
}

function UsersSection() {
  const { user: current } = useAuth();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);

  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const roleFn = useServerFn(setUserRole);
  const resetFn = useServerFn(resetUserPassword);
  const deleteFn = useServerFn(deleteAppUser);

  const usersQ = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listFn(),
  });

  const roleMut = useMutation({
    mutationFn: (vars: { userId: string; role: "gerente" | "vendedor" }) =>
      roleFn({ data: vars }),
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário removido");
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Usuários do sistema</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            Gerentes têm acesso completo; vendedores só operam o caixa.
          </div>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <div className="rounded-md border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Usuário</th>
              <th className="text-left p-3 font-medium">Papel</th>
              <th className="text-left p-3 font-medium">Criado em</th>
              <th className="p-3 w-72"></th>
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>
            )}
            {usersQ.data?.map((u) => {
              const isSelf = u.id === current?.id;
              return (
                <tr key={u.id} className="border-t border-border/40">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-md bg-primary/15 border border-primary/40 grid place-items-center shrink-0">
                        <UserIcon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{u.username}</div>
                        {isSelf && <div className="text-[10px] uppercase tracking-widest text-primary">Você</div>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant={u.role === "gerente" ? "default" : "outline"} className="uppercase tracking-widest">
                      {u.role === "gerente" ? <ShieldCheck className="h-3 w-3 mr-1" /> : <UserCog className="h-3 w-3 mr-1" />}
                      {u.role}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(u.created_at)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSelf || roleMut.isPending}
                        onClick={() =>
                          roleMut.mutate({
                            userId: u.id,
                            role: u.role === "gerente" ? "vendedor" : "gerente",
                          })
                        }
                        className="gap-1.5"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        {u.role === "gerente" ? "Tornar vendedor" : "Tornar gerente"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setResetTarget(u)}
                        className="gap-1.5"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Senha
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSelf || deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Remover o usuário "${u.username}"?`)) deleteMut.mutate(u.id);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!usersQ.isLoading && !usersQ.data?.length && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nenhum usuário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <NewUserModal
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={async (payload) => {
          try {
            await createFn({ data: payload });
            toast.success(`Usuário "${payload.username}" criado`);
            qc.invalidateQueries({ queryKey: ["app-users"] });
            setNewOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao criar usuário");
          }
        }}
      />

      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={async (userId, newPassword) => {
          try {
            await resetFn({ data: { userId, newPassword } });
            toast.success("Senha atualizada");
            setResetTarget(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao atualizar senha");
          }
        }}
      />
    </Card>
  );
}

function NewUserModal({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (payload: { username: string; password: string; role: "gerente" | "vendedor" }) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"gerente" | "vendedor">("vendedor");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setUsername(""); setPassword(""); setRole("vendedor"); }
  }, [open]);

  async function submit() {
    if (!username.trim() || password.length < 4) {
      toast.error("Preencha usuário e senha (mín. 4 caracteres)");
      return;
    }
    setSaving(true);
    await onCreate({ username: username.trim(), password, role });
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            O usuário fará login apenas com nome e senha (sem e-mail).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome de usuário</Label>
            <Input
              className="mt-1"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s+/g, "").toLowerCase())}
              placeholder="ex: joao"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              className="mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={4}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label>Papel</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {(["vendedor", "gerente"] as const).map((r) => (
                <Badge
                  key={r}
                  variant={role === r ? "default" : "outline"}
                  className="cursor-pointer justify-center h-9 uppercase tracking-widest"
                  onClick={() => setRole(r)}
                >
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="glow-primary">
            {saving ? "Criando..." : "Criar usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordModal({
  target,
  onClose,
  onReset,
}: {
  target: AppUser | null;
  onClose: () => void;
  onReset: (userId: string, newPassword: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (target) setPassword(""); }, [target]);

  async function submit() {
    if (!target) return;
    if (password.length < 4) { toast.error("Senha deve ter ao menos 4 caracteres"); return; }
    setSaving(true);
    await onReset(target.id, password);
    setSaving(false);
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>{target?.username}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>Nova senha</Label>
          <Input
            className="mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
