'use strict'

import stream from 'stream'

/**
 * A stream that normalizes the delimiters of a CSV file.
 */
class CsvNormalizeStream extends stream.Transform {
	/**
	 * Initializes a new instance.
	 */
	constructor() {
		super()

		this._delimiter = null
	}

	/**
	 * Normalizes the delimiters of a CSV file.
	 * @param {buffer|string} chunk    The CSV file.
	 * @param {string}        encoding The encoding type.
	 * @param {function}      callback A callback for when the transformation is complete.
	 */
	async _transform(chunk, encoding, callback) {
		let line = chunk.toString().trim()

		// Determine the delimiter from the header.
		if (this._delimiter == null)
			this._delimiter = line.split('\t').length > line.split(',').length ? '\t' : ','

		if (this._delimiter !== ',') {
			// It should be safe to drop the existing commas.
			line = line.replace(/,/g, '')

			// Replace the delimiter with a comma.
			if (this._delimiter === '\t')
				line = line.replace(/\t/g, ',')
			else {
				let i = -1
				while (true) {
					line = line.replace(this._delimiter, ',')
					let j = line.lastIndexOf(',')
					if (j === i)
						break
					i = j
				}
			}
		}

		this.push(line + '\n')
		callback()
	}
}

export default function(...args) {
	return new CsvNormalizeStream(...args)
}
