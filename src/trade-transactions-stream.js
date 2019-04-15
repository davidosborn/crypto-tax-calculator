'use strict'

import stream from 'stream'
import Assets from './assets'

/**
 * A transaction.
 * @typedef {object} Transaction
 * @property {string} exchange The exchange on which the transaction was executed.
 * @property {string} asset    The asset.
 * @property {number} amount   The amount of assets.
 * @property {number} value    The value of the transaction, in Canadian dollars.
 * @property {number} time     The time of the transaction, as a UNIX timestamp.
 * @property {string} feeAsset  The currency of the transaction fee.
 * @property {number} feeAmount The amount of the transaction fee.
 * @property {number} feeValue The value of the transaction fee, in Canadian dollars.
 */

/**
 * A stream that breaks up assets trades into currency transactions.
 */
class TradeTransactionsStream extends stream.Transform {
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
			exchange: chunk.exchange,
			asset: chunk.baseAsset,
			amount: chunk.baseAmount,
			value: chunk.value,
			time: chunk.time,
			feeAsset: chunk.baseAsset,
			feeAmount: 0,
			feeValue: 0
		}
		let quoteChunk = {
			exchange: chunk.exchange,
			asset: chunk.quoteAsset,
			amount: chunk.quoteAmount,
			value: chunk.value,
			time: chunk.time,
			feeAsset: chunk.quoteAsset,
			feeAmount: 0,
			feeValue: 0
		}

		let chunks = [baseChunk, quoteChunk]

		if (chunk.sell) {
			quoteChunk.amount = -quoteChunk.amount
			chunks.reverse()
		}
		else {
			baseChunk.amount = -baseChunk.amount
		}

		// Copy the fee.
		if (chunk.sell) {
			quoteChunk.feeAsset = chunk.feeAsset
			quoteChunk.feeAmount = chunk.feeAmount
			quoteChunk.feeValue = chunk.feeValue
		}
		else {
			baseChunk.feeAsset = chunk.feeAsset
			baseChunk.feeAmount = chunk.feeAmount
			baseChunk.feeValue = chunk.feeValue
		}

		// Drop the chunks that represent fiat currencies.
		for (let i = 0; i < chunks.length; ++i)
			if (Assets.getPriority(chunks[i].asset) === 0)
				chunks.splice(i--, 1);

		for (let chunk of chunks)
			this.push(chunk)

		callback()
	}
}

export default function(...args) {
	return new TradeTransactionsStream(...args)
}
