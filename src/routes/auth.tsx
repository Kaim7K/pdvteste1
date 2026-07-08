import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { TreeDeciduous, ShieldCheck, Zap, Wifi } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

const USERNAME_DOMAIN = "local.app";

function usernameToEmail(username: string) {
  const clean = username.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  return `${clean}@${USERNAME_DOMAIN}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/vendas" });
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("Usuário ou senha inválidos");
    toast.success("Login realizado");
    navigate({ to: "/vendas" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 22%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-6 relative">
        {/* Brand panel */}
        <Card className="hidden md:flex flex-col justify-between p-8 card-elevated overflow-hidden relative">
          <div
            aria-hidden
            className="absolute -top-16 -left-16 h-64 w-64 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
          />
          <div className="relative">
            <div className="inline-flex px-3 py-1 rounded-full border border-primary/60 bg-primary/10 mb-6">
              <span className="text-[10px] font-bold tracking-[0.3em] text-primary uppercase">
                Mercadinho
              </span>
            </div>
            <div className="flex items-start gap-3">
              <TreeDeciduous className="h-16 w-16 text-primary shrink-0 drop-shadow-[0_0_20px_color-mix(in_oklab,var(--primary)_60%,transparent)]" />
              <div className="leading-[0.9]">
                <div className="text-3xl font-black tracking-tight">ALAMEDA DAS</div>
                <div className="text-5xl font-black tracking-tight text-primary drop-shadow-[0_0_16px_color-mix(in_oklab,var(--primary)_40%,transparent)]">
                  ÁRVORES
                </div>
              </div>
            </div>
            <p className="mt-6 text-muted-foreground text-sm max-w-sm">
              Sistema <span className="text-primary font-semibold">PDV completo</span> para o seu
              mercadinho. Rápido, seguro e simples de operar.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-3 mt-8">
            <Feature icon={ShieldCheck} title="Acesso seguro" desc="Dados protegidos" />
            <Feature icon={Zap} title="Operação rápida" desc="Agilidade no dia" />
            <Feature icon={Wifi} title="100% Online" desc="Sempre disponível" />
          </div>
        </Card>

        {/* Login panel */}
        <Card className="p-8 card-elevated">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 border border-primary/40 grid place-items-center glow-primary">
              <TreeDeciduous className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center">Bem-vindo!</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Acesse o sistema do Mercadinho
          </p>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login-username">Usuário</Label>
              <Input
                id="login-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Digite seu usuário"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Senha</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Digite sua senha"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full mt-2">
              {loading ? "Entrando..." : "Entrar no sistema"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              O cadastro de novos usuários é feito pelo gerente em Configurações.
            </p>
          </form>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50 text-xs">
            <div className="flex items-center gap-1.5 text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Sistema online
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Conexão segura SSL
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 p-3">
      <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/40 grid place-items-center mb-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-xs font-semibold leading-tight">{title}</div>
      <div className="text-[10px] text-muted-foreground">{desc}</div>
    </div>
  );
}
