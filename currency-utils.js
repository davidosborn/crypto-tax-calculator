'use strict'

export default class CurrencyUtils {
	static normalizeCurrencyCode(code) {
		code = code.toUpperCase()
		switch (code) {
			case 'XBT':
			case 'XBTC':
			case 'XXBT':
				return 'BTC'
			case 'XETH':
				return 'ETH'
			case 'XLTC':
				return 'LTC'
			case 'ZCAD':
				return 'CAD'
			case 'ZUSD':
				return 'USD'
			default:
				return code
		}
	}

	static getCurrencyPriority(code) {
		switch (code) {
			case 'CAD':
			case 'USD':
				return 0
			case 'BTC':
				return 1
			case 'BNB':
			case 'ETH':
			case 'LTC':
				return 2
			default:
				return 3
		}
	}
}
