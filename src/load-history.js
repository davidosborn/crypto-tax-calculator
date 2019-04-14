'use strict'

import fromEntries from 'fromentries'
import fs from 'fs'

/**
 * Loads the historical data from a directory.
 * @param {string} path The directory.
 * @returns {object.<string, array>} The historical data, indexed by asset pair.
 */
function loadHistory(path) {
	return fromEntries(fs.readdirSync(path)
		.filter(function(file) {
			return /[A-Za-z]+-[A-Za-z]+\.json/.test(file)
		})
		.map(function(file) {
			return [
				file.split('.')[0].toUpperCase(),
				JSON.parse(fs.readFileSync(path + '/' + file))
			]
		}))
}

export default loadHistory
