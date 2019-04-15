'use strict'

import stream from 'stream'

/**
 * A stream that filters the transactions.
 */
class TransactionFilterStream extends stream.Transform {
	/**
	 * Initializes a new instance.
	 * @param {object}       [options]        The options.
	 * @param {Set.<string>} [options.assets] The assets to retain.
	 */
	constructor(options) {
		super({
			objectMode: true
		})

		this._options = options
	}

	/**
	 * Filters a transaction.
	 * @param {Transaction} chunk    The transaction.
	 * @param {string}      encoding The encoding type (always 'Buffer').
	 * @param {function}    callback A callback for when the transformation is complete.
	 */
	async _transform(chunk, encoding, callback) {
		if (!this._options.assets || this._options.assets.has(chunk.asset))
			this.push(chunk)

		callback()
	}
}

export default function(...args) {
	return new TransactionFilterStream(...args)
}
