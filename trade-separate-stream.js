'use strict'

import stream from 'stream'
import CurrencyUtils from './currency-utils'

class TradeSeparateStream extends stream.Transform {
	constructor() {
		super({
			objectMode: true
		})
	}

	async _transform(chunk, encoding, callback) {
		let baseChunk = {
			asset: chunk.baseAsset,
			amount: chunk.baseAmount,
			time: chunk.time,
			value: chunk.value,
			fee: 0
		}
		let quoteChunk = {
			asset: chunk.quoteAsset,
			amount: chunk.quoteAmount,
			time: chunk.time,
			value: chunk.value,
			fee: 0
		}

		let chunks = [baseChunk, quoteChunk]

		if (chunk.sell) {
			quoteChunk.amount = -quoteChunk.amount
			quoteChunk.fee = chunk.fee
			chunks.reverse()
		}
		else {
			baseChunk.amount = -baseChunk.amount
			baseChunk.fee = chunk.fee
		}

		// Drop the chunks that represent fiat currencies.
		// TODO: This is questionable.
		for (let i = 0; i < chunks.length; ++i)
			if (CurrencyUtils.getCurrencyPriority(chunks[i].asset) === 0)
				chunks.splice(i--, 1);

		for (let chunk of chunks)
			this.push(chunk)

		callback()
	}
}

export default function(...args) {
	return new TradeSeparateStream(...args)
}
