'use strict'

import bounds from 'binary-search-bounds'
import fs from 'fs'
import fetch from 'node-fetch'
import stream from 'stream'
import util from 'util'

/**
 * A stream that calculates the value of each trade.
 */
class TradeValueStream extends stream.Transform {
	constructor() {
		super({
			objectMode: true
		})

		/**
		 * The history of the BNB asset, ordered by time.
		 * @type {Array.<Object>}
		 */
		this._bnbHistory = JSON.parse(fs.readFileSync('res/bnb-history.json'))
	}

	/**
	 * Calculates the value of a trade.
	 * @param {Trade}    chunk    The trade.
	 * @param {string}   encoding The encoding type (always 'Buffer').
	 * @param {function} callback A callback for when the transformation is complete.
	 */
	async _transform(chunk, encoding, callback) {
		// Calculate the value of the asset.
		chunk.value = await this._getValue(chunk.baseAsset, chunk.baseAmount, chunk.time)
		if (isNaN(chunk.value))
			throw new Error('Failed to convert ' + chunk.baseAsset + ' to CAD.')

		// Calculate the value of the fee.
		chunk.fee = (
			chunk.feeAsset === chunk.baseAsset ? chunk.value * chunk.feeAmount / chunk.baseAmount :
			chunk.feeAsset === chunk.quoteAsset ? chunk.value * chunk.feeAmount / chunk.quoteAmount :
			await this._getValue(chunk.feeAsset, chunk.feeAmount, chunk.time))

		this.push(chunk)

		callback()
	}

	async _getValue(asset, amount, time) {
		switch (asset) {
			case 'CAD':
				return amount
			case 'USD': {
				let response = await fetch(`https://blockchain.info/tobtc?currency=USD&nosavecurrency=true&time=${time}&value=${amount}`)
				amount = parseFloat((await response.text()).replace(',', ''))
				if (isNaN(amount)) {
					console.log('WARNING: Failed to convert ' + asset + ' to CAD: ' + response.text())
					return amount
				}
				// Fall through to BTC.
			}
			case 'BTC': {
				let response = await fetch(`https://blockchain.info/frombtc?currency=CAD&nosavecurrency=true&time=${time}&value=${Math.round(amount * 100000000)}`)
				amount = parseFloat((await response.text()).replace(',', ''))
				if (isNaN(amount))
					console.log('WARNING: Failed to convert ' + asset + ' to CAD: ' + response.text())
				return amount
			}
			case 'BNB': {
				var i = bounds.ge(this._bnbHistory, time, function(a, b) {
					return a.time - b.time
				})
				return i >= 0 ? this._bnbHistory[i] : NaN
			}
		}
	}
}

export default function(...args) {
	return new TradeValueStream(...args)
}
