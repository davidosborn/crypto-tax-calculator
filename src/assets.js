'use strict'

/**
 * Functions for working with crypto-currency assets.
 */
export default class Assets {
	/**
	 * Normalizes a currency code.
	 * @param {string} code The currency code.
	 * @returns {string} The normalized currency code.
	 */
	static normalizeCode(code) {
		code = code.toUpperCase()
		switch (code) {
			case 'BCC':
				return 'BCH'
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

	/**
	 * Gets the priority of a currency.
	 * @param {string} code The currency code.
	 * @returns {number} The priority.
	 */
	static getPriority(code) {
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
