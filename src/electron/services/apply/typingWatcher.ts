import { BrowserContext } from "playwright"

/**
 * Tells the caller when you finish with a field, in any page of the window.
 *
 * Answers are otherwise only learned when Autofill is pressed, so one typed in
 * and then sent on with your own click on Continue would never be seen. This
 * watches for you leaving a field or changing a choice and calls back at once:
 * the click that follows usually swaps the page for the next step, so waiting
 * to batch up events would read a form that is already gone. Events that arrive
 * while a call is running are folded into one more call after it.
 */

/** Returns a function that stops any further calls. */
export async function watchTyping(context: BrowserContext, onTyped: () => Promise<void>): Promise<() => void> {
  let running = false
  let again = false
  let stopped = false

  async function run() {
    if (running) {
      again = true
      return
    }

    running = true
    try {
      do {
        again = false
        await onTyped()
      } while (again && !stopped)
    } catch (err) {
      console.warn('[autofill] could not note what was typed:', err instanceof Error ? err.message : err)
    } finally {
      running = false
    }
  }

  await context.exposeFunction('jcFieldDone', () => {
    if (!stopped) void run()
  })

  // Runs in every frame of every page, including ones opened later.
  await context.addInitScript(() => {
    const done = () => (window as unknown as { jcFieldDone?: () => void }).jcFieldDone?.()
    window.addEventListener('focusout', done, true)
    window.addEventListener('change', done, true)
  })

  return () => { stopped = true }
}
