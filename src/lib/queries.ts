import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];

/**
 * Fontes de dados compartilhadas entre múltiplas páginas.
 * Centralizar aqui evita duplicação de queryKeys/queryFns e mantém
 * o cache do TanStack Query consistente entre rotas.
 */

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["settings"] as const,
    queryFn: async (): Promise<SettingsRow | null> => {
      const { data } = await supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      return (data ?? null) as SettingsRow | null;
    },
    staleTime: 60_000,
  });

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ["categories"] as const,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name")
        .order("name");
      return data ?? [];
    },
    staleTime: 60_000,
  });

/**
 * Lookup de vendedores por id — usado em histórico.
 * `ids` participa da key para respeitar a lista solicitada.
 */
export type SellerLookup = Record<string, { full_name: string | null; email: string | null }>;

export const sellerLookupQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["profiles-lookup", ids] as const,
    enabled: ids.length > 0,
    queryFn: async (): Promise<SellerLookup> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const map: SellerLookup = {};
      (data ?? []).forEach((p) => {
        map[p.id] = { full_name: p.full_name, email: p.email };
      });
      return map;
    },
    staleTime: 60_000,
  });

/**
 * Mapa id → nome de todos os vendedores — usado em relatórios.
 */
export const sellerNameMapQuery = () =>
  queryOptions({
    queryKey: ["report-profiles"] as const,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => {
        map[p.id] = p.full_name || p.email || "—";
      });
      return map;
    },
    staleTime: 60_000,
  });
