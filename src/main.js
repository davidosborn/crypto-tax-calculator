'use strict'

import csvParse from 'csv-parse'
import fs from 'fs'
import getopts from 'getopts'
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
	let options = getopts(args, {
		alias: {
			f: 'file', // TODO: This is a hack to get around babel-node stealing the -o argument.
			h: 'help',
			m: 'markdown',
			o: 'output'
		},
		boolean: ['h', 'm']
	})

	// TODO: This is a hack to get around babel-node stealing the -o argument.
	options.file = options.file | options.output

	// Handle the "help" option.
	if (options.help || options._.length === 0) {
		fs.createReadStream(__dirname + '/../res/help.txt').pipe(process.stdout)
		return
	}

	console.log(options)

	// Detect the output file as markdown.
	if (!('markdown' in options) && options.output?.endsWith('.md'))
		options.markdown = true

	// Create a stream to calculate the capital gains.
	let stream = multiStream([
		fs.createReadStream(__dirname + '/../res/header.md'),
		mergeSortStream(compareTradeTime,
			options._.map(function(a) {
				return fs.createReadStream(a)
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
	if (!options.markdown)
		stream = stream.pipe(markedStream())

	// Pipe the stream to the output file.
	stream.pipe(options.output ? fs.createWriteStream(options.output) : process.stdout)
}

function compareTradeTime(a, b) {
	return a.time - b.time
}
