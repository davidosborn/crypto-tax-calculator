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

		this._amountFormatNoTrailingZeros = new Intl.NumberFormat('en-CA', {
			maximumFractionDigits: 8,
			useGrouping: false
		})

		this._valueFormat = new Intl.NumberFormat('en-CA', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})

		this._valueFormatNoGrouping = new Intl.NumberFormat('en-CA', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
			useGrouping: false
		})
	}

	/**
	 * Formats the capital gains for the user.
	 * @param {CapitalGains} chunk    The capital gains.
	 * @param {string}       encoding The encoding type (always 'Buffer').
	 * @param {function}     callback A callback for when the transformation is complete.
	 */
	_transform(chunk, encoding, callback) {
		// Write the balance that was carried forward from last year.
		if (chunk.forwardByAsset.size) {
			this._pushLine()
			this._pushLine('## Carried forward from last year')
			this._pushLine()
			this._pushLine(markdownTable(
				[[
					'Asset',
					'Balance',
					'Adjusted cost base'
				]]
				.concat(Array.from(chunk.forwardByAsset, ([asset, forward]) => [
					asset,
					this._formatAmount(forward.balance),
					this._formatValue(forward.acb)
				]))))
		}

		// Write the trades.
		this._pushLine()
		this._pushLine('## Trades')
		this._pushLine()
		this._pushLine(markdownTable(
			[[
				'Asset',
				'Units acquired',
				'Value',
				'Balance',
				'Fee',
				'Fee asset',
				'Date',
				'Exchange'
			]]
			.concat(Array.from(chunk.trades, trade => [
				trade.asset,
				this._formatAmount(trade.amount),
				this._formatValue(trade.value),
				this._formatAmount(trade.balance),
				this._formatAmount(trade.feeAmount),
				trade.feeAsset,
				this._formatDate(trade.time),
				trade.exchange
			]))))

		// Sort the assets.
		let ledgerByAsset = Array.from(chunk.ledgerByAsset)
		ledgerByAsset.sort(function(a, b) {
			return a[0].localeCompare(b[0])
		})

		// Write the dispositions.
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

		// Find the assets with dispositions.
		let ledgerByAssetWithDisposition = ledgerByAsset
			.filter(([asset, ledger]) => ledger.dispositions.length)

		// Write the aggregate disposition per asset.
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
			.concat(ledgerByAssetWithDisposition.map(([asset, ledger]) => [
				asset,
				this._formatAmount(ledger.aggregateDisposition.amount),
				this._formatValue(ledger.aggregateDisposition.pod),
				this._formatValue(ledger.aggregateDisposition.acb),
				this._formatValue(ledger.aggregateDisposition.oae),
				this._formatValue(ledger.aggregateDisposition.gain)
			]))))

		// Write the summary per asset.
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

		// Write the summary.
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

		// Find the assets that are carrying a balance.
		let ledgerByAssetWithBalance = ledgerByAsset
			.filter(([asset, ledger]) =>
				ledger.balance < -0.000000005 ||
				ledger.balance >= 0.000000005)

		// Write the balance specification for next year.
		if (ledgerByAssetWithBalance.length) {
			this._pushLine()
			this._pushLine('## Carry forward to the next year')
			this._pushLine()
			this._pushLine('The following specification can be passed to the calculator next year to carry forward this year\'s balance and adjusted cost base.')
			this._pushLine()
			this._pushLine('```')
			this._pushLine('--init=\\')
			for (let [asset, ledger] of ledgerByAssetWithBalance) {
				let last = asset === ledgerByAssetWithBalance[ledgerByAssetWithBalance.length - 1][0]
				let balance = this._amountFormatNoTrailingZeros.format(ledger.balance)
				let acb = this._valueFormatNoGrouping.format(ledger.acb)
				this._pushLine(asset + ':' + balance + ':' + acb + (last ? '' : ',\\'))
			}
			this._pushLine('```')
		}

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
				hour: '2-digit',
				minute: '2-digit',
				month: 'short',
				second: '2-digit',
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
