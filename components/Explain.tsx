import type { Explanation } from "@/lib/explanations";

// Three-line explanation shown beneath an indicator: what it is, how to read it, how reliable it is.
export default function Explain({ info, className = "" }: { info: Explanation; className?: string }) {
  return (
    <dl className={`flex flex-col gap-0.5 text-[11px] leading-snug text-muted ${className}`}>
      <div>
        <dt className="inline font-semibold text-fg/80">Apa ini: </dt>
        <dd className="inline">{info.apa}</dd>
      </div>
      <div>
        <dt className="inline font-semibold text-fg/80">Cara baca: </dt>
        <dd className="inline">{info.cara}</dd>
      </div>
      <div>
        <dt className="inline font-semibold text-fg/80">Keandalan: </dt>
        <dd className="inline">{info.keandalan}</dd>
      </div>
    </dl>
  );
}
