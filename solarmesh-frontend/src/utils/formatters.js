// Formatting utilities for energy, currency, timestamps, and hashes

export const formatCurrency = (val, currency = '₹', decimals = 2) => {
  const num = Number(val);
  if (isNaN(num)) return `${currency}0.00`;
  return `${currency}${num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const formatKwh = (val, decimals = 2) => {
  const num = Number(val);
  if (isNaN(num)) return `0.00 kWh`;
  return `${num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kWh`;
};

export const formatKw = (val, decimals = 2) => {
  const num = Number(val);
  if (isNaN(num)) return `0.00 kW`;
  return `${num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} kW`;
};

export const formatPercent = (val, decimals = 1) => {
  const num = Number(val);
  if (isNaN(num)) return `0.0%`;
  return `${(num * 100).toFixed(decimals)}%`;
};

export const formatDate = (dateInput) => {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatRelativeTime = (dateInput) => {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString();
};

export const formatHash = (str, start = 6, end = 4) => {
  if (!str) return '—';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
};

/**
 * Generate a deterministic pseudo-Ethereum tx hash from an ID or string
 */
export const pseudoTxHash = (id = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const tail = Math.abs(hash * 31).toString(16).padStart(8, 'a');
  const mid = Math.abs(hash * 97).toString(16).padStart(16, 'f');
  return `0x${hex}${mid}${tail}`.padEnd(66, '0').slice(0, 66);
};

export const pseudoBlockHash = (blockNum = 1000) => {
  const hex = (blockNum * 1337).toString(16).padStart(8, '0');
  return `0x${hex}${'b'.repeat(56)}`.slice(0, 66);
};
