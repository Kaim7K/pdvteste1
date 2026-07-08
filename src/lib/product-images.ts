import { supabase } from "@/integrations/supabase/client";

const PRODUCT_IMAGE_BUCKET = "product-images";

export async function uploadProductImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Arquivo inválido. Selecione uma imagem.");
  }

  const safeName = file.name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
  const path = `${crypto.randomUUID()}-${safeName || "image"}`;

  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || "Falha ao enviar a imagem");
  }

  const { data: signedData, error: signedError } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  const { data: publicData } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  if (publicData.publicUrl) {
    return publicData.publicUrl;
  }

  throw new Error("Não foi possível gerar a URL da imagem");
}

export function normalizeProductImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}
