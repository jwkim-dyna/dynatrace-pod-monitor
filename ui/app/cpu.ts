const metricFactors: Record<string, number> = { core: 1, millicore: 0.001, mcore: 0.001, microcore: 0.000001, nanocore: 0.000000001 };
export const cpuCoreFactor = (unit: string): number | null => metricFactors[unit.toLowerCase()] ?? null;

// Kubernetes resource.Quantity: plain numbers, decimal SI, binary SI or exponents.
export function cpuQuantityCores(value: string): number | null {
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))([eE][+-]?\d+|[numkMGTPE]|[KMGTPE]i)?$/.exec(value.trim());
  if (!match) return null;
  const suffix = match[2] ?? '';
  const factors: Record<string, number> = { '': 1, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18, Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, Pi: 2 ** 50, Ei: 2 ** 60 };
  const factor = /^[eE][+-]?\d+$/.test(suffix) ? 10 ** Number(suffix.slice(1)) : factors[suffix];
  const cores = Number(match[1]) * factor;
  return Number.isFinite(cores) && cores >= 0 ? cores : null;
}

export const formatCpuCores = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 9 })} core`;
