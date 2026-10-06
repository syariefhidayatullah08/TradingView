import type { NextRequest } from "next/server";
import { denyUnlessAllowed } from "@/lib/access";
import { getNews, isNewsCategory } from "@/lib/news";

export async function GET(request: NextRequest) {
  const denied = await denyUnlessAllowed();
  if (denied) return denied;

  const cat = request.nextUrl.searchParams.get("cat") ?? "ekonomi";
  if (!isNewsCategory(cat)) {
    return Response.json({ error: "Kategori tidak dikenal" }, { status: 400 });
  }

  const { items, failed } = await getNews(cat);
  if (items.length === 0) {
    return Response.json({ error: "Semua sumber berita gagal dimuat", failed }, { status: 502 });
  }
  return Response.json({ items, failed });
}
