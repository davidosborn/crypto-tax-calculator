'use strict'

import getopt, {usage} from '@davidosborn/getopt'
import mergeSortStream from '@davidosborn/merge-sort-stream'
import csvParse from 'csv-parse'
import fs from 'fs'
import multiStream from 'multistream'
import process from 'process'
import sortStream from 'sort-stream2'
import take from 'take-stream'
import utf8 from 'to-utf-8'
import capitalGainsCalculateStream from './capital-gains-calculate-stream'
import capitalGainsFormatStream from './capital-gains-format-stream'
import loadHistory from './load-history'
import markedStream from './marked-stream'
import tradeParseStream from './trade-parse-stream'
import tradeSeparateStream from './trade-separate-stream'
import tradeValueStream from './trade-value-stream'

export default function main(args) {
	// Parse the arguments.
	let opts = getopt(args, {
		options: [
			{
				short: 'h',
				long: 'help',
				description: 'Display this usage information and exit.',
				callback: usage
			},
			{
				short: 'i',
				long: 'history',
				argument: 'path',
				description: 'Read asset histories from the specified directory.'
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
				short: 's',
				long: 'silent',
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
				description: 'Request asset values from the internet.'
			}
		],
		usage: {
			header: 'Crypto Tax Calculator',
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

	// Continue creating the stream.
	stream = multiStream([
		fs.createReadStream(__dirname + '/../res/header.md'),
		stream
			.pipe(tradeValueStream({
				history,
				verbose: !!opts.options.verbose,
				web: !!opts.options.web
			}))
			.pipe(tradeSeparateStream())
			.pipe(capitalGainsCalculateStream())
			.pipe(capitalGainsFormatStream()),
		fs.createReadStream(__dirname + '/../res/footer.md')
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
