import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import Logo from '../../src/app/Logo.svelte'

describe('Logo', () => {
  it('renders j in accent span and PDF in strong span', () => {
    const { getByText } = render(Logo)
    expect(getByText('j').className).toContain('logo-j')
    expect(getByText('PDF').className).toContain('logo-pdf')
  })
})
