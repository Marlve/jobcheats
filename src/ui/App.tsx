import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const routing = {
    openLinkedIn: async () => await window.electron.openLinkedIn(),
  }

  const playwright = {
    scrapeLinkedIn: async () => await window.electron.scrapeLinkedIn()
  }
  const [count, setCount] = useState(0)

  useEffect(() => {
    window.electron.subscribeStatistics(stats => console.log(stats));
  }, [])

  return (
    <>
      <section id="center">
        <div className="hero">
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
        <button
          onClick={routing.openLinkedIn}
        >
          Log In to LinkedIn
        </button>

        <button
          onClick={playwright.scrapeLinkedIn}
        >
          Scrape LinkedIn
        </button>
      </section>

      <div className="ticks"></div>
    </>
  )
}

export default App
