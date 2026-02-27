const links = [
  { label: 'GitHub', href: 'https://github.com/CPloscaru/caraca' },
  { label: 'Issues', href: 'https://github.com/CPloscaru/caraca/issues' },
  { label: 'fal.ai Docs', href: 'https://fal.ai/docs' },
  { label: 'OpenRouter Docs', href: 'https://openrouter.ai/docs' },
]

export default function Footer() {
  return (
    <footer>
      <div className="fl">&copy; 2025 Caraca &middot; MIT License</div>
      <nav className="flr" aria-label="Footer navigation">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  )
}
