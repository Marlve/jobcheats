import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const routing = {
    handleLinkedIn: async () => await window.electron.openLinkedIn(),

    handleSeek: async () => await window.electron.openSeek()
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
          onClick={routing.handleLinkedIn}
        >
          Log In to LinkedIn
        </button>
        <button
          onClick={routing.handleSeek}
        >
          Log In to Seek
        </button>
      </section>

      <div className="ticks"></div>
    </>
  )
}

export default App
