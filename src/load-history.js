'use strict'

import fs from 'fs'

/**
 * Loads the historical data from a directory.
 * @param {string} path The directory.
 * @returns {object.<string, array>} The historical data, indexed by asset pair.
 */
function loadHistory(path) {
	return fs.readdirSync(path)
		.filter(function(file) {
			return /[A-Za-z]+-[A-Za-z]+\.json/.test(file)
		})
		.map(function(file) {
			return [
				file.split('.')[0].toUpperCase(),
				JSON.parse(fs.readFileSync(path + '/' + file))
			]
		})
		.reduce(
			function(obj, [key, value]) {
				obj[key] = value
				return obj
			},
			{})
}

export default loadHistory
