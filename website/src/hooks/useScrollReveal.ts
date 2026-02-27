import { useEffect, useRef } from 'react'

export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('v')
        }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}
