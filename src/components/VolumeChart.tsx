"use client";

import { useRef, useEffect } from "react";

interface DataPoint {
  label: string;
  value: number;
}

export function VolumeChart({ data, title }: { data: DataPoint[]; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const barWidth = Math.max(chartW / data.length - 4, 8);

    // Grid lines
    ctx.strokeStyle = "#1e1e2e";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      ctx.fillStyle = "#888";
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      const val = maxVal - (maxVal / 4) * i;
      ctx.fillText(formatCompact(val), padding.left - 8, y + 4);
    }

    // Bars
    data.forEach((d, i) => {
      const rawBarH = (d.value / maxVal) * chartH;
      const barH = Number.isFinite(rawBarH) ? rawBarH : 0;
      const x = padding.left + (chartW / data.length) * i + (chartW / data.length - barWidth) / 2;
      const y = padding.top + chartH - barH;

      if (barH <= 0) return;

      // Gradient bar
      const gradient = ctx.createLinearGradient(x, y, x, y + barH);
      gradient.addColorStop(0, "#74b9ff");
      gradient.addColorStop(1, "#6c5ce7");
      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [3, 3, 0, 0]);
      ctx.fill();

      // X-axis label
      ctx.fillStyle = "#888";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(d.label, x + barWidth / 2, h - 8);
    });
  }, [data]);

  return (
    <div className="chart-container">
      <h3 className="chart-title">{title}</h3>
      {data.length === 0 ? (
        <div className="chart-empty">Waiting for data...</div>
      ) : (
        <canvas ref={canvasRef} className="chart-canvas" />
      )}
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
