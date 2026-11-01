// KYC (identity verification) client helpers.
// Documents are compressed before upload and stored in the private
// `kyc-documents` bucket under <user_id>/… — admins read via signed URLs.
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/media-compress";

export type KycStatus = "pending" | "approved" | "rejected";

export interface KycVerification {
  id: string;
  user_id: string;
  id_document_path: string;
  selfie_path: string;
  status: KycStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function uploadKycDocument(
  userId: string,
  kind: "id-card" | "selfie",
  file: Blob | File,
): Promise<string> {
  const compressed = await compressImage(file, { maxDim: 1280, quality: 0.8 });
  const path = `${userId}/${kind}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("kyc-documents")
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function fetchMyKyc(userId: string): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from("kyc_verifications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as KycVerification) ?? null;
}

export async function fetchKycSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("kyc-documents").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function submitKyc(
  userId: string,
  idDocumentPath: string,
  selfiePath: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("kyc_verifications").upsert(
    {
      user_id: userId,
      id_document_path: idDocumentPath,
      selfie_path: selfiePath,
      status: "pending",
      admin_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return { error: error?.message ?? null };
}
