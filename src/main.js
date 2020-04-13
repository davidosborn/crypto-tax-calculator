'use strict'

import getopt, {usage} from '@davidosborn/getopt'
import mergeSortStream from '@davidosborn/merge-sort-stream'
import csvParse from 'csv-parse'
import fromEntries from 'fromentries'
import fs from 'fs'
import lineStream from 'line-stream'
import MultiStream from 'multistream'
import process from 'process'
import sortStream from 'sort-stream2'
import take from 'take-stream'
import utf8 from 'to-utf-8'
import Assets from './assets'
import capitalGainsCalculateStream from './capital-gains-calculate-stream'
import capitalGainsFormatStream from './capital-gains-format-stream'
import loadHistory from './load-history'
import markedStream from './marked-stream'
import csvNormalizeStream from './csv-normalize-stream'
import tradeFilterStream from './trade-filter-stream'
import tradeParseStream from './trade-parse-stream'
import tradeTransactionsStream from './trade-transactions-stream'
import tradeValueStream from './trade-value-stream'

export default function main(args) {
	// Parse the arguments.
	let opts = getopt(args, {
		options: [
			{
				short: 'a',
				long: ['assets', 'asset'],
				argument: 'spec',
				description: 'Only consider trades involving the specified assets.'
			}, {
				short: 'h',
				long: 'help',
				description: 'Display this usage information and exit.',
				callback: usage
			}, {
				short: 'i',
				long: 'init',
				argument: 'spec',
				description: 'Define the initial balance and ACB of the assets.'
			}, {
				short: 'm',
				long: 'html',
				description: 'Format the results as HTML instead of Markdown.'
			}, {
				short: 'o',
				long: 'output',
				argument: 'file',
				description: 'Write the results to the specified file.'
			}, {
				short: 'q',
				long: 'quiet',
				description: 'Do not write the results.'
			}, {
				short: 's',
				long: 'show',
				argument: 'spec',
				description: 'Only show the specified assets.'
			}, {
				short: 't',
				long: 'take',
				argument: 'count',
				description: 'Do not process more than the specified number of trades.'
			}, {
				short: 'v',
				long: 'verbose',
				description: 'Write extra information to the console.'
			}, {
				short: 'w',
				long: 'web',
				description: 'Request historical asset values from the internet.'
			}, {
				short: 'y',
				long: 'history',
				argument: 'path',
				description: 'Read historical asset values from the specified directory.'
			}
		],
		usage: {
			footer: fs.readFileSync(__dirname + '/../res/cmdline_footer.txt', 'utf8').replace(/([.,;:])\r?\n([A-Za-z])/g, '$1 $2'),
			header: fs.readFileSync(__dirname + '/../res/cmdline_header.txt', 'utf8').replace(/([.,;:])\r?\n([A-Za-z])/g, '$1 $2'),
			program: 'crypto-tax-calculator',
			spec: '[option]... <csv-file>...'
		},
		callback: function(opts, args, settings) {
			// Show the usage when there is no input.
			if (opts.parameters.length < 1 || !opts.parameters[0].value)
				usage(settings)
		}
	})

	let sources = opts.parameters.map(function(p) {return p.value})
	let destination = opts.options.output?.value

	// Detect the output file as HTML.
	if (!('html' in opts.options) && (destination?.endsWith('.html') || destination?.endsWith('.htm')))
		opts.options.html = true

	// Parse the assets to retain when filtering the trades.
	let assets = undefined
	if (opts.options.assets)
		assets = new Set(opts.options.assets.value.split(',').map(Assets.normalizeCode))

	// Parse the assets to show when filtering the results.
	let show = undefined
	if (opts.options.show)
		show = new Set(opts.options.show.value.split(',').map(Assets.normalizeCode))

	// Parse the initial balance and ACB of each asset to carry it forward from last year.
	let forwardByAsset = undefined
	if (opts.options.init) {
		forwardByAsset = new Map(opts.options.init.value.split(',')
			.map(function(spec) {
				let [asset, balance, acb] = spec.split(':')
				return [asset, {
					balance: parseFloat(balance),
					acb: acb != null ? parseFloat(acb) : 0
				}]
			}))
	}

	// Load the historical data.
	let historyPath = opts.options.history?.value ?? __dirname + '/../history'
	let history = historyPath ? loadHistory(historyPath) : null

	// Create a stream to calculate the capital gains.
	// This takes a few steps.
	let stream = mergeSortStream(_compareTradeTime,
		sources.map(function(path) {
			return fs.createReadStream(path)
				.pipe(utf8())
				.pipe(lineStream('\n'))
				.pipe(csvNormalizeStream())
				.pipe(csvParse({
					columns: true,
					skip_empty_lines: true
				}))
				.pipe(tradeParseStream())
				.pipe(sortStream(_compareTradeTime))
		}))

	// Limit the number of trades.
	if (opts.options.take)
		stream = stream.pipe(take(parseInt(opts.options.take.value)))

	// Filter the trades by their assets.
	if (assets)
		stream = stream.pipe(tradeFilterStream({
			assets
		}))

	// Calculate the capital gains.
	stream = new MultiStream([
		fs.createReadStream(__dirname + '/../res/output_header.md'),
		stream
			.pipe(tradeValueStream({
				history,
				verbose: !!opts.options.verbose,
				web: !!opts.options.web
			}))
			.pipe(tradeTransactionsStream())
			.pipe(capitalGainsCalculateStream({
				assets,
				forwardByAsset
			}))
			.pipe(capitalGainsFormatStream({
				assets: show
			})),
		fs.createReadStream(__dirname + '/../res/output_footer.md')
	])

	// Convert the output from Markdown to HTML.
	if (opts.options.html)
		stream = stream.pipe(markedStream())

	// Pipe the stream to the output file.
	if (!opts.options.quiet)
		stream.pipe(destination ? fs.createWriteStream(destination) : process.stdout)
}

/**
 * Compares trades by their time.
 * @param {object} a The first trade.
 * @param {object} b The second trade.
 * @returns {number} The result.
 */
function _compareTradeTime(a, b) {
	return a.time - b.time
}
