'use strict'

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
	if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
		fs.createReadStream(__dirname + '/../res/help.txt').pipe(process.stdout)
		return
	}

	multiStream([
		fs.createReadStream(__dirname + '/../res/header.md'),
		mergeSortStream(compareTradeTime,
			args.map(function(a) {
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
		.pipe(markedStream())
		.pipe(process.stdout)
}

function compareTradeTime(a, b) {
	return a.time - b.time
}
