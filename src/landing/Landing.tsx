import { useEffect } from 'react'
import Nav from './Nav'
import VideoHero from './hero/VideoHero'
import Species from './sections/Species'
import LiveYard from './sections/LiveYard'
import Calculator from './sections/Calculator'
import Services from './sections/Services'
import Trust from './sections/Trust'
import Enquiry from './sections/Enquiry'
import Contact from './sections/Contact'
import { useCatalog } from './data'

export default function Landing() {
  const { company, totals, species, live } = useCatalog()

  useEffect(() => {
    document.title = `${company.name} — Seasoned Timber, Sawmill, Doors & Frames`
    const html = document.documentElement
    const prev = html.style.scrollBehavior
    html.style.scrollBehavior = 'smooth'
    return () => { html.style.scrollBehavior = prev }
  }, [company.name])

  return (
    <div id="top" className="relative overflow-x-clip bg-canvas text-ink">
      <a href="#species" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-paper focus:px-3 focus:py-2">Skip the story</a>
      <Nav name={company.name} />
      <main>
        <VideoHero />
        <Species species={species} showPrices={company.show_prices} />
        <LiveYard totals={totals} species={species} live={live} />
        <Calculator species={species} showPrices={company.show_prices} />
        <Services />
        <Trust />
        <Enquiry company={company} species={species} />
      </main>
      <Contact company={company} />
    </div>
  )
}
