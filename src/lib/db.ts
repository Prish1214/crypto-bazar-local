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
  updated_at: string;
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
  type: "deposit" | "withdraw" | "transfer" | "escrow_lock" | "escrow_release" | "fee" | "trade";
  amount: number;
  description: string | null;
  created_at: string;
}

export type DisputeStatus = "open" | "reviewing" | "resolved_buyer" | "resolved_seller" | "cancelled";
export interface Dispute {
  id: string;
  deal_id: string;
  opened_by: string;
  reason: string;
  evidence_url: string | null;
  status: DisputeStatus;
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  deal?: Deal | null;
}

/** Ensure the signed-in user has a wallet row (idempotent). */
export async function ensureWallet(userId: string): Promise<Wallet> {
  const { data } = await supabase.from("wallets").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as Wallet;
  const { data: created, error } = await supabase
    .from("wallets")
    .insert({ user_id: userId } as any)
    .select("*")
    .single();
  if (error) throw error;
  return created as Wallet;
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

export async function hydrateDeals(rows: Deal[]): Promise<Deal[]> {
  if (rows.length === 0) return rows;

  const listingIds = [...new Set(rows.map((d) => d.listing_id).filter(Boolean))];
  const userIds = [...new Set(rows.flatMap((d) => [d.buyer_id, d.seller_id]).filter(Boolean))];

  const [listingsResult, profilesResult] = await Promise.all([
    listingIds.length
      ? supabase.from("listings").select("*").in("id", listingIds)
      : Promise.resolve({ data: [] as Listing[] }),
    userIds.length
      ? supabase.from("profiles").select("*").in("id", userIds)
      : Promise.resolve({ data: [] as Profile[] }),
  ]);

  const listings = new Map((listingsResult.data ?? []).map((listing: any) => [listing.id, listing as Listing]));
  const profiles = new Map((profilesResult.data ?? []).map((profile: any) => [profile.id, profile as Profile]));

  return rows.map((deal) => ({
    ...deal,
    listing: listings.get(deal.listing_id) ?? deal.listing ?? null,
    buyer: profiles.get(deal.buyer_id) ?? deal.buyer ?? null,
    seller: profiles.get(deal.seller_id) ?? deal.seller ?? null,
  }));
}

export async function fetchDealWithContext(dealId: string): Promise<Deal | null> {
  const { data, error } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [deal] = await hydrateDeals([data as Deal]);
  return deal;
}

export async function fetchUserDeals(userId: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrateDeals((data ?? []) as Deal[]);
}
