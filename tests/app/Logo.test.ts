import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import Logo from '../../src/app/Logo.svelte'

describe('Logo', () => {
  it('renders j in accent span and PDF in strong span', () => {
    const { getByText } = render(Logo)
    expect(getByText('j').className).toContain('logo-j')
    expect(getByText('PDF').className).toContain('logo-pdf')
  })

  it('full variant spells out juliePDF with julie in the accent span', () => {
    const { getByText, container } = render(Logo, { props: { full: true } })
    expect(getByText('julie').className).toContain('logo-j')
    expect(getByText('PDF').className).toContain('logo-pdf')
    expect(container.textContent).toBe('juliePDF')
  })
})
