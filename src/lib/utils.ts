import { format, setDate, addMonths } from 'date-fns';

export function formatINR(amount: number): string {
  if (amount === 0) return '₹0';
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(absAmount);
  return `${isNegative ? '-' : ''}₹${formatted}`;
}

export function formatINRShort(amount: number): string {
  if (amount >= 10000000) return `${formatINR(amount / 10000000).replace('₹', '')}Cr`;
  if (amount >= 100000) return `${formatINR(amount / 100000).replace('₹', '')}L`;
  return formatINR(amount);
}

export function getBillingCycle(date: Date = new Date()): { start: Date; end: Date } {
  const day = date.getDate();
  let start: Date;
  let end: Date;

  if (day >= 26) {
    start = setDate(date, 26);
    end = setDate(addMonths(date, 1), 25);
  } else {
    start = setDate(addMonths(date, -1), 26);
    end = setDate(date, 25);
  }

  return { start, end };
}

export function getBillingCycleLabel(date: Date = new Date()): string {
  const { start, end } = getBillingCycle(date);
  return `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`;
}

export function getBillingCycleStart(date: Date = new Date()): string {
  const { start } = getBillingCycle(date);
  return format(start, 'yyyy-MM-dd');
}

export function getBillingCycleEnd(date: Date = new Date()): string {
  const { end } = getBillingCycle(date);
  return format(end, 'yyyy-MM-dd');
}

export function getAllBillingCycles(count: number = 6): Array<{ start: string; end: string; label: string }> {
  const cycles: Array<{ start: string; end: string; label: string }> = [];
  let current = new Date();

  for (let i = 0; i < count; i++) {
    const { start, end } = getBillingCycle(current);
    cycles.push({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      label: `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`,
    });
    current = addMonths(start, -1);
  }

  return cycles.reverse();
}

export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 10) / 10;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
