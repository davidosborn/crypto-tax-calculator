'use strict'

import getopt, {usage} from '@davidosborn/getopt'
import csvParse from 'csv-parse'
import fs from 'fs'
import mergeSortStream from 'mergesort-stream2'
import multiStream from 'multistream'
import process from 'process'
import sortStream from 'sort-stream2'
import take from 'take-stream'
import utf8 from 'to-utf-8'
import capitalGainsCalculateStream from './capital-gains-calculate-stream'
import capitalGainsFormatStream from './capital-gains-format-stream'
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
				short: 'm',
				long: 'markdown',
				description: 'Format the output as Markdown instead of HTML.'
			},
			{
				short: 'o',
				long: 'output',
				argument: 'file',
				description: 'Write the output to the specified file.'
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

	// Detect the output file as markdown.
	if (!('markdown' in opts.options) && opts.options.output?.endsWith('.md'))
		opts.options.markdown = true

	// Create a stream to calculate the capital gains.
	let stream = multiStream([
		fs.createReadStream(__dirname + '/../res/header.md'),
		mergeSortStream(compareTradeTime,
			opts.parameters.map(function(a) {
				return fs.createReadStream(a.value)
					.pipe(utf8())
					.pipe(csvParse({
						auto_parse: true,
						auto_parse_date: true,
						columns: true,
						skip_empty_lines: true
					}))
					.pipe(tradeParseStream())
					.pipe(sortStream(compareTradeTime))
			}))
			.pipe(tradeValueStream())
			.pipe(tradeSeparateStream())
			.pipe(capitalGainsCalculateStream())
			.pipe(capitalGainsFormatStream()),
		fs.createReadStream(__dirname + '/../res/footer.md')
	])

	// Convert the results from markdown to HTML.
	if (!opts.options.markdown)
		stream = stream.pipe(markedStream())

	// Pipe the stream to the output file.
	stream.pipe(opts.options.output ? fs.createWriteStream(opts.options.output) : process.stdout)
}

/**
 * Compares trades by their time.
 * @param {Object} a The first trade.
 * @param {Object} b The second trade.
 * @returns {Number} The result.
 */
function compareTradeTime(a, b) {
	return a.time - b.time
}
