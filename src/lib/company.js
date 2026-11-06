import { supabase } from "./supabase.js";

const LOGO_PATH = "company-logo";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

export async function getCompanyLogo() {
  requireSupabase();
  const { data, error } = await supabase
    .from("company_settings")
    .select("logo_path, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.logo_path) return "";
  const { data: publicUrl } = supabase.storage.from("company-assets").getPublicUrl(data.logo_path);
  return `${publicUrl.publicUrl}?v=${encodeURIComponent(data.updated_at || Date.now())}`;
}

export async function uploadCompanyLogo(file) {
  requireSupabase();
  if (!ALLOWED_LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES) {
    throw new Error("Choose a JPEG, PNG, or WebP logo smaller than 2 MB.");
  }

  const { error: uploadError } = await supabase.storage
    .from("company-assets")
    .upload(LOGO_PATH, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true
    });
  if (uploadError) throw new Error(uploadError.message);

  const { error: settingError } = await supabase
    .from("company_settings")
    .update({ logo_path: LOGO_PATH, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (settingError) throw new Error(settingError.message);
  return getCompanyLogo();
}
