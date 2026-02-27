import { useScrollReveal } from '../hooks/useScrollReveal'

const techs = [
  'Next.js 16',
  'React 19',
  'TypeScript 5',
  'Tailwind CSS 4',
  'xyflow',
  'Zustand',
  'Drizzle ORM',
  'SQLite',
  'fal.ai SDK',
  'OpenRouter API',
]

export default function TechStack() {
  const revealRef = useScrollReveal<HTMLElement>()

  return (
    <section ref={revealRef} className="rv tech">
      <h2 className="st">
        BUILT <span className="gl">WITH</span>
      </h2>
      <div className="tr">
        {techs.map((t) => (
          <span className="tp" key={t}>
            {t}
          </span>
        ))}
      </div>
    </section>
  )
}
