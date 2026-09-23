"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
/* eslint-disable @typescript-eslint/no-explicit-any -- RPC introduced alongside support migration. */
export function SupportTicketConfirm({ticketId}:{ticketId:string}){const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();async function confirm(){setBusy(true);setError("");const {error:rpcError}=await (createClient() as any).rpc("confirm_support_ticket_resolution",{p_ticket:ticketId});setBusy(false);if(rpcError){setError("Could not confirm this resolution.");return;}router.refresh();}return <div className="mt-2"><button disabled={busy} onClick={()=>void confirm()} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50">{busy?"Saving…":"Confirm resolution"}</button>{error?<p className="mt-1 text-xs text-red-700">{error}</p>:null}</div>;}
