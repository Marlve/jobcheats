import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const playwright = {
    scrapeLinkedIn: async () => await window.electron.scrapeLinkedIn()
  }
  const db = {
    checkDB: async () => await window.electron.checkDB()
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
          onClick={playwright.scrapeLinkedIn}
        >
          Scrape LinkedIn
        </button>
        <button
          onClick={db.checkDB}
        >
          Check Database
        </button>
      </section>

      <div className="ticks"></div>
    </>
  )
}

export default App
