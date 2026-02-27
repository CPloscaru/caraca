interface Row {
  feature: string
  caraca: string
  comfyui: string
  freepik: string
  styles: [string, string, string]
  ariaLabels: [string?, string?, string?]
}

const rows: Row[] = [
  {
    feature: 'Visual node editor',
    caraca: '\u2713',
    comfyui: '\u2713',
    freepik: '\u2717',
    styles: ['cy', 'cy', 'cn'],
    ariaLabels: [undefined, undefined, 'No'],
  },
  {
    feature: 'Easy to set up & use',
    caraca: '\u2713',
    comfyui: 'Steep curve',
    freepik: '\u2713',
    styles: ['cy', 'cp', 'cy'],
    ariaLabels: [],
  },
  {
    feature: 'Image generation',
    caraca: '\u2713',
    comfyui: '\u2713',
    freepik: '\u2713',
    styles: ['cy', 'cy', 'cy'],
    ariaLabels: [],
  },
  {
    feature: 'Video generation',
    caraca: '\u2713',
    comfyui: '\u2713',
    freepik: '\u2713',
    styles: ['cy', 'cy', 'cy'],
    ariaLabels: [],
  },
  {
    feature: 'Built-in LLM assistant',
    caraca: '\u2713',
    comfyui: '\u2717',
    freepik: '\u2717',
    styles: ['cy', 'cn', 'cn'],
    ariaLabels: [undefined, 'No', 'No'],
  },
  {
    feature: 'Free & no subscription',
    caraca: '\u2713',
    comfyui: 'Free local, paid cloud',
    freepik: '\u2717',
    styles: ['cy', 'cp', 'cn'],
    ariaLabels: [undefined, undefined, 'No'],
  },
  {
    feature: 'Open source',
    caraca: '\u2713 MIT',
    comfyui: '\u2713 GPLv3',
    freepik: '\u2717',
    styles: ['cy', 'cy', 'cn'],
    ariaLabels: [undefined, undefined, 'No'],
  },
  {
    feature: 'Data stays on your machine',
    caraca: '\u2713 Always',
    comfyui: 'Local only',
    freepik: '\u2717 Cloud',
    styles: ['cy', 'cp', 'cn'],
    ariaLabels: [undefined, undefined, 'Cloud-processed'],
  },
  {
    feature: 'No vendor lock-in',
    caraca: '\u2713',
    comfyui: '\u2713',
    freepik: '\u2717 Credits',
    styles: ['cy', 'cy', 'cn'],
    ariaLabels: [undefined, undefined, 'Credit system'],
  },
  {
    feature: 'Export workflows',
    caraca: '\u2713 JSON',
    comfyui: '\u2713 JSON',
    freepik: '\u2717',
    styles: ['cy', 'cy', 'cn'],
    ariaLabels: [undefined, undefined, 'No'],
  },
]

export default function Comparison() {
  return (
    <section className="rv" id="compare" aria-labelledby="cmh">
      <h2 className="st" id="cmh">
        CARACA VS <span className="gl">ALTERNATIVES</span>
      </h2>
      <p className="ss">
        An honest comparison. We believe in transparency &mdash; here&apos;s how
        Caraca stacks up.
      </p>
      <div
        className="cw"
        role="table"
        aria-label="Feature comparison between Caraca, ComfyUI, and Freepik"
      >
        <div className="cr ch" role="row">
          <div className="cc" role="columnheader" />
          <div className="cc hl" role="columnheader">
            Caraca
          </div>
          <div className="cc" role="columnheader">
            ComfyUI
          </div>
          <div className="cc" role="columnheader">
            Freepik
          </div>
        </div>
        {rows.map((row) => (
          <div className="cr" role="row" key={row.feature}>
            <div className="cc" role="cell">
              {row.feature}
            </div>
            {([row.caraca, row.comfyui, row.freepik] as const).map(
              (val, i) => (
                <div
                  className={`cc ${row.styles[i]}`}
                  role="cell"
                  key={i}
                  {...(row.ariaLabels[i]
                    ? { 'aria-label': row.ariaLabels[i] }
                    : {})}
                >
                  {val}
                </div>
              ),
            )}
          </div>
        ))}
        <div className="cnote">
          * ComfyUI is free to self-host but offers Comfy Cloud (paid,
          credit-based). Freepik uses subscription + credits (~$5.75/mo+) with
          cloud-processed data. Caraca is fully self-hosted &mdash; only API
          calls to fal.ai/OpenRouter when running nodes.
        </div>
      </div>
    </section>
  )
}
