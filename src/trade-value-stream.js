'use strict'

import fetch from 'node-fetch'
import stream from 'stream'
import util from 'util'

class TradeValueStream extends stream.Transform {
	constructor() {
		super({
			objectMode: true
		})
	}

	async _transform(chunk, encoding, callback) {
		// Calculate the value of the asset.
		chunk.value = await this._getValue(chunk.baseAsset, chunk.baseAmount, chunk.time)

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
				// Fall through to BTC.
			}
			case 'BTC': {
				let response = await fetch(`https://blockchain.info/frombtc?currency=CAD&nosavecurrency=true&time=${time}&value=${Math.round(amount * 100000000)}`)
				return parseFloat((await response.text()).replace(',', ''))
			}
			case 'BNB': {
				// TODO: Hard coded until we find an end point.
				return amount * 8.82
			}
		}
	}
}

export default function(...args) {
	return new TradeValueStream(...args)
}
