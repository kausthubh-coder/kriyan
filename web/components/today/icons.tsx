import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function IconBase({ children, ...props }: IconProps) {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" {...props}>{children}</svg>
}

export function TodayIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5.75A1.75 1.75 0 0 1 6.75 4h10.5A1.75 1.75 0 0 1 19 5.75v12.5A1.75 1.75 0 0 1 17.25 20H6.75A1.75 1.75 0 0 1 5 18.25V5.75Z"/><path strokeLinecap="round" d="M8 2.75v3M16 2.75v3M5 8.5h14M8.5 12h2M13.5 12h2M8.5 15.5h2"/></IconBase> }
export function TaskIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 7 1.75 1.75L9.5 5.5M11.5 7H20M4.5 13l1.75 1.75L9.5 11.5M11.5 13H20M4.5 19l1.75 1.75L9.5 17.5M11.5 19H20"/></IconBase> }
export function BellIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9ZM9.75 20.5h4.5"/></IconBase> }
export function ActivityIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2.25-6 4.5 12L16 12h5"/></IconBase> }
export function SendIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m4 4 17 8-17 8 3.5-8L4 4Zm3.5 8H21"/></IconBase> }
export function PlusIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" d="M12 5v14M5 12h14"/></IconBase> }
export function CheckIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6"/></IconBase> }
export function CloseIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18"/></IconBase> }
export function EditIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m14.5 5.5 4 4M4 20l4.25-.85L19 8.4a1.4 1.4 0 0 0 0-2l-1.4-1.4a1.4 1.4 0 0 0-2 0L4.85 15.75 4 20Z"/></IconBase> }
export function RetryIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7v5h-5M4 17v-5h5M6.1 8.5A7 7 0 0 1 18.5 7M17.9 15.5A7 7 0 0 1 5.5 17"/></IconBase> }
export function NodeIcon(props: IconProps) { return <IconBase {...props}><rect x="4" y="5" width="16" height="14" rx="2"/><path strokeLinecap="round" d="M8 9h8M8 13h3M16.5 15.5h.01"/></IconBase> }
export function ChevronIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6"/></IconBase> }
export function CalendarIcon(props: IconProps) { return <IconBase {...props}><rect x="4" y="5" width="16" height="15" rx="2"/><path strokeLinecap="round" d="M8 3v4M16 3v4M4 9h16M8 13h2M14 13h2M8 17h2"/></IconBase> }
export function NoteIcon(props: IconProps) { return <IconBase {...props}><path strokeLinejoin="round" d="M6 3.5h9l3 3V20H6zM15 3.5V7h3M9 11h6M9 15h6"/></IconBase> }
export function SourceIcon(props: IconProps) { return <IconBase {...props}><path strokeLinecap="round" d="M7.5 7.5 4 11a3.5 3.5 0 0 0 5 5l3-3M16.5 16.5 20 13a3.5 3.5 0 0 0-5-5l-3 3M9 15l6-6"/></IconBase> }
export function EntityIcon(props: IconProps) { return <IconBase {...props}><circle cx="12" cy="8" r="3.5"/><path strokeLinecap="round" d="M5.5 20a6.5 6.5 0 0 1 13 0M4 5h2M18 5h2"/></IconBase> }
