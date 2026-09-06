// Hand-drawn inline SVG icons, mirrored 1:1 from design/*.dc.html — never
// emoji, per the design system (see the published "Hephaste Design System"
// artifact). Every icon is stroke-based, currentColor, so it
// recolors with the surrounding text color automatically.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function DashboardIcon(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function JobsIcon(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="4" y="3.5" width="12" height="14" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7.5 3.5V2.8C7.5 2.1 8.1 1.5 8.8 1.5H11.2C11.9 1.5 12.5 2.1 12.5 2.8V3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M7 9H13M7 12H13M7 15H10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function InvoicesIcon(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" {...props}>
      <path
        d="M5 2.5H15V17.5L13 16L11 17.5L9 16L7 17.5L5 16V2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7.5 6.5H12.5M7.5 9.5H12.5M7.5 12.5H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CustomersIcon(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="7.2" cy="6.2" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M2.5 16.5C2.9 13.6 4.8 11.8 7.2 11.8C9.6 11.8 11.5 13.6 11.9 16.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M13 6.8C13.9 6.5 14.8 7 15.1 7.9C15.4 8.8 14.9 9.7 14 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.5 11.9C15.4 12.3 16.7 13.7 17 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 2.5V4.3M10 15.7V17.5M17.5 10H15.7M4.3 10H2.5M15.1 4.9L13.8 6.2M6.2 13.8L4.9 15.1M15.1 15.1L13.8 13.8M6.2 6.2L4.9 4.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 17L13.5 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M10 3V17M3 10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M10 3L18 16.5H2L10 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8.2V11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="2.5" y="4" width="15" height="13.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 8H17.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 2.5V5.5M13.5 2.5V5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 10.2L8.7 12.4L13.5 7.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="2.5" y="5.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 8.5H17.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="12.3" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M7.5 4.5L13 10L7.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M10 3V13M10 13L6.5 9.5M10 13L13.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 15.5V16.5C3.5 17.3 4.2 18 5 18H15C15.8 18 16.5 17.3 16.5 16.5V15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" {...props}>
      <path
        d="M5 2.5H11.5L15 6V17.5H5V2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.5 2.5V6H15" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M17.5 2.5L2.5 8.8L9 11L11.2 17.5L17.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 11L17.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Twin bolts (same orientation, not mirrored) leaning forward, joined by a
// bar that comes out of the right bolt without reaching the left one.
export function BrandMark(props: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" {...props}>
      <g transform="skewX(-12)">
        <path
          transform="translate(4.75,2.667) scale(0.1875,0.6111)"
          d="M13 10V3L4 14h7v7l9-11h-7z"
          fill="var(--on-accent)"
        />
        <path
          transform="translate(12.75,2.667) scale(0.1875,0.6111)"
          d="M13 10V3L4 14h7v7l9-11h-7z"
          fill="var(--on-accent)"
        />
      </g>
      <rect x="8.5" y="9.25" width="3" height="1.5" rx="0.5" fill="var(--on-accent)" />
    </svg>
  );
}
