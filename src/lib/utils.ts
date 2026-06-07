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

// FIXED: Shows exact numbers, no L/Cr rounding
export function formatINRShort(amount: number): string {
  return formatINR(amount);
}

// FIXED: Billing cycle logic based on current date
// If date is 26th or later: cycle is 26th of current month to 25th of next month
// If date is before 26th: cycle is 26th of previous month to 25th of current month
export function getBillingCycle(date: Date = new Date()): { start: Date; end: Date } {
  const day = date.getDate();
  let start: Date;
  let end: Date;

  if (day >= 26) {
    // Current cycle: 26th of this month to 25th of next month
    start = setDate(date, 26);
    end = setDate(addMonths(date, 1), 25);
  } else {
    // Current cycle: 26th of previous month to 25th of this month
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
  // Get current billing cycle
  let currentCycle = getBillingCycle(new Date());
  
  for (let i = 0; i < count; i++) {
    cycles.push({
      start: format(currentCycle.start, 'yyyy-MM-dd'),
      end: format(currentCycle.end, 'yyyy-MM-dd'),
      label: `${format(currentCycle.start, 'dd/MM/yyyy')} - ${format(currentCycle.end, 'dd/MM/yyyy')}`,
    });
    // Move to previous cycle: subtract 1 month from start date
    const prevMonth = addMonths(currentCycle.start, -1);
    currentCycle = getBillingCycle(prevMonth);
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