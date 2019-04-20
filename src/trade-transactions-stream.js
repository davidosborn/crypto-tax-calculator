'use strict'

import stream from 'stream'
import Assets from './assets'

/**
 * A transaction.
 * @typedef {object} Transaction
 * @property {string} exchange    The exchange on which the transaction was executed.
 * @property {string} asset       The asset.
 * @property {number} amount      The amount of assets.
 * @property {number} value       The value of the transaction, in Canadian dollars.
 * @property {number} time        The time of the transaction, as a UNIX timestamp.
 * @property {string} [feeAsset]  The asset of the transaction fee.
 * @property {number} [feeAmount] The amount of the transaction fee.
 * @property {number} feeValue    The value of the transaction fee, in Canadian dollars.
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
			feeValue: 0
		}
		let quoteChunk = {
			exchange: chunk.exchange,
			asset: chunk.quoteAsset,
			amount: chunk.quoteAmount,
			value: chunk.value,
			time: chunk.time,
			feeValue: 0
		}

		let chunks = [baseChunk, quoteChunk]

		if (chunk.sell) {
			chunks.reverse()
		}

		chunks[0].amount = -chunks[0].amount

		// Drop the chunks that are empty.
		chunks = chunks.filter(function(chunk) {
			return chunk.amount
		})

		// Drop the chunks that represent fiat currencies.
		for (let i = 0; i < chunks.length; ++i)
			if (Assets.getPriority(chunks[i].asset) === 0)
				chunks.splice(i--, 1);

		if (!chunks.length) {
			callback()
			return
		}

		// Set the transaction fee of the disposed asset.
		chunks[0].feeValue = chunk.feeValue

		// Set the transaction fee of the acquired asset.
		chunks[chunks.length - 1].feeAsset = chunk.feeAsset
		chunks[chunks.length - 1].feeAmount = chunk.feeAmount

		for (let chunk of chunks)
			this.push(chunk)

		callback()
	}
}

export default function(...args) {
	return new TradeTransactionsStream(...args)
}
