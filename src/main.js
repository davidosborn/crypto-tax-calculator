'use strict'

import getopt, {usage} from '@davidosborn/getopt'
import mergeSortStream from '@davidosborn/merge-sort-stream'
import csvParse from 'csv-parse'
import fromEntries from 'fromentries'
import fs from 'fs'
import multiStream from 'multistream'
import process from 'process'
import sortStream from 'sort-stream2'
import take from 'take-stream'
import utf8 from 'to-utf-8'
import Assets from './assets'
import capitalGainsCalculateStream from './capital-gains-calculate-stream'
import capitalGainsFormatStream from './capital-gains-format-stream'
import loadHistory from './load-history'
import markedStream from './marked-stream'
import tradeParseStream from './trade-parse-stream'
import tradeTransactionsStream from './trade-transactions-stream'
import tradeValueStream from './trade-value-stream'
import transactionFilterStream from './transaction-filter-stream'

export default function main(args) {
	// Parse the arguments.
	let opts = getopt(args, {
		options: [
			{
				short: 'a',
				long: ['assets', 'asset'],
				argument: 'spec',
				description: 'Only consider the specified assets.'
			},
			{
				short: 'h',
				long: 'help',
				description: 'Display this usage information and exit.',
				callback: usage
			},
			{
				short: 'i',
				long: 'init',
				argument: 'spec',
				description: 'Define the initial balance and ACB of the assets.'
			},
			{
				short: 'm',
				long: 'html',
				description: 'Format the output as HTML instead of Markdown.'
			},
			{
				short: 'o',
				long: 'output',
				argument: 'file',
				description: 'Write the output to the specified file.'
			},
			{
				short: 'q',
				long: 'quiet',
				description: 'Do not produce any output.'
			},
			{
				short: 't',
				long: 'take',
				argument: 'count',
				description: 'Do not process more than the specified number of trades.'
			},
			{
				short: 'v',
				long: 'verbose',
				description: 'Write extra information to the console.'
			},
			{
				short: 'w',
				long: 'web',
				description: 'Request historical asset values from the internet.'
			},
			{
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

	// Parse the initial balance and ACB of each asset to carry it forward from last year.
	let forwardByAsset = null
	if (opts.options.init)
		forwardByAsset = fromEntries(opts.options.init.value.split(',')
			.map(function(spec) {
				let [asset, balance, acb] = spec.split(':')
				return [asset, {
					balance: parseFloat(balance),
					acb: parseFloat(acb)
				}]
			}))

	// Load the historical data.
	let historyPath = opts.options.history?.value ?? __dirname + '/../history'
	let history = historyPath ? loadHistory(historyPath) : null

	// Create a stream to calculate the capital gains.
	// This takes a few steps.
	let stream = mergeSortStream(_compareTradeTime,
		sources.map(function(path) {
			return fs.createReadStream(path)
				.pipe(utf8())
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

	stream = stream
		.pipe(tradeValueStream({
			history,
			verbose: !!opts.options.verbose,
			web: !!opts.options.web
		}))
		.pipe(tradeTransactionsStream())

	// Limit the assets.
	if (opts.options.assets)
		stream = stream.pipe(transactionFilterStream({
			assets: new Set(opts.options.assets.value.split(',').map(Assets.normalizeCode))
		}))

	// Calculate the capital gains.
	stream = multiStream([
		fs.createReadStream(__dirname + '/../res/output_header.md'),
		stream
			.pipe(capitalGainsCalculateStream({
				forwardByAsset
			}))
			.pipe(capitalGainsFormatStream()),
		fs.createReadStream(__dirname + '/../res/output_footer.md')
	])

	// Convert the output from Markdown to HTML.
	if (opts.options.html)
		stream = stream.pipe(markedStream())

	// Pipe the stream to the output file.
	if (!opts.options.silent)
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
