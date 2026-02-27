import { Fragment } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'

const steps = [
  {
    title: 'Add Nodes',
    description:
      'Pick from 7 node types via the sidebar or command palette \u2014 text, image, video, LLM, upscale, and more.',
  },
  {
    title: 'Connect & Configure',
    description:
      'Wire nodes together by type. Select AI models, write prompts, adjust settings.',
  },
  {
    title: 'Run & Iterate',
    description:
      'Execute individual nodes or the full pipeline at once. Tweak, regenerate, and export.',
  },
]

export default function HowItWorks() {
  const revealRef = useScrollReveal<HTMLElement>()

  return (
    <section ref={revealRef} className="rv" id="how" aria-labelledby="hh">
      <h2 className="st" id="hh">
        HOW IT <span className="gl">WORKS</span>
      </h2>
      <p className="ss">Three steps from idea to generated content.</p>
      <div className="hw">
        {steps.map((step, i) => (
          <Fragment key={step.title}>
            {i > 0 && <div className="hwl" aria-hidden="true" />}
            <div className="hws">
              <div className="hwd" aria-hidden="true" />
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  )
}
