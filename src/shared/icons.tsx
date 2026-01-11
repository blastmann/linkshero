import type { ReactNode } from 'react'

type IconProps = {
  size?: number
  className?: string
  title?: string
}

function Svg({
  children,
  size = 18,
  className,
  title
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function IconWand(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3 21l9-9M14 10l7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12.5 3.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7zM18.5 11.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M4.7 19.3l-1.4-1.4a1.5 1.5 0 010-2.1L14.4 4.7a1.5 1.5 0 012.1 0l1.4 1.4a1.5 1.5 0 010 2.1L6.8 19.3a1.5 1.5 0 01-2.1 0z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconFilter(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 6a2 2 0 114 0M10 12a2 2 0 114 0M13 18a2 2 0 114 0"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.9"
      />
    </Svg>
  )
}

export function IconList(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 7h12M8 12h12M8 17h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4.5 7h.01M4.5 12h.01M4.5 17h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconBolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13.1l1-1.7-1.6-2.8-2 .1a7.8 7.8 0 00-1.2-1l.6-1.9L12 2.8 9.8 4.8l.6 1.9a7.8 7.8 0 00-1.2 1l-2-.1-1.6 2.8 1 1.7a7.6 7.6 0 000 2.2l-1 1.7 1.6 2.8 2-.1c.4.4.8.7 1.2 1l-.6 1.9L12 21.2l2.2-2 .6-1.9c.4-.3.8-.6 1.2-1l2 .1 1.6-2.8-1-1.7c.1-.4.1-.7.1-1.1s0-.7-.1-1.1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </Svg>
  )
}

