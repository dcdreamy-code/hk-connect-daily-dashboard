// 全项目唯一的数值格式化出口。
// 页面、传播图、发布文稿共用同一套规则，避免同一数字在两处显示成不同量级
// （历史问题：页面只到"亿"、出图到"万亿"，1.5 万亿市值会分裂成 15000.00亿 / 1.50万亿）。

export function compactHkd(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

export function percent(value, signed = true) {
  if (!Number.isFinite(value)) return "--";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatPercent(value) {
  return percent(value, true);
}

export function formatRate(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
}
