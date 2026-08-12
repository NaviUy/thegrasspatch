import {
  formatOrderLabel,
  formatOrderNumber,
  matchesOrderSearch,
} from '../orderNumber'

describe('order-number formatting', () => {
  it('formats a numeric order number without zero-padding', () => {
    expect(formatOrderNumber(27, 'abc')).toBe('#27')
    expect(formatOrderLabel(27, 'abc')).toBe('Order #27')
  })

  it('falls back to a shortened UUID for a legacy order', () => {
    expect(formatOrderLabel(null, 'abc12345-def')).toBe('Order #ABC123')
  })
})

describe('matchesOrderSearch', () => {
  const order = {
    id: 'abc12345-def',
    orderNumber: 27,
    customerName: 'Jane Doe',
  }

  it.each(['27', '#27', 'Order 27', 'jane', 'DOE'])('matches %s', (query) => {
    expect(matchesOrderSearch(order, query)).toBe(true)
  })

  it('does not partially match a different numeric order number', () => {
    expect(matchesOrderSearch(order, '2')).toBe(false)
  })
})
