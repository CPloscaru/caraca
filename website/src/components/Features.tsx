const features = [
  {
    title: 'Visual Workflow Editor',
    description:
      'Drag-and-drop canvas with an intuitive node system. Connect text, images, and AI models with color-coded ports \u2014 blue for images, purple for text.',
  },
  {
    title: 'AI Image Generation',
    description:
      'Generate with Flux, SDXL, and more via the fal.ai SDK. Choose models, adjust aspect ratios and parameters, iterate in real time.',
  },
  {
    title: 'Text & Image to Video',
    description:
      'Turn prompts or still images into videos with Kling and other cutting-edge models \u2014 all orchestrated directly inside your workflow.',
  },
  {
    title: 'LLM Assistant',
    description:
      'Integrated AI text generation via OpenRouter. Refine prompts, brainstorm ideas, or chain LLM reasoning into your generation pipeline.',
  },
  {
    title: 'Privacy First',
    description:
      'Fully self-hosted. Your prompts, images, and workflows never leave your machine. No telemetry, no tracking, no cloud dependency.',
  },
  {
    title: 'Open Source & Free',
    description:
      'MIT licensed \u2014 use it, modify it, distribute it. Export workflows as .caraca.json files to share, back up, or collaborate.',
  },
]

export default function Features() {
  return (
    <section className="rv" id="features" aria-labelledby="fh">
      <h2 className="st" id="fh">
        WHY <span className="gl">CARACA</span>
      </h2>
      <p className="ss">
        The power of visual AI workflows, without the complexity or the
        subscription fees.
      </p>
      <div className="fg">
        {features.map((f) => (
          <article className="fc" key={f.title}>
            <span className="fi" aria-hidden="true">
              &#x2726;
            </span>
            <h3>{f.title}</h3>
            <p>{f.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
