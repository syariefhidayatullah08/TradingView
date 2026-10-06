export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="brand">KriptoScope</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          Analisa crypto, teknikal &amp; fundamental, dan berita dunia
        </p>
      </div>
      {children}
    </main>
  );
}
