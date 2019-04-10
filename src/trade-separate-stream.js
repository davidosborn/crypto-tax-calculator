'use strict'

import stream from 'stream'
import CurrencyUtils from './currency-utils'

/**
 * A transaction.
 * @typedef {object} Transaction
 * @property {string} asset The asset.
 * @property {number} amount The amount of assets.
 * @property {number} time   The time of the transaction, as a UNIX timestamp.
 * @property {number} value  The value of the transaction, in Canadian dollars.
 * @property {number} fee    The transaction fee, in Canadian dollars.
 */

/**
 * A stream that breaks up assets trades into currency transactions.
 */
class TradeSeparateStream extends stream.Transform {
	constructor() {
		super({
			objectMode: true
		})
	}

	/**
	 * Breaks up an asset trade into currency transactions.
	 * @param {Trade}    chunk    The trade.
	 * @param {string}   encoding The encoding type (always 'Buffer').
	 * @param {function} callback A callback for when the transformation is complete.
	 */
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
