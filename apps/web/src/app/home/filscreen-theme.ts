// Server-safe FilScreen theme constants shared by the root layout
// (blocking pre-paint script) and the client shell (state sync).
// No React APIs here so server components can import freely.

export const THEME_STORAGE_KEY = 'consumit.home-theme'
export const SIDEBAR_STORAGE_KEY = 'consumit.home-sidebar'

/**
 * Blocking pre-paint script rendered in the root layout `<head>`.
 * Copies the stored FilScreen theme onto `<html>` before first paint so
 * light members never see a dark flash — including the fullscreen loading
 * fallback — while React itself stays SSR-safe (server and first client
 * render both use the dark default, then sync in an effect).
 */
export const THEME_INIT_SCRIPT = [
  '(function(){',
  'try{',
  "var t=window.localStorage.getItem('consumit.home-theme');",
  'var h=document.documentElement;',
  "if(t==='light'){h.setAttribute('data-consumit-theme','light');h.style.colorScheme='light';}",
  "else{h.setAttribute('data-consumit-theme','dark');h.style.colorScheme='dark';}",
  '}catch(e){}',
  '})();',
].join('')

export type FilScreenTheme = 'dark' | 'light'

/**
 * Mirrors the active theme onto `<html>` so the pre-paint
 * `html[data-consumit-theme]` CSS override always agrees with React state.
 * Without this, the override (which outranks the dark rule) would pin the
 * page to whichever theme the blocking script stamped before hydration.
 */
export function stampDocumentTheme(theme: FilScreenTheme) {
  try {
    document.documentElement.setAttribute('data-consumit-theme', theme)
    document.documentElement.style.colorScheme = theme
  } catch {
    // Non-DOM environments keep React state as the source of truth.
  }
}

export const THEME_STYLE = [
  '[data-filscreen-home]{',
  '--fs-page:#e9e2d4;--fs-shell:#faf7f0;--fs-ink:#1a1512;--fs-secondary:#575046;--fs-muted:#70695d;',
  '--fs-accent:#c2431f;--fs-accent-strong:#c2431f;--fs-accent-strong-hover:#a83718;--fs-on-accent:#ffffff;',
  '--fs-accent-soft:rgba(194,67,31,0.12);--fs-accent-soft-hover:rgba(194,67,31,0.20);--fs-hover:#eee7d8;',
  '--fs-line:#ddd3c0;--fs-field:#ffffff;--fs-field-border:#d3c9b4;--fs-rail:#f3eee2;--fs-focus:#c2431f;',
  '--fs-star-bg:#fff3d1;--fs-star:#8a5a00;--fs-danger:#a33b2e;--fs-flame:#c2431f;',
  '--consumit-canvas:#faf7f0;--consumit-nav:#faf7f0;--consumit-surface:#ffffff;--consumit-surface-raised:#f3eee2;',
  '--consumit-field:#ffffff;--consumit-ink:#1a1512;--consumit-copy:#575046;--consumit-muted:#70695d;',
  '--consumit-faint:#a8a29e;--consumit-border:#ddd3c0;--consumit-control-outline:#d3c9b4;--consumit-orange:#c2431f;',
  '--color-canvas:#faf7f0;--color-nav:#faf7f0;--color-surface:#ffffff;--color-surface-raised:#f3eee2;',
  '--color-field:#ffffff;--color-ink:#1a1512;--color-copy:#575046;--color-muted:#70695d;',
  '--color-faint:#a8a29e;--color-border:#ddd3c0;--color-control-outline:#d3c9b4;--color-orange:#c2431f;',
  '}',
  '[data-filscreen-home][data-theme="dark"]{',
  '--fs-page:#09090b;--fs-shell:#0b0b0e;--fs-ink:#f4f0e8;--fs-secondary:#c9c4bc;--fs-muted:#9b968e;',
  '--fs-accent:#ff5d38;--fs-accent-strong:#ff5d38;--fs-accent-strong-hover:#ff7a5c;--fs-on-accent:#09090b;',
  '--fs-accent-soft:rgba(255,93,56,0.14);--fs-accent-soft-hover:rgba(255,93,56,0.24);--fs-hover:#19191e;',
  '--fs-line:rgba(255,255,255,0.10);--fs-field:#121216;--fs-field-border:#2c2c33;--fs-rail:#0b0b0e;--fs-focus:#ff5d38;',
  '--fs-star-bg:#fff3d1;--fs-star:#8a5a00;--fs-danger:#b76d66;--fs-flame:#ff5d38;',
  '--consumit-canvas:#09090b;--consumit-nav:#0b0b0e;--consumit-surface:#121216;--consumit-surface-raised:#19191e;',
  '--consumit-field:#121216;--consumit-ink:#f4f0e8;--consumit-copy:#c9c4bc;--consumit-muted:#9b968e;',
  '--consumit-faint:#67645f;--consumit-border:rgba(255,255,255,0.10);--consumit-control-outline:rgba(244,240,232,0.40);--consumit-orange:#ff5d38;',
  '--color-canvas:#09090b;--color-nav:#0b0b0e;--color-surface:#121216;--color-surface-raised:#19191e;',
  '--color-field:#121216;--color-ink:#f4f0e8;--color-copy:#c9c4bc;--color-muted:#9b968e;',
  '--color-faint:#67645f;--color-border:rgba(255,255,255,0.10);--color-control-outline:rgba(244,240,232,0.40);--color-orange:#ff5d38;',
  '}',
  '[data-consumit-title-masthead],[data-consumit-profile-masthead]{',
  '--consumit-canvas:#09090b;--consumit-nav:#0b0b0e;--consumit-surface:#18181b;--consumit-surface-raised:#27272a;--consumit-field:#121216;',
  '--consumit-ink:#f4f0e8;--consumit-copy:#d4d4d8;--consumit-muted:#a1a1aa;--consumit-border:rgba(255,255,255,0.14);--consumit-orange:#ff5d38;',
  '--color-canvas:#09090b;--color-surface:#18181b;--color-surface-raised:#27272a;--color-field:#121216;',
  '--color-ink:#f4f0e8;--color-copy:#d4d4d8;--color-muted:#a1a1aa;--color-border:rgba(255,255,255,0.14);',
  '}',
  // Pre-paint override: the blocking THEME_INIT_SCRIPT marks `<html>` with
  // the stored theme before first paint. This selector outranks the
  // `[data-theme="dark"]` block above, so light members paint light even
  // while React still holds the SSR-safe dark default. Must mirror the base
  // light `[data-filscreen-home]` block.
  'html[data-consumit-theme="light"] [data-filscreen-home]{',
  '--fs-page:#e9e2d4;--fs-shell:#faf7f0;--fs-ink:#1a1512;--fs-secondary:#575046;--fs-muted:#70695d;',
  '--fs-accent:#c2431f;--fs-accent-strong:#c2431f;--fs-accent-strong-hover:#a83718;--fs-on-accent:#ffffff;',
  '--fs-accent-soft:rgba(194,67,31,0.12);--fs-accent-soft-hover:rgba(194,67,31,0.20);--fs-hover:#eee7d8;',
  '--fs-line:#ddd3c0;--fs-field:#ffffff;--fs-field-border:#d3c9b4;--fs-rail:#f3eee2;--fs-focus:#c2431f;',
  '--fs-star-bg:#fff3d1;--fs-star:#8a5a00;--fs-danger:#a33b2e;--fs-flame:#c2431f;',
  '--consumit-canvas:#faf7f0;--consumit-nav:#faf7f0;--consumit-surface:#ffffff;--consumit-surface-raised:#f3eee2;',
  '--consumit-field:#ffffff;--consumit-ink:#1a1512;--consumit-copy:#575046;--consumit-muted:#70695d;',
  '--consumit-faint:#a8a29e;--consumit-border:#ddd3c0;--consumit-control-outline:#d3c9b4;--consumit-orange:#c2431f;',
  '--color-canvas:#faf7f0;--color-nav:#faf7f0;--color-surface:#ffffff;--color-surface-raised:#f3eee2;',
  '--color-field:#ffffff;--color-ink:#1a1512;--color-copy:#575046;--color-muted:#70695d;',
  '--color-faint:#a8a29e;--color-border:#ddd3c0;--color-control-outline:#d3c9b4;--color-orange:#c2431f;',
  '}',
  '[data-filscreen-home] *{--tw-ring-offset-color:var(--fs-shell)}',
  '[data-filscreen-home] ::selection{background:var(--fs-accent-strong);color:var(--fs-on-accent)}',
  '[data-filscreen-home] [data-scrollrow]{scrollbar-width:thin;scrollbar-color:#b9b6d2 transparent}',
  '[data-filscreen-home] a{text-underline-offset:4px}',
  '.fs-sidebar-shell{transition:grid-template-columns .32s cubic-bezier(.32,.72,0,1)}',
  '.fs-sidebar-rail{transition:width .32s cubic-bezier(.32,.72,0,1),padding .32s cubic-bezier(.32,.72,0,1),background-color .2s ease}',
  '.fs-sidebar-item{transition:background-color .18s ease,color .18s ease,border-color .18s ease}',
  '@keyframes fs-hero-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
  '.fs-hero-in{animation:fs-hero-in .45s cubic-bezier(.16,1,.3,1) both}',
  '.fs-noscroll{scrollbar-width:none;-ms-overflow-style:none}',
  '.fs-noscroll::-webkit-scrollbar{display:none}',
  '@media (prefers-reduced-motion:reduce){.fs-sidebar-shell,.fs-sidebar-rail{transition:none}.fs-sidebar-item,.fs-rail-active,.fs-fade,.fs-hero-in{animation:none}}',
].join('')
