import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function CosmosCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return
    const canvas = canvasRef.current
    if (!canvas) return

    const W = () => window.innerWidth
    const H = () => window.innerHeight
    const PR = Math.min(window.devicePixelRatio, 2)

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
    })
    renderer.setPixelRatio(PR)
    renderer.setSize(W(), H())

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, W() / H(), 0.1, 200)
    camera.position.set(0, 0, 50)

    // Mouse tracking
    let mx = 0,
      my = 0,
      smx = 0,
      smy = 0
    const onMouseMove = (e: MouseEvent) => {
      mx = (e.clientX / W() - 0.5) * 2
      my = (e.clientY / H() - 0.5) * 2
    }
    document.addEventListener('mousemove', onMouseMove)

    // Star shaders
    const SV = `
attribute float aSize; attribute float aBright; attribute float aPhase; attribute vec3 aColor;
uniform float uTime; uniform float uPR;
varying float vAlpha; varying vec3 vColor;
void main(){
  vColor=aColor;
  float tw=0.45+0.55*(0.5+0.5*sin(uTime*(0.3+aBright*0.5)+aPhase));
  vAlpha=aBright*tw;
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_PointSize=aSize*uPR*(70.0/max(-mv.z,1.0));
  gl_Position=projectionMatrix*mv;
}`
    const SF = `
varying float vAlpha; varying vec3 vColor;
void main(){
  vec2 c=gl_PointCoord-0.5; float d=length(c);
  if(d>0.5)discard;
  float core=1.0-smoothstep(0.0,0.12,d);
  float halo=1.0-smoothstep(0.0,0.5,d);
  float a=(core*0.6+halo*0.4)*vAlpha;
  gl_FragColor=vec4(vColor,a);
}`

    // Stars geometry
    const N = 1200
    const pos = new Float32Array(N * 3)
    const sz = new Float32Array(N)
    const br = new Float32Array(N)
    const ph = new Float32Array(N)
    const col = new Float32Array(N * 3)
    const pal = [
      [0.93, 0.93, 1],
      [1, 0.97, 0.9],
      [0.85, 0.88, 1],
      [1, 0.92, 0.7],
      [0.75, 0.8, 1],
    ]

    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2
      const phi2 = Math.acos(2 * Math.random() - 1)
      const r = 20 + Math.random() * 70
      pos[i * 3] = r * Math.sin(phi2) * Math.cos(th)
      pos[i * 3 + 1] = r * Math.sin(phi2) * Math.sin(th)
      pos[i * 3 + 2] = r * Math.cos(phi2) - 40

      const roll = Math.random()
      if (roll < 0.02) {
        sz[i] = 2.5 + Math.random() * 1.5
        br[i] = 0.8 + Math.random() * 0.2
      } else if (roll < 0.15) {
        sz[i] = 1.2 + Math.random() * 1
        br[i] = 0.5 + Math.random() * 0.3
      } else {
        sz[i] = 0.5 + Math.random() * 0.8
        br[i] = 0.15 + Math.random() * 0.35
      }
      ph[i] = Math.random() * Math.PI * 2

      const c = pal[Math.floor(Math.random() * pal.length)]
      col[i * 3] = c[0]
      col[i * 3 + 1] = c[1]
      col[i * 3 + 2] = c[2]
    }

    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1))
    sg.setAttribute('aBright', new THREE.BufferAttribute(br, 1))
    sg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1))
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3))

    const sm = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: PR } },
      vertexShader: SV,
      fragmentShader: SF,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const stars = new THREE.Points(sg, sm)
    scene.add(stars)

    // Nebulae (shader planes)
    const NV =
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
    const nebMaterials: THREE.ShaderMaterial[] = []

    function mkNeb(
      color: number,
      px: number,
      py: number,
      pz: number,
      size: number,
      op: number,
    ) {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uC: { value: new THREE.Color(color) },
          uO: { value: op },
        },
        vertexShader: NV,
        fragmentShader:
          'varying vec2 vUv;uniform float uTime;uniform vec3 uC;uniform float uO;void main(){vec2 c=vUv-0.5;float d=length(c);float a=exp(-d*d*8.0)*uO*(0.95+0.05*sin(uTime*0.2));gl_FragColor=vec4(uC,a);}',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
      const geo = new THREE.PlaneGeometry(size, size)
      const mesh = new THREE.Mesh(geo, m)
      mesh.position.set(px, py, pz)
      scene.add(mesh)
      nebMaterials.push(m)
      return { material: m, geometry: geo, mesh }
    }

    const neb1 = mkNeb(0x5a2f90, -18, 12, -55, 80, 0.035)
    const neb2 = mkNeb(0x8b7030, 20, -10, -65, 70, 0.025)

    // Shooting stars
    interface Shoot {
      line: THREE.Line
      geo: THREE.BufferGeometry
      mat: THREE.ShaderMaterial
      prog: number
      ox: number
      oy: number
      oz: number
      dx: number
      dy: number
      dz: number
      speed: number
      len: number
      segs: number
      dead: boolean
    }
    let shoots: Shoot[] = []

    function spawnShoot() {
      const segs = 40
      const pa = new Float32Array(segs * 3)
      const al = new Float32Array(segs)
      for (let j = 0; j < segs; j++) al[j] = j / (segs - 1)

      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pa, 3))
      g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1))

      const mt = new THREE.ShaderMaterial({
        vertexShader:
          'attribute float aAlpha;varying float vA;void main(){vA=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:
          'varying float vA;void main(){gl_FragColor=vec4(1.0,0.95,0.75,vA*vA*0.8);}',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })

      const line = new THREE.Line(g, mt)
      scene.add(line)

      const ox = (Math.random() - 0.5) * 60
      const oy = 15 + Math.random() * 20
      const oz = -20 - Math.random() * 30
      const ang = -0.4 - Math.random() * 0.5
      const dir = Math.random() > 0.5 ? 1 : -1

      shoots.push({
        line,
        geo: g,
        mat: mt,
        prog: 0,
        ox,
        oy,
        oz,
        dx: Math.cos(ang) * dir,
        dy: Math.sin(ang),
        dz: -0.1,
        speed: 40 + Math.random() * 30,
        len: 6 + Math.random() * 8,
        segs,
        dead: false,
      })
    }

    // Animation loop
    let prev = performance.now() / 1000
    let rafId: number

    function tick() {
      rafId = requestAnimationFrame(tick)
      const now = performance.now() / 1000
      const dt = Math.min(now - prev, 0.05)
      prev = now

      smx += (mx - smx) * 0.02
      smy += (my - smy) * 0.02
      camera.position.x = smx * 3
      camera.position.y = -smy * 2

      sm.uniforms.uTime.value = now
      stars.rotation.y = now * 0.008
      stars.rotation.x = Math.sin(now * 0.05) * 0.015

      neb1.material.uniforms.uTime.value = now
      neb2.material.uniforms.uTime.value = now

      // Shooting stars update
      for (const ss of shoots) {
        if (ss.dead) continue
        ss.prog += dt * ss.speed
        const arr = ss.geo.attributes.position.array as Float32Array
        for (let j = 0; j < ss.segs; j++) {
          const f = ss.prog - ss.len * (1 - j / (ss.segs - 1))
          arr[j * 3] = ss.ox + ss.dx * f
          arr[j * 3 + 1] = ss.oy + ss.dy * f
          arr[j * 3 + 2] = ss.oz + ss.dz * f
        }
        ss.geo.attributes.position.needsUpdate = true
        if (ss.prog > 35) {
          ss.dead = true
          scene.remove(ss.line)
          ss.geo.dispose()
          ss.mat.dispose()
        }
      }
      shoots = shoots.filter((s) => !s.dead)
      renderer.render(scene, camera)
    }
    tick()

    // Spawn shooting stars periodically
    const shootInterval = setInterval(() => {
      if (Math.random() < 0.4) spawnShoot()
    }, 3500)

    // Resize handler
    const onResize = () => {
      camera.aspect = W() / H()
      camera.updateProjectionMatrix()
      renderer.setSize(W(), H())
    }
    window.addEventListener('resize', onResize)

    // Cleanup
    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(shootInterval)
      document.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)

      // Dispose shooting stars still alive
      for (const ss of shoots) {
        scene.remove(ss.line)
        ss.geo.dispose()
        ss.mat.dispose()
      }

      // Dispose nebulae
      scene.remove(neb1.mesh)
      neb1.geometry.dispose()
      neb1.material.dispose()
      scene.remove(neb2.mesh)
      neb2.geometry.dispose()
      neb2.material.dispose()

      // Dispose stars
      scene.remove(stars)
      sg.dispose()
      sm.dispose()

      renderer.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} id="cosmos" aria-hidden="true" />
}
