// Thin typed helpers around the user's external Supabase project.
import { supabase } from "@/integrations/supabase/client";

export type ListingType = "buy" | "sell";
export type ListingStatus = "active" | "paused" | "closed";
export type DealStatus =
  | "pending"
  | "accepted"
  | "escrow_funded"
  | "meeting_proposed"
  | "meeting_scheduled"
  | "locked"
  | "arrived"
  | "verified"
  | "cash_sent"
  | "confirmed"
  | "proof_uploaded"
  | "completed"
  | "cancelled"
  | "disputed";
export type MessageKind = "text" | "voice" | "image" | "location" | "note" | "system";

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  phone: string | null;
  bio: string | null;
  verified: boolean;
  rating: number;
  total_trades: number;
  completed_trades: number;
  trade_volume: number;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  escrow_balance: number;
}

export interface Listing {
  id: string;
  user_id: string;
  type: ListingType;
  status: ListingStatus;
  city: string;
  price_per_usdt: number;
  min_amount: number;
  max_amount: number;
  available_amount: number;
  meeting_location: string | null;
  available_timings: string | null;
  notes: string | null;
  featured: boolean;
  created_at: string;
  profiles?: Profile | null;
}

export interface Deal {
  id: string;
  deal_code: string | null;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_usdt: number;
  price_per_usdt: number;
  total_fiat: number;
  fee_usdt: number;
  status: DealStatus;
  meeting_at: string | null;
  meeting_location: string | null;
  meeting_proposed_by: string | null;
  meeting_status: "proposed" | "confirmed" | "rejected" | null;
  locked_at: string | null;
  buyer_arrived_at: string | null;
  seller_arrived_at: string | null;
  buyer_arrival_lat: number | null;
  buyer_arrival_lng: number | null;
  seller_arrival_lat: number | null;
  seller_arrival_lng: number | null;
  buyer_selfie_url: string | null;
  seller_selfie_url: string | null;
  buyer_location_photo_url: string | null;
  seller_location_photo_url: string | null;
  cash_photo_url: string | null;
  cash_video_url: string | null;
  cash_notes: string | null;
  cash_handover_at: string | null;
  seller_confirmed_at: string | null;
  proof_image_url: string | null;
  proof_video_url: string | null;
  proof_uploaded_at: string | null;
  completed_at: string | null;
  created_at: string;
  listing?: Listing | null;
  buyer?: Profile | null;
  seller?: Profile | null;
}

export interface Message {
  id: string;
  deal_id: string;
  sender_id: string;
  content: string;
  kind: MessageKind;
  attachment_url: string | null;
  lat: number | null;
  lng: number | null;
  duration_ms: number | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  deal_id: string | null;
  type: "deposit" | "withdraw" | "escrow_lock" | "escrow_release" | "fee" | "trade";
  amount: number;
  description: string | null;
  created_at: string;
}

export const db = supabase as ReturnType<typeof getTyped>;
function getTyped() { return supabase; }

export function fmtUSDT(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `${v.toFixed(2)} USDT`;
}
export function fmtFiat(n: number | string, ccy = "INR") {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(v);
}

// Storage helpers ---------------------------------------------------------
export async function uploadDealFile(dealId: string, userId: string, file: File | Blob, ext = "bin") {
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${dealId}/${userId}/${filename}`;
  const { error } = await supabase.storage.from("deal-evidence").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = await supabase.storage.from("deal-evidence").createSignedUrl(path, 60 * 60 * 24 * 7);
  return { path, url: data?.signedUrl ?? null };
}

export async function sendSystemMessage(dealId: string, senderId: string, content: string) {
  await supabase.from("messages").insert({
    deal_id: dealId,
    sender_id: senderId,
    content,
    kind: "system",
  } as any);
}
