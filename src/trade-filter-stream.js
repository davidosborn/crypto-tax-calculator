'use strict'

import stream from 'stream'

/**
 * A stream that filters the trades by their assets.
 */
class TradeFilterStream extends stream.Transform {
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
	 * Filters a trade by its assets.
	 * @param {Trade}    chunk    The trade.
	 * @param {string}   encoding The encoding type (always 'Buffer').
	 * @param {function} callback A callback for when the transformation is complete.
	 */
	async _transform(chunk, encoding, callback) {
		if (!this._options.assets
			|| this._options.assets.has(chunk.baseAsset)
			|| this._options.assets.has(chunk.quoteAsset))
			this.push(chunk)

		callback()
	}
}

export default function(...args) {
	return new TradeFilterStream(...args)
}
