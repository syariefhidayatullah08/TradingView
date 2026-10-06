"use client";

import { memo, useEffect, useRef } from "react";

type Props = {
  // Widget name as in embed-widget-<script>.js
  script: string;
  config: Record<string, unknown>;
  height: number | string;
};

function TVWidget({ script, config, height }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const serialized = JSON.stringify(config);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";
    const tag = document.createElement("script");
    tag.src = `https://s3.tradingview.com/external-embedding/embed-widget-${script}.js`;
    tag.async = true;
    tag.text = serialized;
    el.replaceChildren(inner, tag);
    return () => el.replaceChildren();
  }, [script, serialized]);

  return <div ref={ref} className="tradingview-widget-container" style={{ height, width: "100%" }} />;
}

export default memo(TVWidget);
