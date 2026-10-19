import { Frame, Locator, Page } from "playwright"
import { decide, displayLabel, FormField } from "./matcher.js"

/**
 * Reads the form in front of you and fills what the matcher is sure about.
 *
 * Its only clicks are on a Yes/No radio the profile has an answer for. It never
 * presses Submit or Next and never ticks a checkbox, so a form can only ever be
 * sent by the person looking at it. (Stepping through LinkedIn's Easy Apply
 * popup is `flow.ts`'s job, and it never presses Submit either.)
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
 * Radio buttons are read a group at a time, as one field whose options are the
 * buttons' labels. Checkboxes are not read at all; consent boxes and
 * demographic questions are a person's to answer.
 *
 * With `within`, only the dialog holding a button that matches that selector is
 * read, so a form behind a popup is left alone.
 */
function readFields(frame: Frame, within: string | undefined): Promise<FormField[]> {
  return frame.evaluate((within) => {
    const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)

    /** Every match under `root`, open shadow roots included — LinkedIn's popup can live in one. */
    const deepAll = (root: ParentNode, selector: string): Element[] => {
      const found = Array.from(root.querySelectorAll(selector))
      root.querySelectorAll('*').forEach(node => {
        if (node.shadowRoot) found.push(...deepAll(node.shadowRoot, selector))
      })
      return found
    }

    let scope: ParentNode = document
    if (within) {
      const anchor = deepAll(document, within)[0]
      if (!anchor) return []
      scope = anchor.closest('.jobs-easy-apply-modal, dialog, [role=dialog]') ?? (anchor.getRootNode() as ParentNode)
    }

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

      // A label lives in the same tree as its control, which inside a shadow root is not `document`.
      const root = el.getRootNode() as Document | ShadowRoot

      const labelledBy = el.getAttribute('aria-labelledby')
      if (labelledBy) {
        const text = clean(labelledBy.split(/\s+/).map(id => root.getElementById(id)?.textContent ?? '').join(' '))
        if (text) return text
      }

      if (el.id) {
        const forLabel = root.querySelector(`label[for="${CSS.escape(el.id)}"]`)
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

    const skipTypes = ['hidden', 'password', 'submit', 'button', 'reset', 'image', 'checkbox']
    const fields: FormField[] = []
    const radioGroups = new Map<unknown, HTMLInputElement[]>()

    const controls = deepAll(scope, 'input, textarea, select') as
      (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[]

    controls.forEach(el => {
      const tag = el.tagName.toLowerCase() as FormField['tag']
      const type = tag === 'input' ? (el.getAttribute('type') ?? 'text').toLowerCase() : tag
      if (skipTypes.includes(type)) return
      if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return
      if (type !== 'file' && !isVisible(el)) return

      if (type === 'radio') {
        const key = el.closest('fieldset') ?? ((el as HTMLInputElement).name || el)
        radioGroups.set(key, [...(radioGroups.get(key) ?? []), el as HTMLInputElement])
        return
      }

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

    // A group of radios is one question. Each button is tagged "<field id>.<option index>".
    radioGroups.forEach((radios, key) => {
      const id = String(fields.length)
      const optionLabel = (radio: HTMLInputElement) => {
        const label = radio.labels?.[0]
        return (label && textOf(label)) || clean(radio.getAttribute('aria-label') || radio.value)
      }
      const question = key instanceof Element ? key.querySelector('legend') : null
      const checked = radios.find(radio => radio.checked)

      radios.forEach((radio, index) => radio.setAttribute('data-jc-field', `${id}.${index}`))

      fields.push({
        id,
        tag: 'radio',
        type: 'radio',
        label: question ? textOf(question) : '',
        autocomplete: '',
        required: radios.some(radio => radio.required || radio.getAttribute('aria-required') === 'true'),
        value: checked ? optionLabel(checked) : '',
        options: radios.map(optionLabel),
      })
    })

    return fields
  }, within)
}

/** Whether the control still holds something — read back from the page, not from what we sent. */
function holdsValue(target: Locator): Promise<boolean> {
  return target.evaluate(el => {
    if (el instanceof HTMLSelectElement) return el.selectedIndex > 0
    const input = el as HTMLInputElement
    if (input.type === 'radio') return input.checked
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

export async function fillPage(
  page: Page,
  profile: Profile,
  resumePath: string | null,
  within?: string,
): Promise<FillReport> {
  const report: FillReport = { filled: [], needsYou: [], skipped: 0 }
  const attempted: { field: FormField; target: Locator }[] = []

  for (const frame of page.frames()) {
    // A frame can detach mid-read (an ad, a redirect); losing it is not losing the page.
    const fields = await readFields(frame, within).catch(() => [] as FormField[])

    for (const field of fields) {
      const action = decide(field, profile)
      let target = frame.locator(`[data-jc-field="${field.id}"]`)
      let sent = false

      try {
        if (action?.kind === 'option' && field.tag === 'radio') {
          // Radios are usually restyled, so press the label the way a click would.
          target = frame.locator(`[data-jc-field="${field.id}.${field.options.indexOf(action.option)}"]`)
          await target.evaluate(el => ((el as HTMLInputElement).labels?.[0] ?? (el as HTMLElement)).click(), undefined, {
            timeout: FIELD_TIMEOUT_MS,
          })
          sent = true
        } else if (action?.kind === 'text') {
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
