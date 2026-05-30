import { useThemeStore } from '../../stores/themeStore';
import { Sun, Moon } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative inline-flex h-8 w-16 items-center rounded-full transition-all duration-300 ease-smooth',
        'focus:outline-none focus:ring-2 focus:ring-white/20',
        isDark
          ? 'bg-zinc-800 hover:bg-zinc-700'
          : 'bg-zinc-200 hover:bg-zinc-300'
      )}
      aria-label="Toggle theme"
    >
      {/* Track background with gradient */}
      <span
        className={cn(
          'absolute inset-0.5 rounded-full transition-opacity duration-300',
          isDark
            ? 'bg-gradient-to-r from-zinc-800 to-zinc-700 opacity-100'
            : 'bg-gradient-to-r from-zinc-100 to-zinc-200 opacity-100'
        )}
      />

      {/* Sliding pill */}
      <span
        className={cn(
          'absolute left-1 flex h-6 w-6 items-center justify-center rounded-full',
          'transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          'shadow-sm',
          isDark
            ? 'translate-x-8 bg-white'
            : 'translate-x-0 bg-zinc-900'
        )}
      >
        {/* Icon with smooth transition */}
        <span className="relative w-4 h-4">
          <Sun
            className={cn(
              'absolute inset-0 h-4 w-4 transition-all duration-300',
              isDark
                ? 'rotate-90 scale-0 opacity-0 text-zinc-900'
                : 'rotate-0 scale-100 opacity-100 text-amber-500'
            )}
          />
          <Moon
            className={cn(
              'absolute inset-0 h-4 w-4 transition-all duration-300',
              isDark
                ? 'rotate-0 scale-100 opacity-100 text-zinc-900'
                : '-rotate-90 scale-0 opacity-0 text-zinc-100'
            )}
          />
        </span>
      </span>

      {/* Background icons */}
      <span className="flex w-full items-center justify-between px-2">
        <Sun className={cn(
          'h-3.5 w-3.5 transition-opacity duration-200',
          isDark ? 'text-zinc-600 opacity-100' : 'text-transparent opacity-0'
        )} />
        <Moon className={cn(
          'h-3.5 w-3.5 transition-opacity duration-200',
          isDark ? 'text-transparent opacity-0' : 'text-zinc-400 opacity-100'
        )} />
      </span>
    </button>
  );
}
