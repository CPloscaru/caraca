import './App.css'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import DemoPreview from './components/DemoPreview'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import Comparison from './components/Comparison'
import TechStack from './components/TechStack'
import CallToAction from './components/CallToAction'
import Footer from './components/Footer'

export default function App() {
  return (
    <>
      <a href="#main" className="skip">
        Skip to main content
      </a>
      <canvas id="cosmos" aria-hidden="true" />
      <Navbar />
      <main id="main">
        <Hero />
        <DemoPreview />
        <Features />
        <HowItWorks />
        <Comparison />
        <TechStack />
        <CallToAction />
      </main>
      <Footer />
    </>
  )
}
