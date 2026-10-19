import { Frame, Locator, Page } from "playwright"
import { decide, displayLabel, FormField } from "./matcher.js"

/**
 * Reads the form in front of you and fills what the matcher is sure about.
 *
 * It never clicks anything — not Submit, not Next, not a checkbox. Filling is
 * the whole of its reach, so a form can only ever be sent by the person
 * looking at it.
 */

const FIELD_TIMEOUT_MS = 3_000

export interface FillReport {
  filled: string[]
  /** Required, still empty. */
  needsYou: string[]
  /** Everything else that was left alone. */
  skipped: number
}

/**
 * Reads every fillable control in one frame, and tags each with data-jc-field so
 * the fill step can find the same element again.
 *
 * Only what a person could see and type into: hidden inputs, honeypots pushed
 * off-screen, disabled and read-only fields are all ignored — a honeypot that
 * gets filled is how a form decides it is talking to a bot. File inputs are the
 * exception to "visible", since sites hide them behind an Attach button.
 *
 * Radios and checkboxes are not read at all; consent boxes and demographic
 * questions are a person's to answer.
 */
function readFields(frame: Frame): Promise<FormField[]> {
  return frame.evaluate(() => {
    const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)

    const isVisible = (el: Element) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 0 && rect.height > 0
        && rect.right + window.scrollX > 0 && rect.bottom + window.scrollY > 0
        && style.visibility !== 'hidden' && style.display !== 'none'
    }

    /** A label's own words, without the controls and option lists nested inside it. */
    const textOf = (node: Element) => {
      const copy = node.cloneNode(true) as Element
      copy.querySelectorAll('input, select, textarea, option, button, svg').forEach(n => n.remove())
      return clean(copy.textContent)
    }

    const controlCount = (node: Element) =>
      node.querySelectorAll('input:not([type=hidden]), select, textarea').length

    const labelOf = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
      const aria = clean(el.getAttribute('aria-label'))
      if (aria) return aria

      const labelledBy = el.getAttribute('aria-labelledby')
      if (labelledBy) {
        const text = clean(labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' '))
        if (text) return text
      }

      if (el.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        if (forLabel && textOf(forLabel)) return textOf(forLabel)
      }

      const wrapping = el.closest('label')
      if (wrapping && textOf(wrapping)) return textOf(wrapping)

      // Failing those, the nearest label above it — but only through wrappers
      // that hold this control and (for a file input, with its pasted-text
      // twin) hardly anything else. A wrapper holding the whole form would hand
      // every unlabelled box the first field's label.
      const allowed = el.getAttribute('type') === 'file' ? 3 : 1
      let node = el.parentElement
      for (let depth = 0; depth < 4 && node && controlCount(node) <= allowed; depth++, node = node.parentElement) {
        const label = node.querySelector('label, legend')
        if (label && !label.contains(el) && textOf(label)) return textOf(label)
      }

      return clean(el.getAttribute('placeholder') || el.getAttribute('name') || el.id)
    }

    const skipTypes = ['hidden', 'password', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio']
    const fields: FormField[] = []

    const controls = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    )

    controls.forEach(el => {
      const tag = el.tagName.toLowerCase() as FormField['tag']
      const type = tag === 'input' ? (el.getAttribute('type') ?? 'text').toLowerCase() : tag
      if (skipTypes.includes(type)) return
      if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return
      if (type !== 'file' && !isVisible(el)) return

      const id = String(fields.length)
      el.setAttribute('data-jc-field', id)

      let value = (el as HTMLInputElement).value ?? ''
      let options: string[] = []
      if (tag === 'select') {
        const select = el as HTMLSelectElement
        options = Array.from(select.options).map(option => clean(option.textContent))
        value = select.selectedIndex > 0 ? clean(select.options[select.selectedIndex]?.textContent) : ''
      }
      if (type === 'file') value = (el as HTMLInputElement).files?.length ? 'attached' : ''

      fields.push({
        id,
        tag,
        type,
        label: labelOf(el),
        autocomplete: el.getAttribute('autocomplete') ?? '',
        required: (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true',
        value,
        options,
      })
    })

    return fields
  })
}

/** Whether the control still holds something — read back from the page, not from what we sent. */
function holdsValue(target: Locator): Promise<boolean> {
  return target.evaluate(el => {
    if (el instanceof HTMLSelectElement) return el.selectedIndex > 0
    const input = el as HTMLInputElement
    return input.type === 'file' ? (input.files?.length ?? 0) > 0 : input.value !== ''
  }).catch(() => false)
}

/**
 * Files an unfilled field under "needs you" or "left alone".
 *
 * A required field with no label of its own is almost always the hidden inner
 * input of a custom dropdown whose real, labelled control is listed beside it;
 * naming it would print "(unlabelled field)" under every such question.
 */
function leaveUnfilled(report: FillReport, field: FormField) {
  if (field.required && field.label.trim()) report.needsYou.push(displayLabel(field.label))
  else report.skipped++
}

export async function fillPage(page: Page, profile: Profile, resumePath: string | null): Promise<FillReport> {
  const report: FillReport = { filled: [], needsYou: [], skipped: 0 }
  const attempted: { field: FormField; target: Locator }[] = []

  for (const frame of page.frames()) {
    // A frame can detach mid-read (an ad, a redirect); losing it is not losing the page.
    const fields = await readFields(frame).catch(() => [] as FormField[])

    for (const field of fields) {
      const action = decide(field, profile)
      const target = frame.locator(`[data-jc-field="${field.id}"]`)
      let sent = false

      try {
        if (action?.kind === 'text') {
          await target.fill(action.value, { timeout: FIELD_TIMEOUT_MS })
          sent = true
        } else if (action?.kind === 'option') {
          await target.selectOption({ label: action.option }, { timeout: FIELD_TIMEOUT_MS })
          sent = true
        } else if (action?.kind === 'file' && resumePath) {
          await target.setInputFiles(resumePath, { timeout: FIELD_TIMEOUT_MS })
          sent = true
        }
      } catch (err) {
        console.warn(`[autofill] could not fill "${field.label}":`, err instanceof Error ? err.message : err)
      }

      if (sent) attempted.push({ field, target })
      else if (field.value) report.skipped++
      else leaveUnfilled(report, field)
    }
  }

  // Checked at the end, once every later field has had focus: a typeahead such
  // as Lever's location box keeps typed text only until it loses focus, and
  // empties itself unless a suggestion was picked. Reporting that as filled
  // would be telling someone a box is done when it is blank.
  await page.waitForTimeout(250)

  for (const { field, target } of attempted) {
    if (await holdsValue(target)) report.filled.push(displayLabel(field.label))
    else leaveUnfilled(report, field)
  }

  return report
}
