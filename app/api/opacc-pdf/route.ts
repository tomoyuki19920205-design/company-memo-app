import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifiedArchiveURL } from "@/lib/opacc-pdf-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const owner="7d7736d6-16e9-45e8-9ddc-470fc33cb36b";
const reply=(available:boolean,status=200)=>NextResponse.json({available},{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
export async function GET(request:NextRequest) {
  if(process.env.NEXT_PUBLIC_OPACC_V2_DISPLAY_ENABLED!=="1")return reply(false,404);
  const cookieStore=await cookies();
  const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    cookies:{getAll:()=>cookieStore.getAll(),setAll:()=>undefined}});
  try {
    const {data:{user},error}=await client.auth.getUser();
    if(error || !user)return reply(false,401);
    if(user.id!==owner)return reply(false,403);
    const url=verifiedArchiveURL(request.nextUrl.searchParams.get("sha")??"");
    if(!url)return reply(false,404);
    // Only the fixed public PDF hosts/paths above. No caller-supplied URL, redirects, storage or database writes.
    const response=await fetch(url,{headers:{Range:"bytes=0-4"},redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(6000)});
    if(!response.ok || !response.headers.get("Content-Type")?.toLowerCase().includes("application/pdf") || !response.body){
      await response.body?.cancel();return reply(false);
    }
    const reader=response.body.getReader();const prefix:number[]=[];
    try {
      while(prefix.length<5){const {done,value}=await reader.read();if(done)break;for(const b of value.subarray(0,5-prefix.length))prefix.push(b);}
    } finally {await reader.cancel();}
    return reply(String.fromCharCode(...prefix)==="%PDF-");
  } catch {return reply(false);}
}
