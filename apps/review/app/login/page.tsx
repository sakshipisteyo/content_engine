import { LoginForm } from "../components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, never an absolute URL (open-redirect guard).
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="fixed inset-0 z-50 bg-ground flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-panel border border-line rounded-2xl p-7 flex flex-col gap-5">
        <div>
          <div className="text-[13px] text-muted">Content Engine</div>
          <h1 className="m-0 font-display text-[28px] font-medium tracking-tight">Sign in</h1>
        </div>
        <LoginForm next={target} />
      </div>
    </div>
  );
}
