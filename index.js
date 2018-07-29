'use strict'

const process = require('process')

/**
 * Loads the entry point of the application.
 * @returns {Function} The entry point.
 */
function requireMain() {
	if (!'development'.localeCompare(process.env.NODE_ENV, {sensitivity: 'base'})) {
		try {
			return require('./lib/main')
		}
		catch (e) {
			if (e.code !== 'MODULE_NOT_FOUND')
				throw e;
		}
	}

	require('@babel/register')
	return require('./src/main')
}

const main = requireMain().default
exports.default = main(process.argv.slice(2))
