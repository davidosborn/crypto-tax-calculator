'use strict'

import bounds from 'binary-search-bounds'
import fs from 'fs'
import fetch from 'node-fetch'
import stream from 'stream'
import util from 'util'
import formatTime from './format-time'

/**
 * A stream that calculates the value of each trade.
 */
class TradeValueStream extends stream.Transform {
	/**
	 * Initializes a new instance.
	 * @param {object}  [options]         The options.
	 * @param {object}  [options.history] The historical data.
	 * @param {boolean} [options.verbose] A value indicating whether to write extra information to the console.
	 * @param {boolean} [options.web]     A value indicating whether to request asset values from the internet.
	 */
	constructor(options) {
		super({
			objectMode: true
		})

		this._options = options
	}

	/**
	 * Calculates the value of a trade.
	 * @param {Trade}    chunk    The trade.
	 * @param {string}   encoding The encoding type (always 'Buffer').
	 * @param {function} callback A callback for when the transformation is complete.
	 */
	async _transform(chunk, encoding, callback) {
		// Log the trade.
		if (this._options?.verbose) {
			console.log('Trade ' + chunk.baseAsset + '/' + chunk.quoteAsset + ' on ' + formatTime(chunk.time) + (chunk.exchange ? ' on ' + chunk.exchange : '') + '.')
		}

		// Calculate the value of the asset.
		chunk.value = await this._getValue(chunk.baseAsset, chunk.baseAmount, chunk.time)

		// Calculate the value of the fee.
		chunk.feeValue = (
			chunk.feeAsset === chunk.baseAsset ? chunk.value * chunk.feeAmount / chunk.baseAmount :
			chunk.feeAsset === chunk.quoteAsset ? chunk.value * chunk.feeAmount / chunk.quoteAmount :
			await this._getValue(chunk.feeAsset, chunk.feeAmount, chunk.time))

		this.push(chunk)

		callback()
	}

	/**
	 * Gets the value of an asset.
	 * @param {string} asset The asset.
	 * @param {number} amount The amount.
	 * @param {number} time The time, as a UNIX timestamp.
	 * @returns {number} The value, in Canadian dollars.
	 */
	async _getValue(asset, amount, time) {
		if (asset === 'CAD')
			return amount

		// Look up the value of the asset in the history.
		let value = this._lookupValue(asset, amount, time)
		if (!isNaN(value))
			return value

		// Request the value of the asset from the internet.
		value = await this._requestValue(asset, amount, time)
		if (!isNaN(value))
			return value

		console.log('WARNING: Unable to determine value of ' + amount + ' ' + asset + ' at ' + formatTime(time) + '.')
		throw new Error('Failed to convert ' + asset + ' to CAD.')
	}

	/**
	 * Looks up the value of an asset in the history.
	 * @param {string} asset The asset.
	 * @param {number} amount The amount.
	 * @param {number} time The time, as a UNIX timestamp.
	 * @returns {number} The value, in Canadian dollars.
	 */
	_lookupValue(asset, amount, time) {
		if (!this._options.history)
			return NaN

		// Look up the value of the asset directly.
		let value = this._lookupValue0(asset, 'CAD', time)
		if (!isNaN(value))
			return amount * value

		// Look up the value of the asset indirectly.
		let usdValue = this._lookupValue0(asset, 'USD', time)
		let cadValue = this._lookupValue0('USD', 'CAD', time)
		if (!isNaN(usdValue) && !isNaN(cadValue)) {
			return amount * usdValue * cadValue
		}

		return NaN
	}

	/**
	 * Looks up the value of an asset in the history.
	 * @param {string} baseAsset The base asset.
	 * @param {string} quoteAsset The quote asset.
	 * @param {number} time The time, as a UNIX timestamp.
	 * @returns {number} The value.
	 */
	_lookupValue0(baseAsset, quoteAsset, time) {
		let value = this._lookupValue1(baseAsset, quoteAsset, time)
		if (isNaN(value))
			value = 1 / this._lookupValue1(quoteAsset, baseAsset, time)
		return value
	}

	/**
	 * Looks up the value of an asset in the history.
	 * @param {string} baseAsset The base asset.
	 * @param {string} quoteAsset The quote asset.
	 * @param {number} time The time, as a UNIX timestamp.
	 * @returns {number} The value.
	 */
	_lookupValue1(baseAsset, quoteAsset, time) {
		let history = this._options.history[baseAsset.toUpperCase() + '-' + quoteAsset.toUpperCase()]
		if (!history)
			return NaN

		let i = bounds.lt(history, time, TradeValueStream._compareHistoryTime)
		if (i === -1)
			return NaN

		if (i === history.length) {
			return history[i].close
		}

		// Approximate the value using linear interpolation.
		let t = (time - history[i].time) / (history[i + 1].time - history[i].time)
		return TradeValueStream._lerp(history[i].open, history[i + 1].open, t)
	}

	/**
	 * Requests the value of an asset from the internet.
	 * @param {string} asset The asset.
	 * @param {number} amount The amount.
	 * @param {number} time The time, as a UNIX timestamp.
	 * @returns {number} The value, in Canadian dollars.
	 */
	async _requestValue(asset, amount, time) {
		if (!this._options.web)
			return NaN

		switch (asset) {
			case 'USD': {
				let response = await fetch(`https://blockchain.info/tobtc?currency=USD&nosavecurrency=true&time=${time}&value=${amount}`)
				amount = parseFloat((await response.text()).replace(',', ''))
				if (isNaN(amount)) {
					console.log('WARNING: Request to blockchain.info failed: ' + response.text())
					return amount
				}
				// Fall through to BTC.
			}
			case 'BTC': {
				let response = await fetch(`https://blockchain.info/frombtc?currency=CAD&nosavecurrency=true&time=${time}&value=${Math.round(amount * 100000000)}`)
				amount = parseFloat((await response.text()).replace(',', ''))
				if (isNaN(amount))
					console.log('WARNING: Request to blockchain.info failed: ' + response.text())
				return amount
			}
		}

		return NaN
	}

	/**
	 * Compares a historical record with a time.
	 * @param {object} a The record.
	 * @param {object} b The time.
	 * @returns {number} The result.
	 */
	static _compareHistoryTime(a, b) {
		return a.time - b
	}

	/**
	 * Linearly interpolates between two values.
	 * @param {number} a The first value.
	 * @param {number} b The second value.
	 * @param {number} t The interpolation factor.
	 * @returns {number} The interpolated value.
	 */
	static _lerp(a, b, t) {
		return a * t + b * (1 - t)
	}
}

export default function(...args) {
	return new TradeValueStream(...args)
}
