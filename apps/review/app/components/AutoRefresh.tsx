"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the current server page every `seconds` (e.g. while a post is generating). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
