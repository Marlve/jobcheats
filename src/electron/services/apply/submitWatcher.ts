import { BrowserContext } from "playwright"

/**
 * Notices when an application has gone through, so its window can be put away.
 *
 * Nothing here presses Submit; this only reads the page you are looking at for
 * what sites say afterwards. It is told to look only once Autofill has filled
 * something in this window, so a listing that happens to contain such a phrase
 * is never mistaken for a sent application.
 */

const CHECK_MS = 2_000

/** Specific enough that a job description is unlikely to say it. */
const SENT = /\b(application (was |has been |is )?(submitted|sent|received)|(thanks|thank you) for applying|you(?:'|’)ve applied|successfully applied|your application is on its way)\b/i

/** Text of the page, including what sits in open shadow roots (LinkedIn's popup does). */
function readText(): string {
  const parts = [document.body?.innerText ?? '']
  document.querySelectorAll('*').forEach(node => {
    if (node.shadowRoot) parts.push(node.shadowRoot.textContent ?? '')
  })
  return parts.join(' ').slice(0, 20_000)
}

/** Returns a function that stops the watching. */
export function watchSubmitted(context: BrowserContext, shouldLook: () => boolean, onSent: () => void): () => void {
  let stopped = false
  let looking = false

  const stop = () => {
    stopped = true
    clearInterval(timer)
  }

  const timer = setInterval(async () => {
    if (stopped || looking || !shouldLook()) return

    looking = true
    try {
      for (const page of context.pages()) {
        const text = await page.evaluate(readText).catch(() => '')
        if (SENT.test(text.replace(/\s+/g, ' '))) {
          stop()
          onSent()
          return
        }
      }
    } finally {
      looking = false
    }
  }, CHECK_MS)

  return stop
}
