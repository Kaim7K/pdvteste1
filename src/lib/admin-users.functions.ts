import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const USERNAME_DOMAIN = "local.app";

function usernameToEmail(username: string) {
  const clean = username.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  return `${clean}@${USERNAME_DOMAIN}`;
}

function emailToUsername(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[0];
}

async function assertGerente(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("gerente")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export type AppUser = {
  id: string;
  username: string;
  email: string;
  role: "gerente" | "vendedor";
  created_at: string;
};

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertGerente(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersErr) throw new Error(usersErr.message);

    const { data: rolesData, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const roleMap = new Map<string, "gerente" | "vendedor">();
    for (const r of rolesData ?? []) {
      const existing = roleMap.get(r.user_id);
      if (r.role === "gerente" || !existing) {
        roleMap.set(r.user_id, r.role as "gerente" | "vendedor");
      }
    }

    const users: AppUser[] = usersData.users.map((u) => ({
      id: u.id,
      username: emailToUsername(u.email),
      email: u.email ?? "",
      role: roleMap.get(u.id) ?? "vendedor",
      created_at: u.created_at,
    }));
    users.sort((a, b) => a.username.localeCompare(b.username));
    return users;
  });

export const createAppUser = createServerFn({ method: "POST" })
  .validator(
    (data: { username: string; password: string; role: "gerente" | "vendedor" }) => {
      if (!data?.username?.trim()) throw new Error("Usuário obrigatório");
      if (!data?.password || data.password.length < 4)
        throw new Error("Senha deve ter ao menos 4 caracteres");
      if (data.role !== "gerente" && data.role !== "vendedor")
        throw new Error("Papel inválido");
      return {
        username: data.username.trim().toLowerCase(),
        password: data.password,
        role: data.role,
      };
    },
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await assertGerente(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = usernameToEmail(data.username);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário");

    // O trigger cria user_roles como vendedor por padrão; se for gerente, insere/atualiza
    if (data.role === "gerente") {
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: created.user.id, role: "gerente" },
          { onConflict: "user_id,role" },
        );
      // Remove papel vendedor duplicado, se existir
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", created.user.id)
        .eq("role", "vendedor");
    }
    return { id: created.user.id };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .validator(
    (data: { userId: string; role: "gerente" | "vendedor" }) => {
      if (!data?.userId) throw new Error("userId obrigatório");
      if (data.role !== "gerente" && data.role !== "vendedor")
        throw new Error("Papel inválido");
      return data;
    },
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await assertGerente(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Substitui todos os papéis do usuário pelo novo
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .validator((data: { userId: string; newPassword: string }) => {
    if (!data?.userId) throw new Error("userId obrigatório");
    if (!data?.newPassword || data.newPassword.length < 4)
      throw new Error("Senha deve ter ao menos 4 caracteres");
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await assertGerente(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .validator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("userId obrigatório");
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await assertGerente(context.supabase, context.userId);
    if (data.userId === context.userId)
      throw new Error("Você não pode excluir seu próprio usuário");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
