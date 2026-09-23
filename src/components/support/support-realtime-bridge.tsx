"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function SupportRealtimeBridge({workspaceId}:{workspaceId:string}){const router=useRouter();useEffect(()=>{const supabase=createClient();const channel=supabase.channel(`betanor-support-workspace-${workspaceId}`).on("postgres_changes",{event:"*",schema:"public",table:"support_tickets",filter:`workspace_id=eq.${workspaceId}`},()=>router.refresh()).subscribe();return()=>{void supabase.removeChannel(channel);};},[workspaceId,router]);return null;}
