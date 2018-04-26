'use strict'

import fetch from 'node-fetch'
import process from 'process'
import stream from 'stream'
import CurrencyUtils from './currency-utils'

class TradeParseStream extends stream.Transform {
	constructor() {
		super({
			objectMode: true
		})

		this._tradeChunks = []
	}

	async _transform(chunk, encoding, callback) {
		if (chunk['Date(UTC)'] !== undefined)
			await this._transformBinance(chunk)
		else if (chunk.OrderUuid !== undefined)
			await this._transformBittrex(chunk)
		else if ((chunk.txid !== undefined) && (chunk.refid !== undefined))
			await this._transformKraken(chunk)

		callback()
	}

	async _transformBinance(chunk) {
		this.push({
			baseAsset: CurrencyUtils.normalizeCurrencyCode(chunk.Market.substring(chunk.Market.length - 3)),
			quoteAsset: CurrencyUtils.normalizeCurrencyCode(chunk.Market.substring(0, chunk.Market.length - 3)),
			baseAmount: chunk.Amount * chunk.Price,
			quoteAmount: chunk.Amount,
			sell: chunk.Type.includes('SELL'),
			time: chunk['Date(UTC)'].getTime(),
			feeAsset: CurrencyUtils.normalizeCurrencyCode(chunk['Fee Coin']),
			feeAmount: chunk.Fee
		})
	}

	async _transformBittrex(chunk) {
		let [baseAsset, quoteAsset] = chunk.Exchange.split('-')
		baseAsset = CurrencyUtils.normalizeCurrencyCode(baseAsset)
		quoteAsset = CurrencyUtils.normalizeCurrencyCode(quoteAsset)

		this.push({
			baseAsset: baseAsset,
			quoteAsset: quoteAsset,
			baseAmount: chunk.Price,
			quoteAmount: chunk.Quantity,
			sell: chunk.Type.includes('SELL'),
			time: chunk.Closed.getTime(),
			feeAsset: baseAsset,
			feeAmount: chunk.CommissionPaid
		})
	}

	async _transformKraken(chunk) {
		let chunks = this._tradeChunks

		if (chunk.type === 'trade') {
			// Normalize the properties of the chunk.
			chunk = {
				asset: CurrencyUtils.normalizeCurrencyCode(chunk.asset),
				amount: chunk.amount,
				time: chunk.time.getTime(),
				fee: chunk.fee
			}

			// Process two consecutive trade chunks as a single trade.
			chunks.push(chunk)
			if (chunks.length === 2) {
				// Ensure the chunks have the same timestamp.
				if (chunks[0].time !== chunks[1].time)
					console.log('WARNING: Found paired trade chunks with different timestamps.')

				// Determine which chunks represent the base and quote of the currency pair.
				let priorities = chunks.map(c => CurrencyUtils.getCurrencyPriority(c.asset))
				let isCurrencyPairReversed = priorities[0] < priorities[1]
				let baseChunk = chunks[+!isCurrencyPairReversed]
				let quoteChunk = chunks[+isCurrencyPairReversed]

				this.push({
					baseAsset: baseChunk.asset,
					quoteAsset: quoteChunk.asset,
					baseAmount: Math.abs(baseChunk.amount),
					quoteAmount: Math.abs(quoteChunk.amount),
					sell: baseChunk.amount > 0,
					time: baseChunk.time,
					feeAsset: baseChunk.asset,
					feeAmount: baseChunk.fee
				})

				chunks.length = 0
			}
		}
		else if (chunks.length > 0) {
			console.log('WARNING: Found unpaired trade chunk.')
			chunks.length = 0
		}
	}
}

export default function(...args) {
	return new TradeParseStream(...args)
}
