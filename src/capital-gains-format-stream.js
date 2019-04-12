'use strict'

import markdownTable from 'markdown-table'
import marked from 'marked'
import stream from 'stream'

/**
 * A stream that formats the capital gains for the user.
 */
class CapitalGainsFormatStream extends stream.Transform {
	constructor() {
		super({
			writableObjectMode: true
		})

		this._amountFormat = new Intl.NumberFormat('en-CA', {
			minimumFractionDigits: 8,
			maximumFractionDigits: 8,
			useGrouping: false
		})

		this._valueFormat = new Intl.NumberFormat('en-CA', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})
	}

	/**
	 * Formats the capital gains for the user.
	 * @param {CapitalGains} chunk    The capital gains.
	 * @param {string}       encoding The encoding type (always 'Buffer').
	 * @param {function}     callback A callback for when the transformation is complete.
	 */
	_transform(chunk, encoding, callback) {
		this._pushLine()
		this._pushLine('## Trades')
		this._pushLine()
		this._pushLine(markdownTable(
			[[
				'Asset',
				'Units acquired (or disposed)',
				'Value',
				'Fee',
				'Date',
				'Exchange'
			]]
			.concat(Array.from(chunk.trades, trade => [
				trade.asset,
				this._formatAmount(trade.amount),
				this._formatValue(trade.value),
				this._formatValue(trade.fee),
				this._formatDate(trade.time),
				trade.exchange
			]))))

		// Sort the assets.
		let ledgerByAsset = Array.from(chunk.ledgerByAsset)
		ledgerByAsset.sort(function(a, b) {
			return a[0].localeCompare(b[0])
		})

		this._pushLine()
		this._pushLine('## Dispositions')
		this._pushLine()
		this._pushLine(markdownTable(
			[[
				'Asset',
				'Units',
				'Proceeds of disposition',
				'Adjusted cost base',
				'Outlays and expenses',
				'Gain (or loss)',
				'Date',
				'Exchange'
			]]
			.concat(...ledgerByAsset.map(([asset, ledger]) =>
				Array.from(ledger.dispositions, disposition => [
					asset,
					this._formatAmount(disposition.amount),
					this._formatValue(disposition.pod),
					this._formatValue(disposition.acb),
					this._formatValue(disposition.oae),
					this._formatValue(disposition.gain),
					this._formatDate(disposition.time),
					disposition.exchange
				])
			))))

		this._pushLine()
		this._pushLine('## Aggregate disposition per asset')
		this._pushLine()
		this._pushLine(markdownTable(
			[[
				'Asset',
				'Units',
				'Proceeds of disposition',
				'Adjusted cost base',
				'Outlays and expenses',
				'Gain (or loss)'
			]]
			.concat(ledgerByAsset.map(([asset, ledger]) => [
				asset,
				this._formatAmount(ledger.aggregateDisposition.amount),
				this._formatValue(ledger.aggregateDisposition.pod),
				this._formatValue(ledger.aggregateDisposition.acb),
				this._formatValue(ledger.aggregateDisposition.oae),
				this._formatValue(ledger.aggregateDisposition.gain)
			]))))

		this._pushLine()
		this._pushLine('## Summary per asset')
		this._pushLine()
		this._pushLine(markdownTable(
			[[
				'Asset',
				'Gain (or loss)',
				'Balance',
				'Adjusted cost base',
			]]
			.concat(ledgerByAsset.map(([asset, ledger]) => [
				asset,
				this._formatValue(ledger.aggregateDisposition.gain),
				this._formatAmount(ledger.balance),
				this._formatValue(ledger.acb)
			]))))

		this._pushLine()
		this._pushLine('## Summary')
		this._pushLine()
		this._pushLine(markdownTable([
			['Field', 'Value'],
			['Total proceeds of disposition', this._formatValue(chunk.aggregateDisposition.pod)],
			['Total adjusted cost base',      this._formatValue(chunk.aggregateDisposition.acb)],
			['Total outlays and expenses',    this._formatValue(chunk.aggregateDisposition.oae)],
			['Total gain (or loss)',          this._formatValue(chunk.aggregateDisposition.gain)],
			['Taxable gain (or loss)',        `**${this._formatValue(chunk.taxableGain)}**`]
		]))
		this._pushLine()

		callback()
	}

	_formatAmount(amount) {
		let amountString = this._amountFormat.format(Math.abs(amount))
		if (amount < -0.000000005)
			amountString = `(${amountString})`
		return amountString
	}

	_formatValue(value) {
		let valueString = this._valueFormat.format(Math.abs(value))
		if (value < -0.005)
			valueString = `(${valueString})`
		return '$' + valueString
	}

	_formatDate(time) {
		return new Date(time)
			.toLocaleDateString('en-CA', {
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			})
	}

	_pushLine(line) {
		this.push(line)
		this.push('\n')
	}
}

export default function(...args) {
	return new CapitalGainsFormatStream(...args)
}
